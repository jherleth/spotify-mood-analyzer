/**
 * In-memory cache with TTL expiration and LRU eviction.
 * No external dependencies — demonstrates understanding of cache internals.
 */
class Cache {
	constructor({ maxSize = 5000, defaultTtlSeconds = 86400 } = {}) {
		this._store = new Map(); // key -> { value, expiresAt }
		this._maxSize = maxSize;
		this._defaultTtl = defaultTtlSeconds * 1000;
	}

	get(key) {
		const entry = this._store.get(key);
		if (!entry) return undefined;

		if (Date.now() > entry.expiresAt) {
			this._store.delete(key);
			return undefined;
		}

		// LRU: move to end (most recently used)
		this._store.delete(key);
		this._store.set(key, entry);
		return entry.value;
	}

	set(key, value, ttlSeconds) {
		// If at capacity, evict oldest (first) entry
		if (this._store.size >= this._maxSize && !this._store.has(key)) {
			const oldestKey = this._store.keys().next().value;
			this._store.delete(oldestKey);
		}

		const ttlMs = (ttlSeconds ?? this._defaultTtl / 1000) * 1000;
		this._store.set(key, {
			value,
			expiresAt: Date.now() + ttlMs,
		});
	}

	has(key) {
		return this.get(key) !== undefined;
	}

	delete(key) {
		return this._store.delete(key);
	}

	clear() {
		this._store.clear();
	}

	get size() {
		// Purge expired entries on size check
		this._evictExpired();
		return this._store.size;
	}

	stats() {
		this._evictExpired();
		return {
			entries: this._store.size,
			maxSize: this._maxSize,
			utilization: (this._store.size / this._maxSize * 100).toFixed(1) + "%",
		};
	}

	_evictExpired() {
		const now = Date.now();
		for (const [key, entry] of this._store) {
			if (now > entry.expiresAt) {
				this._store.delete(key);
			}
		}
	}
}

/**
 * Cache-through helper: returns cached value or fetches and stores it.
 */
async function withCache(cache, key, ttlSeconds, fetchFn) {
	const cached = cache.get(key);
	if (cached !== undefined) return cached;

	const data = await fetchFn();
	if (data !== null && data !== undefined) {
		cache.set(key, data, ttlSeconds);
	}
	return data;
}

module.exports = { Cache, withCache };
