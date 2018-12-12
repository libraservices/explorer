const amqp = require('amqplib');
const Logger = require('../lib/logger');
const settings = require('../lib/settings');
const {
  QUEUE_BLOCKS_TO_FETCH_TXS,
  QUEUE_BLOCKS_TO_SAVE
} = require('./constants');
const { attempts, calcJobTime, convertToSatoshi, getTx } = require('./async-lib');
const { prefix : amqpPrefix, url : amqpUrl } = settings.amqp;

async function initWorker() {
  const logger = new Logger('blocks-transactions-fetcher');
  var connection, channel;

  logger.info('Initializing...');

  await initAMQP();
  await consumeChannels();

  async function initAMQP() {
    connection = await attempts(1000, 10000, 1.5, () => amqp.connect(amqpUrl), (ms, e) => {
      logger.error(`Failed to initialize AMQP connection. Next attempt in ${ parseFloat(ms / 1000) }s`);
      logger.error(e);
    });
    logger.info(`Initialized the amqp connection`);
    channel = await attempts(1000, 10000, 1.5, () => connection.createChannel(), (ms, e) => {
      logger.error(`Failed to create AMQP channel. Next attempt in ${ parseFloat(ms / 1000) }s`);
      logger.error(e);
    });
    channel.prefetch(1);
    logger.info(`Initialized the amqp channel`);
    await attempts(1000, 10000, 1.5, () => channel.assertQueue(amqpPrefix + QUEUE_BLOCKS_TO_FETCH_TXS), (ms, e) => {
      logger.error(`Failed to assert AMQP queue. Next attempt in ${ parseFloat(ms / 1000) }s`);
      logger.error(e);
    });
    logger.info(`Initialized the amqp queue`);
    await attempts(1000, 10000, 1.5, () => channel.assertQueue(amqpPrefix + QUEUE_BLOCKS_TO_SAVE), (ms, e) => {
      logger.error(`Failed to assert AMQP queue ${ amqpPrefix + QUEUE_BLOCKS_TO_SAVE }. Next attempt in ${ parseFloat(ms / 1000) }s`);
      logger.error(e);
    });
    logger.info(`Initialized the amqp queue ${ amqpPrefix + QUEUE_BLOCKS_TO_SAVE }`);
  }

  async function consumeChannels() {
    channel.consume(amqpPrefix + QUEUE_BLOCKS_TO_FETCH_TXS, tryFetchBlockTransactions, { noAck: false });
  }

  async function tryFetchBlockTransactions (task) {
    const block = JSON.parse(task.content.toString());
    logger.info(`Received block to fetch: ${ block.height }, n tx: ${ block.tx.length }`);
    const startTime = Date.now();
    block.transactions = await attempts(1000, 10000, 1.5, () => fetchBlockTransactions(block), (ms, e) => {
      logger.error(`Failed to fetch block ${ block.height } transactions. Next attempt in ${ parseFloat(ms / 1000) }s`);
      logger.error(e);
    });
    logger.info(`Fetched block ${ block.height } transactions in ${ calcJobTime(startTime) }`);
    channel.sendToQueue(amqpPrefix + QUEUE_BLOCKS_TO_SAVE, Buffer.from(JSON.stringify(block)));
    channel.ack(task);

    logger.info(`Pushed block ${ block.height } to the next queue`);
  }

  async function fetchBlockTransactions(block) {
    if (settings.genesis_block === block.hash) {
      return [];
    }

    const transactions = [];

    for (const txid of block.tx) {
      const startTime = Date.now();
      const transaction = await attempts(1000, 10000, 1.5, () => fetchBlockTransaction(block, txid), (ms, e) => {
        logger.error(`Failed to fetch block ${ block.height } transaction ${ txid }. Next attempt in ${ parseFloat(ms / 1000) }s`);
        logger.error(e);
      });

      transactions.push(transaction);

      logger.info(`Fetched block ${ block.height } transaction ${ txid } in ${ calcJobTime(startTime) }`);
    }

    return transactions;
  }

  async function fetchBlockTransaction(block, txid) {
    const tx = await getTx(txid, false);
    const raw = await getTx(txid, true);

    const vin = [];
    const vout = [];

    if (tx.vout && tx.vout.length) {
      for (let txVout of tx.vout) {
        if (txVout.scriptPubKey.type != 'nonstandard' && txVout.scriptPubKey.type != 'nulldata') {
          vout.push({ addresses: txVout.scriptPubKey.addresses[0], amount: convertToSatoshi(txVout.value), n: txVout.n });
        }
      }
    }

    // for feature indexing
    if (tx.vin && tx.vin.length) {
      for (let txVin of tx.vin) {
        vin.push({ coinbase: txVin.coinbase !== undefined, txid: txVin.txid, vout: txVin.vout });
      }
    }

    tx.blockheight = block.height;
    tx.raw = raw;
    tx.vin = vin;
    tx.vout = vout;

    return tx;
  }
}

async function main() {
  initWorker();
}

main();
