const express = require("express");
const { getHistory, getAnalysisById, getInsights, exportCsv } = require("../lib/db");
const logger = require("../lib/logger");

const router = express.Router();

// GET /api/history — list past analyses
router.get("/history", async (req, res) => {
	try {
		const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
		const history = await getHistory(limit);
		res.json({ analyses: history, count: history.length });
	} catch (err) {
		logger.error("Failed to fetch history", { error: err.message });
		res.status(500).json({ error: "Failed to fetch analysis history" });
	}
});

// GET /api/history/:id — single analysis with track details
router.get("/history/:id", async (req, res) => {
	try {
		const id = parseInt(req.params.id, 10);
		if (isNaN(id)) return res.status(400).json({ error: "Invalid analysis ID" });

		const analysis = await getAnalysisById(id);
		if (!analysis) return res.status(404).json({ error: "Analysis not found" });

		res.json(analysis);
	} catch (err) {
		logger.error("Failed to fetch analysis", { id: req.params.id, error: err.message });
		res.status(500).json({ error: "Failed to fetch analysis" });
	}
});

// GET /api/insights — aggregate stats
router.get("/insights", async (req, res) => {
	try {
		const insights = await getInsights();
		res.json(insights);
	} catch (err) {
		logger.error("Failed to compute insights", { error: err.message });
		res.status(500).json({ error: "Failed to compute insights" });
	}
});

// GET /api/export — CSV download
router.get("/export", async (req, res) => {
	try {
		const csv = await exportCsv();
		if (!csv) return res.status(404).json({ error: "No data to export" });

		res.setHeader("Content-Type", "text/csv");
		res.setHeader("Content-Disposition", "attachment; filename=mood_analysis_export.csv");
		res.send(csv);
	} catch (err) {
		logger.error("Failed to export CSV", { error: err.message });
		res.status(500).json({ error: "Failed to export data" });
	}
});

module.exports = router;
