const settings = require('../lib/settings');
const { prefix } = settings.amqp;

module.exports = {
	QUEUE_BLOCKS_TO_FETCH     : prefix + 'indexer.queues.fetch-blocks',
	QUEUE_BLOCKS_TO_FETCH_TXS : prefix + 'indexer.queues.blocks-to-fetch-txs',
	QUEUE_BLOCKS_TO_SAVE      : prefix + 'indexer.queues.blocks-to-save'
};
