module.exports = {
	testEnvironment: "node",
	testMatch: ["**/__tests__/**/*.test.js"],
	collectCoverageFrom: [
		"lib/**/*.js",
		"routes/**/*.js",
		"config.js",
		"!**/node_modules/**",
	],
	coverageThreshold: {
		global: {
			branches: 50,
			functions: 50,
			lines: 60,
		},
	},
};
