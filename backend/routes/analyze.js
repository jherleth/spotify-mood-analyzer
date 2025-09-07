const express = require("express");
const fetch = require("node-fetch");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function classifyMood(features) {
	const avgValence = features.reduce((sum, f) => sum + f.valence, 0) / features.length;
	const avgEnergy = features.reduce((sum, f) => sum + f.energy, 0) / features.length;

	if (avgValence > 0.6 && avgEnergy > 0.6) return "Energetic / Happy";
	if (avgValence > 0.6 && avgEnergy <= 0.6) return "Chill / Positive";
	if (avgValence <= 0.6 && avgEnergy > 0.6) return "Tense / Intense";
	return "Sad / Low Energy";
}

router.get("/analyze", async (req, res) => {
	const { playlistID } = req.query;

	if (!playlistID || !accessToken) {
		return res.status(400).json({ error: "Missing playlistID or access token"});
	}

	try {
		const playlistRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistID}/tracks`, {
			headers: { Authorization: `Bearer ${accessToken}` }
		});
		const playlistData = await playlistRes.json();
		const trackIds = playlistData.items.map(item => item.track.id).filter(Boolean);

		const featuresRes = await fetch(
			`https://api.spotify.com/v1/audio-features?ids=${trackIds.join(",")}`,
			{ headers: { Authorization: `Bearer: ${accessToken}` } }
		);
		const featuresData = await featureRes.json();
		const features = featuresData.audio_features.filter(f => f);

		const summary = {
			avgValence: features.reduce((sum, f) => sum + f.valence, 0) / features.length,
			avgEnergy: features.reduce((sum, f) => sum + f.energy, 0) / features.length,
			avgDanceability: features.reduce((sum, f) => sum + f.danceability, 0) / features.length,
			avgTempo: features.reduce((sum, f) => sum + f.tempo, 0) / features.length,
			mood: classifyMood(features)
		};

		const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
		const prompt = `
			Given this playlist’s features:
      			- Avg Valence: ${summary.avgValence.toFixed(2)}
      			- Avg Energy: ${summary.avgEnergy.toFixed(2)}
      			- Avg Danceability: ${summary.avgDanceability.toFixed(2)}
      			- Avg Tempo: ${summary.avgTempo.toFixed(1)}
      			Write a short (1–2 sentences) description of the playlist’s mood and vibe.
    		`;

		const result = await model.generateContent(prompt);
		const aiDescription = result.response.text();

		res.json({ ...summary, aiDescription});
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "Failed to analyze playlist" });
	}
});

module.exports = router;
