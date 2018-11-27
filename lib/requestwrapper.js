var livr = require('livr');

function X({ code = '', message = '', fields = {} }) {
	this.code = code;
	this.message = message;
	this.fields = fields;
}

function makeRequestWrapper(fn, formatter = null, rules = null) {
	return function wrapper(req, res) {
		try {
			var params = formatter !== null ? formatter(req, res) || {} : {};

			if (params !== null && rules !== null) {
				params = validate(params, rules);
			}

			var result = fn(params, function (data) {
				if (data instanceof X) {
					res.send({
						status: 0,
						error: {
							code: data.code,
							message: data.message,
							fields: data.fields
						}
					});
				} else {
					res.send({
						status: 1,
						...data
					});
				}
			});
		} catch (e) {
			if (e instanceof X) {
				res.send({
					status: 0,
					error: {
						code: e.code,
						message: e.message,
						fields: e.fields
					}
				});
			} else {
				console.error(e);

				res.send({
					status: 0,
					error: {
						code: 'SERVER_ERROR',
						message: 'Some error occurred, please contact your system administrator'
					}
				})
			}
		}
	}
}

function validate(data, rules) {
	var validator = new livr.Validator(rules).prepare();
	var result = validator.validate(data);

	if (!result) {
		throw new X({ code: 'FORMAT_ERROR', fields: validator.getErrors() });
	}

	return result;
}

module.exports = {
	X,
	makeRequestWrapper
};
