const express = require("express");
const pLimit = require("p-limit");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Cache, withCache } = require("../lib/cache");
const { fetchWithRetry } = require("../lib/http");
const { saveAnalysis } = require("../lib/db");
const logger = require("../lib/logger");
const config = require("../config");

const router = express.Router();

const genAI = config.gemini.apiKey ? new GoogleGenerativeAI(config.gemini.apiKey) : null;

const cache = new Cache({
	maxSize: config.cache.maxSize,
	defaultTtlSeconds: config.cache.defaultTtlSeconds,
});

// --- mood classifier based on AcousticBrainz features ---
function classifyMood(features) {
	if (!features || features.length === 0) return "Unknown";

	const avg = (key) => features.reduce((s, f) => s + (f[key] ?? 0), 0) / features.length;

	const dance = avg("danceability");
	const mood = avg("mood");
	const tempo = avg("tempo");
	const party = avg("party");
	const aggressive = avg("aggressive");

	if (aggressive > 0.65) return "Dark & Intense";
	if (party > 0.70) return "High Voltage Party";
	if (dance > 0.65 && mood > 0.65) return "Energetic & Happy";
	if (mood < 0.35) return "Sad & Melancholic";
	if (tempo > 135 && aggressive > 0.3) return "Fast & Intense";
	if (dance > 0.7) return "Groovy & Laid Back";
	if (dance < 0.4 && tempo < 100) return "Chill & Atmospheric";

	return "Calm & Reflective";
}

// --- helper: find MusicBrainz ID for a track ---
async function fetchMBID(trackName, artistName, isrc) {
	const query = isrc
		? `isrc:${isrc}`
		: `recording:${encodeURIComponent(trackName)}%20AND%20artist:${encodeURIComponent(artistName)}`;

	const url = `https://musicbrainz.org/ws/2/recording/?query=${query}&fmt=json&limit=1`;

	const res = await fetchWithRetry(url, {
		headers: { "User-Agent": "MoodAnalyzer/1.0 (https://github.com/jherleth/spotify-mood-analyzer)" },
	});
	const data = await res.json();
	return data.recordings?.[0]?.id || null;
}

// --- helper: get AcousticBrainz features ---
async function fetchAcousticBrainz(mbid) {
	const highLevelUrl = `https://acousticbrainz.org/${mbid}/high-level`;
	const lowLevelUrl = `https://acousticbrainz.org/${mbid}/low-level`;

	const [highRes, lowRes] = await Promise.all([
		fetchWithRetry(highLevelUrl).catch(() => null),
		fetchWithRetry(lowLevelUrl).catch(() => null),
	]);

	let danceability = 0;
	let mood = 0;
	let tempo = 0;
	let party = 0;
	let aggressive = 0;

	if (highRes?.ok) {
		const highData = await highRes.json();
		danceability = highData.highlevel?.danceability?.all?.danceable ?? 0;
		mood = highData.highlevel?.mood_happy?.all?.happy ?? 0;
		party = highData.highlevel?.mood_party?.all?.party ?? 0;
		aggressive = highData.highlevel?.mood_aggressive?.all?.aggressive ?? 0;
	}

	if (lowRes?.ok) {
		const lowData = await lowRes.json();
		tempo = lowData.rhythm?.bpm ?? 0;
	}

	if (!highRes?.ok && !lowRes?.ok) return null;

	return { danceability, mood, tempo, party, aggressive };
}

