const { calculateBackoff, parseRetryAfter } = require("../lib/http");

describe("calculateBackoff", () => {
	it("returns a value within expected range", () => {
		// For attempt 0, baseDelay 500: max = 500 * 2^0 = 500
		for (let i = 0; i < 100; i++) {
			const delay = calculateBackoff(0, 500);
			expect(delay).toBeGreaterThanOrEqual(0);
			expect(delay).toBeLessThan(500);
		}
	});

	it("increases max delay with each attempt", () => {
		// Collect many samples to verify the range grows
		const attempt0Max = Math.max(...Array.from({ length: 200 }, () => calculateBackoff(0, 500)));
		const attempt3Max = Math.max(...Array.from({ length: 200 }, () => calculateBackoff(3, 500)));

		// attempt 3 should have much higher max (500 * 2^3 = 4000) vs (500 * 2^0 = 500)
		expect(attempt3Max).toBeGreaterThan(attempt0Max);
	});
});

describe("parseRetryAfter", () => {
	it("returns null for missing header", () => {
		expect(parseRetryAfter(null)).toBeNull();
		expect(parseRetryAfter(undefined)).toBeNull();
	});

	it("parses seconds", () => {
		expect(parseRetryAfter("30")).toBe(30000);
		expect(parseRetryAfter("1")).toBe(1000);
	});

	it("parses HTTP date", () => {
		const future = new Date(Date.now() + 5000);
		const result = parseRetryAfter(future.toUTCString());
		// Should be roughly 5000ms (give or take test execution time)
		expect(result).toBeGreaterThan(3000);
		expect(result).toBeLessThan(7000);
	});
});
