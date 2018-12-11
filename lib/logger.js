const winston = require('winston');
const path = require('path');

module.exports = function (name) {
	const logger = winston.createLogger({
		format: winston.format.combine(
			winston.format.timestamp(),
			winston.format.printf(x => `${x.timestamp} ${x.level}: ${x.message}`)
		),
		transports: [
			new winston.transports.Console(),
			new winston.transports.File({ filename: path.join(__dirname, '..', 'logs', `${ name }.log`)  })
		]
	});

	return logger;
};