// --- analyze route ---
router.get("/analyze", async (req, res) => {
	const { playlistID, access_token } = req.query;

	if (!playlistID || !access_token) {
		return res.status(400).json({ error: "Missing playlistID or access_token" });
	}

	const requestLog = logger.child({ playlistId: playlistID });
	const startTime = Date.now();

	try {
		// 1. get playlist tracks from Spotify
		const playlistRes = await fetchWithRetry(
			`https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistID)}/tracks?limit=${config.analysis.maxTracks}`,
			{ headers: { Authorization: `Bearer ${access_token}` } }
		);
		const playlistData = await playlistRes.json();
		if (!playlistData.items) {
			throw new Error("Failed to fetch playlist tracks from Spotify");
		}

		const tracksToAnalyze = playlistData.items.slice(0, config.analysis.maxTracks);
		requestLog.info("Starting analysis", { trackCount: tracksToAnalyze.length });

		// 2. map Spotify tracks -> MusicBrainz MBIDs -> AcousticBrainz features
		const limit = pLimit(config.analysis.concurrency);

		const enrichmentPromises = tracksToAnalyze.map((item) => {
			return limit(async () => {
				const track = item.track;
				if (!track) return null;

				const artistName = track.artists?.[0]?.name || "Unknown";
				const isrc = track.external_ids?.isrc;

				const cacheKey = isrc
					? `track:isrc:${isrc}`
					: `track:${track.name}:${artistName}`.toLowerCase().replace(/\s/g, "_");

				let mbid;
				try {
					mbid = await withCache(cache, cacheKey, config.cache.defaultTtlSeconds, () =>
						fetchMBID(track.name, artistName, isrc)
					);
				} catch (err) {
					requestLog.debug("MBID lookup failed", { track: track.name, error: err.message });
					return null;
				}

				let features = null;
				if (mbid) {
					try {
						features = await withCache(cache, `features:${mbid}`, config.cache.defaultTtlSeconds, () =>
							fetchAcousticBrainz(mbid)
						);
					} catch (err) {
						requestLog.debug("AcousticBrainz fetch failed", { mbid, error: err.message });
					}
				}

				return {
					trackName: track.name,
					artistName,
					isrc: isrc || null,
					mbid: mbid || null,
					...(features || {}),
					hasFeatures: features !== null,
				};
			});
		});

		const results = await Promise.all(enrichmentPromises);
		const allTracks = results.filter((t) => t !== null);
		const tracksWithFeatures = allTracks.filter((t) => t.hasFeatures);
		const features = tracksWithFeatures.map(({ danceability, mood, tempo, party, aggressive }) => ({
			danceability,
			mood,
			tempo,
			party,
			aggressive,
		}));

		if (!features.length) {
			return res.status(400).json({
				error: "No analyzable tracks found",
				details: "Could not retrieve features from AcousticBrainz for this playlist",
			});
		}

		// 3. build summary
		const summary = {
			avgDanceability: features.reduce((s, f) => s + f.danceability, 0) / features.length,
			avgMood: features.reduce((s, f) => s + f.mood, 0) / features.length,
			avgTempo: features.reduce((s, f) => s + f.tempo, 0) / features.length,
			avgParty: features.reduce((s, f) => s + (f.party ?? 0), 0) / features.length,
			avgAggressive: features.reduce((s, f) => s + (f.aggressive ?? 0), 0) / features.length,
		};

		summary.mood = classifyMood(features);
		summary.tracksAnalyzed = tracksWithFeatures.length;
		summary.tracksTotal = tracksToAnalyze.length;
		summary.tracks = allTracks;

		// 4. generate AI description
		let aiDescription = null;
		if (genAI) {
			try {
				const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
				const prompt = `Given this playlist's features:
        - Avg Danceability: ${summary.avgDanceability.toFixed(2)}
        - Avg Mood (happy): ${summary.avgMood.toFixed(2)}
        - Avg Tempo: ${summary.avgTempo.toFixed(1)}
      Write a short (1-2 sentence) description of the playlist's mood and vibe.`;
				const result = await model.generateContent(prompt);
				aiDescription = result.response.text();
			} catch (err) {
				requestLog.warn("Gemini API failed, skipping AI description", { error: err.message });
			}
		}
		summary.aiDescription = aiDescription;

		// 5. persist to database
		try {
			const analysisId = saveAnalysis({
				playlistId: playlistID,
				playlistName: req.query.playlistName || null,
				mood: summary.mood,
				aiDescription,
				avgDanceability: summary.avgDanceability,
				avgMood: summary.avgMood,
				avgTempo: summary.avgTempo,
				avgParty: summary.avgParty,
				avgAggressive: summary.avgAggressive,
				tracksAnalyzed: summary.tracksAnalyzed,
				tracksTotal: summary.tracksTotal,
				tracks: allTracks,
			});
			summary.analysisId = analysisId;
		} catch (err) {
			requestLog.warn("Failed to persist analysis", { error: err.message });
		}

		const durationMs = Date.now() - startTime;
		requestLog.info("Analysis complete", {
			mood: summary.mood,
			tracksAnalyzed: summary.tracksAnalyzed,
			durationMs,
		});

		res.json(summary);
	} catch (err) {
		requestLog.error("Analysis failed", { error: err.message, stack: err.stack });
		res.status(500).json({
			error: "Failed to analyze playlist",
			details: err.message,
		});
	}
});

// GET /api/cache/stats — cache health check
router.get("/cache/stats", (req, res) => {
	res.json(cache.stats());
});

// Export for testing
module.exports = router;
module.exports._testExports = { classifyMood, fetchMBID, fetchAcousticBrainz, cache };
