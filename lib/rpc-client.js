const Client = require('bitcoin-core');
const settings = require('./settings');

const { wallet : credentials } = settings;

module.exports = new Client({
	host     : credentials.host,
	port     : credentials.port,
	username : credentials.user,
	password : credentials.pass
});
