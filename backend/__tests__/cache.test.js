const { Cache, withCache } = require("../lib/cache");

describe("Cache", () => {
	let cache;

	beforeEach(() => {
		cache = new Cache({ maxSize: 3, defaultTtlSeconds: 60 });
	});

	it("stores and retrieves values", () => {
		cache.set("key1", "value1");
		expect(cache.get("key1")).toBe("value1");
	});

	it("returns undefined for missing keys", () => {
		expect(cache.get("nonexistent")).toBeUndefined();
	});

	it("expires entries after TTL", () => {
		const now = Date.now();
		jest.spyOn(Date, "now")
			.mockReturnValueOnce(now)       // set
			.mockReturnValueOnce(now + 61000); // get (61s later, past 60s TTL)

		cache.set("key1", "value1", 60);
		expect(cache.get("key1")).toBeUndefined();

		Date.now.mockRestore();
	});

	it("evicts oldest entry when at capacity (LRU)", () => {
		cache.set("a", 1);
		cache.set("b", 2);
		cache.set("c", 3);
		// Cache is full (maxSize=3). Adding 'd' should evict 'a'.
		cache.set("d", 4);

		expect(cache.get("a")).toBeUndefined();
		expect(cache.get("b")).toBe(2);
		expect(cache.get("d")).toBe(4);
	});

	it("refreshes LRU order on get", () => {
		cache.set("a", 1);
		cache.set("b", 2);
		cache.set("c", 3);

		// Access 'a' to make it most recently used
		cache.get("a");

		// Adding 'd' should now evict 'b' (oldest after 'a' was refreshed)
		cache.set("d", 4);

		expect(cache.get("a")).toBe(1);
		expect(cache.get("b")).toBeUndefined();
	});

	it("reports correct stats", () => {
		cache.set("a", 1);
		cache.set("b", 2);
		const stats = cache.stats();
		expect(stats.entries).toBe(2);
		expect(stats.maxSize).toBe(3);
	});

	it("supports delete", () => {
		cache.set("key1", "value1");
		cache.delete("key1");
		expect(cache.get("key1")).toBeUndefined();
	});

	it("supports clear", () => {
		cache.set("a", 1);
		cache.set("b", 2);
		cache.clear();
		expect(cache.size).toBe(0);
	});
});

describe("withCache", () => {
	let cache;

	beforeEach(() => {
		cache = new Cache({ maxSize: 100, defaultTtlSeconds: 60 });
	});

	it("calls fetchFn on cache miss and stores result", async () => {
		const fetchFn = jest.fn().mockResolvedValue("fetched_data");

		const result = await withCache(cache, "key1", 60, fetchFn);

		expect(result).toBe("fetched_data");
		expect(fetchFn).toHaveBeenCalledTimes(1);

		// Second call should hit cache
		const result2 = await withCache(cache, "key1", 60, fetchFn);
		expect(result2).toBe("fetched_data");
		expect(fetchFn).toHaveBeenCalledTimes(1); // not called again
	});

	it("does not cache null values", async () => {
		const fetchFn = jest.fn().mockResolvedValue(null);

		const result = await withCache(cache, "key1", 60, fetchFn);
		expect(result).toBeNull();

		// Should call again since null wasn't cached
		await withCache(cache, "key1", 60, fetchFn);
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});
});
