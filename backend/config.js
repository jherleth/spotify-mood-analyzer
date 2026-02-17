require("dotenv").config();

const required = ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "REDIRECT_URI", "FRONTEND_URI"];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
	throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

const config = {
	spotify: {
		clientId: process.env.SPOTIFY_CLIENT_ID,
		clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
		redirectUri: process.env.REDIRECT_URI,
		authUrl: "https://accounts.spotify.com/authorize",
		tokenUrl: "https://accounts.spotify.com/api/token",
		scopes: "user-read-private user-read-email playlist-read-private",
	},
	gemini: {
		apiKey: process.env.GEMINI_API_KEY || null,
	},
	server: {
		port: parseInt(process.env.PORT, 10) || 8000,
		frontendUri: process.env.FRONTEND_URI,
	},
	analysis: {
		maxTracks: parseInt(process.env.MAX_TRACKS, 10) || 50,
		concurrency: parseInt(process.env.API_CONCURRENCY, 10) || 3,
	},
	cache: {
		maxSize: parseInt(process.env.CACHE_MAX_SIZE, 10) || 5000,
		defaultTtlSeconds: parseInt(process.env.CACHE_TTL, 10) || 86400,
	},
};

module.exports = config;
