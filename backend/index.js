const config = require("./config");
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const querystring = require("querystring");
const logger = require("./lib/logger");
const analyzeRouter = require("./routes/analyze");
const insightsRouter = require("./routes/insights");
const { close: closeDb } = require("./lib/db");

const app = express();
app.use(cors({ origin: config.server.frontendUri }));
app.use(express.json());

// --- request logging middleware ---
app.use((req, res, next) => {
	const start = Date.now();
	res.on("finish", () => {
		logger.info("request", {
			method: req.method,
			path: req.path,
			status: res.statusCode,
			durationMs: Date.now() - start,
		});
	});
	next();
});

// --- health check ---
app.get("/health", (req, res) => {
	res.json({ status: "ok", uptime: process.uptime() });
});

// --- Spotify OAuth ---
app.get("/login", (req, res) => {
	const params = querystring.stringify({
		response_type: "code",
		client_id: config.spotify.clientId,
		scope: config.spotify.scopes,
		redirect_uri: config.spotify.redirectUri,
	});
	res.redirect(`${config.spotify.authUrl}?${params}`);
});

app.get("/callback", async (req, res) => {
	const code = req.query.code || null;

	try {
		const response = await axios.post(
			config.spotify.tokenUrl,
			querystring.stringify({
				grant_type: "authorization_code",
				code,
				redirect_uri: config.spotify.redirectUri,
				client_id: config.spotify.clientId,
				client_secret: config.spotify.clientSecret,
			}),
			{ headers: { "Content-Type": "application/x-www-form-urlencoded" } }
		);

		const { access_token, refresh_token } = response.data;

		res.redirect(
			`${config.server.frontendUri}/?${querystring.stringify({
				access_token,
				refresh_token,
			})}`
		);
	} catch (err) {
		logger.error("OAuth callback failed", { error: err.response?.data || err.message });
		res.status(500).send("Error during authentication");
	}
});

app.get("/refresh_token", async (req, res) => {
	const refresh_token = req.query.refresh_token;
	if (!refresh_token) {
		return res.status(400).json({ error: "Missing refresh_token" });
	}

	try {
		const response = await axios.post(
			config.spotify.tokenUrl,
			querystring.stringify({
				grant_type: "refresh_token",
				refresh_token,
				client_id: config.spotify.clientId,
				client_secret: config.spotify.clientSecret,
			}),
			{ headers: { "Content-Type": "application/x-www-form-urlencoded" } }
		);
		res.json(response.data);
	} catch (err) {
		logger.error("Token refresh failed", { error: err.response?.data || err.message });
		res.status(500).json({ error: "Failed to refresh token" });
	}
});

// --- API routes ---
app.use("/api", analyzeRouter);
app.use("/api", insightsRouter);

// --- start server ---
const server = app.listen(config.server.port, () => {
	logger.info("Server started", {
		port: config.server.port,
		maxTracks: config.analysis.maxTracks,
		cacheMaxSize: config.cache.maxSize,
	});
});

// --- graceful shutdown ---
function shutdown(signal) {
	logger.info("Shutting down", { signal });
	server.close(() => {
		closeDb();
		process.exit(0);
	});
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

module.exports = app;
