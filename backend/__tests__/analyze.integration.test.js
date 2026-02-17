/**
 * Integration test for the /api/analyze endpoint.
 * Mocks all external APIs (Spotify, MusicBrainz, AcousticBrainz, Gemini)
 * to test the full pipeline without network calls.
 */
const fetch = require("node-fetch");

// Mock node-fetch before requiring the app
jest.mock("node-fetch", () => jest.fn());

// Mock Gemini
jest.mock("@google/generative-ai", () => ({
	GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
		getGenerativeModel: () => ({
			generateContent: jest.fn().mockResolvedValue({
				response: { text: () => "A vibrant, upbeat playlist perfect for dancing." },
			}),
		}),
	})),
}));

// Mock sql.js — provide a minimal in-memory DB that satisfies the schema
jest.mock("sql.js", () => {
	return jest.fn().mockResolvedValue({
		Database: jest.fn().mockImplementation(() => {
			let lastId = 0;
			return {
				run: jest.fn(),
				exec: jest.fn().mockImplementation((sql) => {
					if (sql.includes("last_insert_rowid")) {
						return [{ values: [[++lastId]] }];
					}
					return [];
				}),
				prepare: jest.fn().mockReturnValue({
					run: jest.fn(),
					free: jest.fn(),
				}),
				export: jest.fn().mockReturnValue(new Uint8Array(0)),
				close: jest.fn(),
			};
		}),
	});
});

// Mock fs for db persistence
jest.mock("fs", () => {
	const actual = jest.requireActual("fs");
	return {
		...actual,
		existsSync: jest.fn((p) => {
			if (p.includes("mood_analyzer.db")) return false;
			return actual.existsSync(p);
		}),
		mkdirSync: jest.fn(),
		writeFileSync: jest.fn(),
		readFileSync: actual.readFileSync,
	};
});

const request = require("supertest");

// Set required env vars before requiring app
process.env.SPOTIFY_CLIENT_ID = "test_id";
process.env.SPOTIFY_CLIENT_SECRET = "test_secret";
process.env.REDIRECT_URI = "http://localhost:8000/callback";
process.env.FRONTEND_URI = "http://localhost:5173";
process.env.GEMINI_API_KEY = "test_gemini_key";
process.env.LOG_LEVEL = "error";

const app = require("../index");

function mockResponse(body, status = 200) {
	return Promise.resolve({
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve(body),
		headers: { get: () => null },
	});
}

describe("GET /api/analyze", () => {
	beforeEach(() => {
		fetch.mockReset();
	});

	it("returns 400 when playlistID is missing", async () => {
		const res = await request(app)
			.get("/api/analyze?access_token=tok123")
			.expect(400);

		expect(res.body.error).toBe("Missing playlistID or access_token");
	});

	it("returns 400 when access_token is missing", async () => {
		const res = await request(app)
			.get("/api/analyze?playlistID=abc123")
			.expect(400);

		expect(res.body.error).toBe("Missing playlistID or access_token");
	});

	it("analyzes a playlist successfully with mocked APIs", async () => {
		const spotifyResponse = {
			items: [
				{
					track: {
						name: "Test Track 1",
						artists: [{ name: "Test Artist" }],
						external_ids: { isrc: "USRC12345678" },
					},
				},
				{
					track: {
						name: "Test Track 2",
						artists: [{ name: "Another Artist" }],
						external_ids: { isrc: "USRC87654321" },
					},
				},
			],
		};

		const mbResponse = { recordings: [{ id: "mb-id-123" }] };

		const abHighLevel = {
			highlevel: {
				danceability: { all: { danceable: 0.8 } },
				mood_happy: { all: { happy: 0.75 } },
				mood_party: { all: { party: 0.6 } },
				mood_aggressive: { all: { aggressive: 0.2 } },
			},
		};
		const abLowLevel = { rhythm: { bpm: 125 } };

		fetch.mockImplementation((url) => {
			if (url.includes("api.spotify.com")) return mockResponse(spotifyResponse);
			if (url.includes("musicbrainz.org")) return mockResponse(mbResponse);
			if (url.includes("acousticbrainz.org") && url.includes("high-level"))
				return mockResponse(abHighLevel);
			if (url.includes("acousticbrainz.org") && url.includes("low-level"))
				return mockResponse(abLowLevel);
			return mockResponse({}, 404);
		});

		const res = await request(app)
			.get("/api/analyze?playlistID=playlist123&access_token=tok123")
			.expect(200);

		expect(res.body.mood).toBeDefined();
		expect(res.body.avgDanceability).toBeCloseTo(0.8, 1);
		expect(res.body.avgMood).toBeCloseTo(0.75, 1);
		expect(res.body.avgTempo).toBeCloseTo(125, 0);
		expect(res.body.tracksAnalyzed).toBe(2);
		expect(res.body.aiDescription).toBe("A vibrant, upbeat playlist perfect for dancing.");
		expect(res.body.tracks).toHaveLength(2);
	});

	it("returns 400 when no tracks have AcousticBrainz data", async () => {
		const spotifyResponse = {
			items: [
				{
					track: {
						name: "Obscure Track",
						artists: [{ name: "Unknown" }],
						external_ids: {},
					},
				},
			],
		};

		const mbResponse = { recordings: [] };

		fetch.mockImplementation((url) => {
			if (url.includes("api.spotify.com")) return mockResponse(spotifyResponse);
			if (url.includes("musicbrainz.org")) return mockResponse(mbResponse);
			return mockResponse({}, 404);
		});

		const res = await request(app)
			.get("/api/analyze?playlistID=playlist456&access_token=tok123")
			.expect(400);

		expect(res.body.error).toBe("No analyzable tracks found");
	});
});

describe("GET /health", () => {
	it("returns ok status", async () => {
		const res = await request(app).get("/health").expect(200);
		expect(res.body.status).toBe("ok");
		expect(res.body.uptime).toBeDefined();
	});
});
