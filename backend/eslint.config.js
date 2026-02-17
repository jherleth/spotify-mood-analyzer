const js = require("@eslint/js");

module.exports = [
	js.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "commonjs",
			globals: {
				require: "readonly",
				module: "readonly",
				exports: "readonly",
				process: "readonly",
				__dirname: "readonly",
				__filename: "readonly",
				console: "readonly",
				setTimeout: "readonly",
				clearTimeout: "readonly",
				setInterval: "readonly",
				Buffer: "readonly",
				URL: "readonly",
				AbortController: "readonly",
				describe: "readonly",
				it: "readonly",
				expect: "readonly",
				beforeEach: "readonly",
				afterEach: "readonly",
				jest: "readonly",
			},
		},
		rules: {
			"no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
			"no-console": "off",
		},
	},
	{
		ignores: ["node_modules/", "coverage/", "data/"],
	},
];
