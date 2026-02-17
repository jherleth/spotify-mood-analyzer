const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL] ?? LOG_LEVELS.info;

function formatEntry(level, message, meta) {
	const entry = {
		timestamp: new Date().toISOString(),
		level,
		message,
		...meta,
	};
	return JSON.stringify(entry);
}

function createLogger(context = {}) {
	const log = (level, message, meta = {}) => {
		if (LOG_LEVELS[level] > currentLevel) return;
		const merged = { ...context, ...meta };
		const line = formatEntry(level, message, merged);
		if (level === "error") {
			process.stderr.write(line + "\n");
		} else {
			process.stdout.write(line + "\n");
		}
	};

	return {
		error: (msg, meta) => log("error", msg, meta),
		warn: (msg, meta) => log("warn", msg, meta),
		info: (msg, meta) => log("info", msg, meta),
		debug: (msg, meta) => log("debug", msg, meta),
		child: (childContext) => createLogger({ ...context, ...childContext }),
	};
}

module.exports = createLogger();
module.exports.createLogger = createLogger;
