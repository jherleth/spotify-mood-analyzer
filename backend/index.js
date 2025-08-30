require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const querystring = require("querystring");

const app = express();
app.use(cors());

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

app.get("/login", (req, res) => {
	const scope = "user-read-private user-read-email playlist-read-private"
	const params = querystring.stringify({
		response_type: "code",
		client_id: process.env.SPOTIFY_CLIENT_ID,
		scope,
		redirect_uri: process.env.REDIRECT_URI,
	});
	res.redirect(`${SPOTIFY_AUTH_URL}?${params}`);
});

app.get("/callback", async (req, res) => {
	const code = req.query.code || null;

	try {
		const response = await axios.post(
			SPOTIFY_TOKEN_URL,
			querystring.stringify({
				grant_type: "authorization_code",
				code: code,
				redirect_uri: process.env.REDIRECT_URI,
				client_id: process.env.SPOTIFY_CLIENT_ID,
				client_secret: process.env.SPOTIFY_CLIENT_SECRET,
			}),
			{
				headers: { "Content-Type": "application/x-www-form-urlencoded"},
			}
		);

		const { access_token, refresh_token } = response.data;

		res.redirect(
			`${process.env.FRONTEND_URI}/?${querystring.stringify({
				access_token,
				refresh_token,
			})}`
		);
	} catch (err) {
		console.error("Error getting tokens:", err.response?.data || err.message);
		res.send("Error during authentication");
	}
});

app.get("/refresh_token", async (req, res) => {
	const refresh_token = req.query.refresh_token;
	try {
		const response = await axios.post(
			SPOTIFY_TOKEN_URL,
			querystring.stringify({
				grant_type: "refresh_token",
				refresh_token: refresh_token,
				client_id: process.env.SPOTIFY_CLIENT_ID,
				client_secret: process.env.SPOTIFY_CLIENT_SECRET,
			}),
			{
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
			}
		);
		res.json(response.data);
	} catch (err) {
		console.error("Error refreshing token:", err.response?.data || err.message);
		res.send("Error refreshing token");
	}
});

const PORT = 8000;
app.listen(PORT, () => {
	console.log(`Backend running on http://127.0.0.1:${PORT}`);
});





