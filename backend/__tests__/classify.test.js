const { _testExports } = require("../routes/analyze");
const { classifyMood } = _testExports;

describe("classifyMood", () => {
	it("returns 'Unknown' for empty features", () => {
		expect(classifyMood([])).toBe("Unknown");
		expect(classifyMood(null)).toBe("Unknown");
	});

	it("classifies 'Dark & Intense' when aggressive > 0.65", () => {
		const features = [{ danceability: 0.5, mood: 0.5, tempo: 120, party: 0.3, aggressive: 0.8 }];
		expect(classifyMood(features)).toBe("Dark & Intense");
	});

	it("classifies 'High Voltage Party' when party > 0.70", () => {
		const features = [{ danceability: 0.5, mood: 0.5, tempo: 120, party: 0.85, aggressive: 0.2 }];
		expect(classifyMood(features)).toBe("High Voltage Party");
	});

	it("classifies 'Energetic & Happy' when dance > 0.65 and mood > 0.65", () => {
		const features = [{ danceability: 0.8, mood: 0.8, tempo: 120, party: 0.3, aggressive: 0.2 }];
		expect(classifyMood(features)).toBe("Energetic & Happy");
	});

	it("classifies 'Sad & Melancholic' when mood < 0.35", () => {
		const features = [{ danceability: 0.5, mood: 0.2, tempo: 120, party: 0.3, aggressive: 0.2 }];
		expect(classifyMood(features)).toBe("Sad & Melancholic");
	});

	it("classifies 'Fast & Intense' when tempo > 135 and aggressive > 0.3", () => {
		const features = [{ danceability: 0.5, mood: 0.5, tempo: 160, party: 0.3, aggressive: 0.4 }];
		expect(classifyMood(features)).toBe("Fast & Intense");
	});

	it("classifies 'Groovy & Laid Back' when dance > 0.7", () => {
		const features = [{ danceability: 0.75, mood: 0.5, tempo: 100, party: 0.3, aggressive: 0.2 }];
		expect(classifyMood(features)).toBe("Groovy & Laid Back");
	});

	it("classifies 'Chill & Atmospheric' when dance < 0.4 and tempo < 100", () => {
		const features = [{ danceability: 0.3, mood: 0.5, tempo: 80, party: 0.3, aggressive: 0.2 }];
		expect(classifyMood(features)).toBe("Chill & Atmospheric");
	});

	it("defaults to 'Calm & Reflective'", () => {
		const features = [{ danceability: 0.5, mood: 0.5, tempo: 110, party: 0.3, aggressive: 0.2 }];
		expect(classifyMood(features)).toBe("Calm & Reflective");
	});

	it("averages across multiple tracks", () => {
		const features = [
			{ danceability: 0.9, mood: 0.9, tempo: 120, party: 0.3, aggressive: 0.1 },
			{ danceability: 0.8, mood: 0.8, tempo: 130, party: 0.2, aggressive: 0.1 },
		];
		// avg dance = 0.85, avg mood = 0.85 → Energetic & Happy
		expect(classifyMood(features)).toBe("Energetic & Happy");
	});

	it("priority: aggressive beats party", () => {
		const features = [{ danceability: 0.5, mood: 0.5, tempo: 120, party: 0.9, aggressive: 0.8 }];
		// Both aggressive > 0.65 and party > 0.70, but aggressive is checked first
		expect(classifyMood(features)).toBe("Dark & Intense");
	});

	it("handles missing properties with nullish coalescing", () => {
		const features = [{ danceability: 0.5, mood: 0.5, tempo: 110 }];
		// party and aggressive undefined → coalesce to 0
		expect(classifyMood(features)).toBe("Calm & Reflective");
	});
});
