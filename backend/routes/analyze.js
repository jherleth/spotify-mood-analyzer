const express = require("express");
const fetch = require("node-fetch");
const { default: pLimit } = require('p-limit');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { withCache } = require("../lib/redis");

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- mood classifier based on AcousticBrainz features ---
// --- mood classifier based on AcousticBrainz features ---
function classifyMood(features) {
	if (!features || features.length === 0) return "Unknown";

	const avg = (key) => features.reduce((s, f) => s + (f[key] ?? 0), 0) / features.length;

	const dance = avg('danceability');
	const mood = avg('mood');
	const tempo = avg('tempo');
	const party = avg('party');
	const aggressive = avg('aggressive');

	// Classification Logic 2.0 (Priority Order)
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
// --- helper: find MusicBrainz ID for a track ---
async function fetchMBID(trackName, artistName, isrc) {
	let query = "";
	if (isrc) {
		query = `isrc:${isrc}`;
	} else {
		query = `recording:${encodeURIComponent(trackName)}%20AND%20artist:${encodeURIComponent(artistName)}`;
	}

	const url = `https://musicbrainz.org/ws/2/recording/?query=${query}&fmt=json&limit=1`;

	try {
		const res = await fetch(url, {
			headers: { "User-Agent": "MoodAnalyzer/1.0 (https://github.com/jherleth/spotify-mood-analyzer)" },
		});
		const data = await res.json();
		return data.recordings?.[0]?.id || null;
	} catch (err) {
		console.error(`Error fetching MBID for ${trackName}:`, err.message);
		return null;
	}
}

// --- helper: get AcousticBrainz features ---
async function fetchAcousticBrainz(mbid) {
	const highLevelUrl = `https://acousticbrainz.org/${mbid}/high-level`;
	const lowLevelUrl = `https://acousticbrainz.org/${mbid}/low-level`;

	try {
		const [highRes, lowRes] = await Promise.all([
			fetch(highLevelUrl),
			fetch(lowLevelUrl)
		]);

		let danceability = 0;
		let mood = 0;
		let tempo = 0;
		let party = 0;
		let aggressive = 0;

		if (highRes.ok) {
			const highData = await highRes.json();
			danceability = highData.highlevel?.danceability?.all?.danceable ?? 0;
			mood = highData.highlevel?.mood_happy?.all?.happy ?? 0;
			party = highData.highlevel?.mood_party?.all?.party ?? 0;
			aggressive = highData.highlevel?.mood_aggressive?.all?.aggressive ?? 0;
		}

		if (lowRes.ok) {
			const lowData = await lowRes.json();
			tempo = lowData.rhythm?.bpm ?? 0;
		}

		// If both failed, return null
		if (!highRes.ok && !lowRes.ok) return null;

		return { danceability, mood, tempo, party, aggressive };
	} catch (err) {
		console.error(`Error fetching AB for ${mbid}:`, err.message);
		return null;
	}
}

// --- analyze route ---
router.get("/analyze", async (req, res) => {
	const { playlistID, access_token } = req.query;

	if (!playlistID || !access_token) {
		return res.status(400).json({ error: "Missing playlistID or access_token" });
	}

	try {
		// 1. get playlist tracks from Spotify
		const playlistRes = await fetch(
			`https://api.spotify.com/v1/playlists/${playlistID}/tracks`,
			{ headers: { Authorization: `Bearer ${access_token}` } }
		);
		const playlistData = await playlistRes.json();
		if (!playlistData.items) {
			throw new Error("Failed to fetch playlist tracks from Spotify");
		}

		// 2. map Spotify tracks -> MusicBrainz MBIDs -> AcousticBrainz features
		const limit = pLimit(3); // throttled parallelism -> respect the API (3 req at same time)
		const enrichmentPromises = playlistData.items.slice(0, 20).map((item) => {
			// 20 tracks
			return limit(async () => {
				const track = item.track;
				const artistName = track.artists[0].name;
				const isrc = track.external_ids?.isrc;

				// Prefer ISRC for cache key if available, otherwise fallback to name
				const cacheKey = isrc ? `track:isrc:${isrc}` : `track:${track.name}:${artistName}`.toLowerCase().replace(/\s/g, '_');

				const mbid = await withCache(cacheKey, 86400, () => fetchMBID(track.name, artistName, isrc));

				if (mbid) {
					// Correctly return the result from cache/fetch, instead of trying to push to a non-existent array
					return await withCache(`features:${mbid}`, 86400, () => fetchAcousticBrainz(mbid));
				}

				return null;
			});
		});

		const results = await Promise.all(enrichmentPromises); // parallelism
		const features = results.filter(f => f !== null); // filters null response



		if (!features.length) {
			return res.status(400).json({
				error: "No analyzable tracks found",
				details:
					"Could not retrieve features from AcousticBrainz for this playlist",
			});
		}

		// 3. build summary
		const summary = {
			avgDanceability:
				features.reduce((s, f) => s + f.danceability, 0) / features.length,
			avgMood: features.reduce((s, f) => s + f.mood, 0) / features.length,
			avgTempo: features.reduce((s, f) => s + f.tempo, 0) / features.length,
			avgParty: features.reduce((s, f) => s + (f.party ?? 0), 0) / features.length,
			avgAggressive: features.reduce((s, f) => s + (f.aggressive ?? 0), 0) / features.length,
		};

		summary.mood = classifyMood(features);

		// 4. generate AI description
		const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
		const prompt = `
      Given this playlist’s features:
        - Avg Danceability: ${summary.avgDanceability.toFixed(2)}
        - Avg Mood (happy): ${summary.avgMood.toFixed(2)}
        - Avg Tempo: ${summary.avgTempo.toFixed(1)}
      Write a short (1–2 sentence) description of the playlist’s mood and vibe.
    `;

		const result = await model.generateContent(prompt);
		const aiDescription = result.response.text();

		res.json({ ...summary, aiDescription });
	} catch (err) {
		console.error("❌ Error in /api/analyze:", err);
		res.status(500).json({
			error: "Failed to analyze playlist",
			details: err.message,
		});
	}
});

module.exports = router;
