const fetch = require("node-fetch");
const logger = require("./logger");

const DEFAULT_TIMEOUT_MS = 10000;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

/**
 * Fetch with automatic retry, exponential backoff + jitter, and timeout.
 *
 * Retries on: network errors, 429 (rate limit), 500/502/503/504 (server errors).
 * Respects Retry-After header from 429 responses.
 */
async function fetchWithRetry(url, options = {}, retryOpts = {}) {
	const {
		maxRetries = MAX_RETRIES,
		baseDelay = BASE_DELAY_MS,
		timeout = DEFAULT_TIMEOUT_MS,
	} = retryOpts;

	let lastError;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), timeout);

			const res = await fetch(url, {
				...options,
				signal: controller.signal,
			});

			clearTimeout(timer);

			// Success — return response
			if (res.ok) return res;

			// Rate limited — respect Retry-After header
			if (res.status === 429) {
				const retryAfter = parseRetryAfter(res.headers.get("Retry-After"));
				const delay = retryAfter || calculateBackoff(attempt, baseDelay);
				logger.warn("Rate limited (429), backing off", {
					url: redactUrl(url),
					attempt,
					delayMs: delay,
				});
				await sleep(delay);
				continue;
			}

			// Server error — retry
			if (res.status >= 500) {
				const delay = calculateBackoff(attempt, baseDelay);
				logger.warn("Server error, retrying", {
					url: redactUrl(url),
					status: res.status,
					attempt,
					delayMs: delay,
				});
				await sleep(delay);
				continue;
			}

			// Client error (4xx, not 429) — don't retry
			return res;
		} catch (err) {
			lastError = err;

			if (attempt < maxRetries) {
				const delay = calculateBackoff(attempt, baseDelay);
				logger.warn("Request failed, retrying", {
					url: redactUrl(url),
					error: err.message,
					attempt,
					delayMs: delay,
				});
				await sleep(delay);
			}
		}
	}

	logger.error("Request failed after all retries", {
		url: redactUrl(url),
		maxRetries,
		error: lastError?.message,
	});
	throw lastError;
}

/**
 * Exponential backoff with full jitter.
 * delay = random(0, baseDelay * 2^attempt)
 */
function calculateBackoff(attempt, baseDelay) {
	const maxDelay = baseDelay * Math.pow(2, attempt);
	return Math.floor(Math.random() * maxDelay);
}

/**
 * Parse Retry-After header (seconds or HTTP date).
 */
function parseRetryAfter(header) {
	if (!header) return null;
	const seconds = Number(header);
	if (!isNaN(seconds)) return seconds * 1000;
	const date = new Date(header);
	if (!isNaN(date.getTime())) return Math.max(0, date.getTime() - Date.now());
	return null;
}

function redactUrl(url) {
	try {
		const u = new URL(url);
		u.searchParams.delete("access_token");
		u.searchParams.delete("key");
		return u.toString();
	} catch {
		return url;
	}
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { fetchWithRetry, calculateBackoff, parseRetryAfter };
