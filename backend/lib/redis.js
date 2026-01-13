// Simple in-memory cache replacement for Redis
// Since we are running locally/single instance, this is sufficient and much more reliable than a broken Redis connection.

const cache = new Map();

/**
 * Helper to get value from cache or fetch it if missing
 * @param {string} key - Cache key
 * @param {number} ttlSeconds - Time to live in seconds (ignored for simple in-memory, but kept for API compatibility)
 * @param {Function} fetchFn - Async function to fetch data if cache miss
 */
async function withCache(key, ttlSeconds, fetchFn) {
    if (cache.has(key)) {
        // console.log(`[CACHE HIT] ${key}`);
        return cache.get(key);
    }

    // console.log(`[CACHE MISS] ${key}`);
    try {
        const data = await fetchFn();
        if (data !== null && data !== undefined) {
            cache.set(key, data);
        }
        return data;
    } catch (err) {
        console.error(`Error processing cache for key ${key}:`, err);
        return null;
    }
}

module.exports = { withCache };