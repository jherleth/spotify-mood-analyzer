const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");
const logger = require("./logger");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "mood_analyzer.db");

let db = null;
let initPromise = null;

async function getDb() {
	if (db) return db;
	if (initPromise) return initPromise;

	initPromise = (async () => {
		const dir = path.dirname(DB_PATH);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		const SQL = await initSqlJs();

		if (fs.existsSync(DB_PATH)) {
			const buffer = fs.readFileSync(DB_PATH);
			db = new SQL.Database(buffer);
		} else {
			db = new SQL.Database();
		}

		migrate(db);
		logger.info("Database initialized", { path: DB_PATH });
		return db;
	})();

	return initPromise;
}

function migrate(db) {
	db.run(`
		CREATE TABLE IF NOT EXISTS analyses (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			playlist_id TEXT NOT NULL,
			playlist_name TEXT,
			mood TEXT NOT NULL,
			ai_description TEXT,
			avg_danceability REAL,
			avg_mood REAL,
			avg_tempo REAL,
			avg_party REAL,
			avg_aggressive REAL,
			tracks_analyzed INTEGER,
			tracks_total INTEGER,
			created_at TEXT DEFAULT (datetime('now'))
		)
	`);

	db.run(`
		CREATE TABLE IF NOT EXISTS track_features (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			analysis_id INTEGER NOT NULL,
			track_name TEXT NOT NULL,
			artist_name TEXT NOT NULL,
			isrc TEXT,
			mbid TEXT,
			danceability REAL,
			mood REAL,
			tempo REAL,
			party REAL,
			aggressive REAL,
			FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
		)
	`);

	// Create indexes if they don't exist
	db.run("CREATE INDEX IF NOT EXISTS idx_analyses_playlist ON analyses(playlist_id)");
	db.run("CREATE INDEX IF NOT EXISTS idx_analyses_created ON analyses(created_at)");
	db.run("CREATE INDEX IF NOT EXISTS idx_track_features_analysis ON track_features(analysis_id)");
}

function persist() {
	if (!db) return;
	const data = db.export();
	const buffer = Buffer.from(data);
	fs.writeFileSync(DB_PATH, buffer);
}

async function saveAnalysis(data) {
	const db = await getDb();

	db.run(
		`INSERT INTO analyses (playlist_id, playlist_name, mood, ai_description,
			avg_danceability, avg_mood, avg_tempo, avg_party, avg_aggressive,
			tracks_analyzed, tracks_total)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			data.playlistId,
			data.playlistName,
			data.mood,
			data.aiDescription,
			data.avgDanceability,
			data.avgMood,
			data.avgTempo,
			data.avgParty,
			data.avgAggressive,
			data.tracksAnalyzed,
			data.tracksTotal,
		]
	);

	const result = db.exec("SELECT last_insert_rowid() as id");
	const analysisId = result[0].values[0][0];

	const stmt = db.prepare(
		`INSERT INTO track_features (analysis_id, track_name, artist_name, isrc, mbid,
			danceability, mood, tempo, party, aggressive)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	);

	for (const track of data.tracks) {
		stmt.run([
			analysisId,
			track.trackName,
			track.artistName,
			track.isrc || null,
			track.mbid || null,
			track.danceability ?? null,
			track.mood ?? null,
			track.tempo ?? null,
			track.party ?? null,
			track.aggressive ?? null,
		]);
	}
	stmt.free();

	persist();
	return analysisId;
}

async function getHistory(limit = 20) {
	const db = await getDb();
	const result = db.exec(
		`SELECT id, playlist_id, playlist_name, mood, tracks_analyzed, tracks_total, created_at
		FROM analyses
		ORDER BY created_at DESC
		LIMIT ?`,
		[limit]
	);

	if (!result.length) return [];
	return result[0].values.map((row) => ({
		id: row[0],
		playlist_id: row[1],
		playlist_name: row[2],
		mood: row[3],
		tracks_analyzed: row[4],
		tracks_total: row[5],
		created_at: row[6],
	}));
}

async function getAnalysisById(id) {
	const db = await getDb();

	const analysisResult = db.exec("SELECT * FROM analyses WHERE id = ?", [id]);
	if (!analysisResult.length || !analysisResult[0].values.length) return null;

	const cols = analysisResult[0].columns;
	const row = analysisResult[0].values[0];
	const analysis = {};
	cols.forEach((col, i) => (analysis[col] = row[i]));

	const trackResult = db.exec("SELECT * FROM track_features WHERE analysis_id = ?", [id]);
	if (trackResult.length) {
		const trackCols = trackResult[0].columns;
		analysis.tracks = trackResult[0].values.map((tRow) => {
			const track = {};
			trackCols.forEach((col, i) => (track[col] = tRow[i]));
			return track;
		});
	} else {
		analysis.tracks = [];
	}

	return analysis;
}

async function getInsights() {
	const db = await getDb();

	const countResult = db.exec("SELECT COUNT(*) FROM analyses");
	const totalAnalyses = countResult[0]?.values[0][0] || 0;

	const trackCountResult = db.exec("SELECT COUNT(*) FROM track_features");
	const totalTracks = trackCountResult[0]?.values[0][0] || 0;

	const moodResult = db.exec(
		"SELECT mood, COUNT(*) as count FROM analyses GROUP BY mood ORDER BY count DESC"
	);
	const moodDistribution = moodResult.length
		? moodResult[0].values.map((r) => ({ mood: r[0], count: r[1] }))
		: [];

	const avgResult = db.exec(`
		SELECT AVG(avg_danceability), AVG(avg_mood), AVG(avg_tempo), AVG(avg_party), AVG(avg_aggressive)
		FROM analyses
	`);
	const globalAverages = avgResult.length
		? {
				danceability: avgResult[0].values[0][0],
				mood: avgResult[0].values[0][1],
				tempo: avgResult[0].values[0][2],
				party: avgResult[0].values[0][3],
				aggressive: avgResult[0].values[0][4],
			}
		: {};

	const trendResult = db.exec(
		"SELECT mood, created_at FROM analyses ORDER BY created_at DESC LIMIT 10"
	);
	const recentTrend = trendResult.length
		? trendResult[0].values.map((r) => ({ mood: r[0], created_at: r[1] }))
		: [];

	return { totalAnalyses, totalTracks, moodDistribution, globalAverages, recentTrend };
}

async function exportCsv() {
	const db = await getDb();
	const result = db.exec(`
		SELECT
			a.playlist_name,
			a.mood as playlist_mood,
			a.created_at,
			t.track_name,
			t.artist_name,
			t.isrc,
			t.danceability,
			t.mood,
			t.tempo,
			t.party,
			t.aggressive
		FROM track_features t
		JOIN analyses a ON t.analysis_id = a.id
		ORDER BY a.created_at DESC, t.id
	`);

	if (!result.length) return "";

	const headers = result[0].columns.join(",");
	const lines = result[0].values.map((row) =>
		row.map((v) => (typeof v === "string" ? `"${v.replace(/"/g, '""')}"` : v ?? "")).join(",")
	);

	return [headers, ...lines].join("\n");
}

function close() {
	if (db) {
		persist();
		db.close();
		db = null;
		initPromise = null;
	}
}

module.exports = { getDb, saveAnalysis, getHistory, getAnalysisById, getInsights, exportCsv, close };
