const express = require("express");
const fetch = require("node-fetch");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- mood classifier based on AcousticBrainz features ---
function classifyMood(features) {
	const avgDanceability =
		features.reduce((s, f) => s + (f.danceability ?? 0), 0) / features.length;
	const avgMood =
		features.reduce((s, f) => s + (f.mood ?? 0), 0) / features.length;
	const avgTempo =
		features.reduce((s, f) => s + (f.tempo ?? 0), 0) / features.length;

	if (avgDanceability > 0.6 && avgMood > 0.6) return "Energetic / Happy";
	if (avgDanceability > 0.6 && avgMood <= 0.6) return "Chill / Groovy";
	if (avgMood < 0.4) return "Sad / Low Energy";
	if (avgTempo > 120) return "Fast / Intense";
	return "Calm / Reflective";
}

// --- helper: find MusicBrainz ID for a track ---
async function fetchMBID(trackName, artistName) {
	const url = `https://musicbrainz.org/ws/2/recording/?query=recording:${encodeURIComponent(
		trackName
	)}%20AND%20artist:${encodeURIComponent(artistName)}&fmt=json&limit=1`;

	const res = await fetch(url, {
		headers: { "User-Agent": "MoodAnalyzer/1.0 (https://github.com/your-repo)" },
	});
	const data = await res.json();
	return data.recordings?.[0]?.id || null;
}

// --- helper: get AcousticBrainz features ---
async function fetchAcousticBrainz(mbid) {
	const url = `https://acousticbrainz.org/${mbid}/high-level`;
	const res = await fetch(url);
	if (!res.ok) return null;
	const data = await res.json();

	return {
		danceability: data.highlevel?.danceability?.all?.danceable ?? 0,
		mood: data.highlevel?.mood_happy?.all?.happy ?? 0,
		tempo: data.rhythm?.bpm ?? 0,
	};
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
		const features = [];
		for (const item of playlistData.items.slice(0, 20)) {
			// limit for speed
			const track = item.track;
			if (!track || !track.name || !track.artists?.length) continue;

			const artistName = track.artists[0].name;
			const mbid = await fetchMBID(track.name, artistName);
			if (!mbid) continue;

			const abFeatures = await fetchAcousticBrainz(mbid);
			if (abFeatures) features.push(abFeatures);
		}

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
