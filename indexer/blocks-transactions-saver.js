const amqp = require('amqplib');
const settings = require('../lib/settings');
const {
  QUEUE_BLOCKS_TO_SAVE
} = require('./constants');
const { attempts, mongooseConnect } = require('./async-lib');
const Logger = require('../lib/logger');

async function initWorker() {
  const Tx = require('../models/tx');

  const logger = new Logger('blocks-transactions-saver');
  var connection, channel;

  logger.info(`Initializing...`);

  await tryConnectMongo()
  await initAMQP();
  await consumeChannels();

  async function tryConnectMongo() {
    await attempts(1000, 10000, 1.5, () => mongooseConnect(settings.dbsettings.connectionString), (ms, e) => {
      logger.error(`Failed to connect to the mongodb server (${ settings.dbsettings.connectionString }). Next attempt in ${ parseFloat(ms / 1000) }s`);
      logger.error(e);
    });
  }

  async function consumeChannels() {
    channel.consume(QUEUE_BLOCKS_TO_SAVE, trySaveBlockTransactions, { noAck: false });
  }

  async function initAMQP() {
    connection = await attempts(1000, 10000, 1.5, () => amqp.connect('amqp://localhost'), (ms, e) => {
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
    await attempts(1000, 10000, 1.5, () => channel.assertQueue(QUEUE_BLOCKS_TO_SAVE), (ms, e) => {
      logger.error(`Failed to assert AMQP queue ${ QUEUE_BLOCKS_TO_SAVE }. Next attempt in ${ parseFloat(ms / 1000) }s`);
      logger.error(e);
    });
    logger.info(`Initialized the amqp queue ${ QUEUE_BLOCKS_TO_SAVE }`);
  }

  async function trySaveBlockTransactions(task) {
    const block = JSON.parse(task.content.toString());
    logger.info(`Received block to save transactions: ${ block.height }`);
    await attempts(1000, 10000, 1.5, () => saveBlockTransactions(block), (ms, e) => {
      logger.error(`Failed to save transactions. Next attempt in ${ parseFloat(ms / 1000) }s`);
      logger.error(e);
    });
    logger.info(`Saved block transactions: ${ block.height }`);
    channel.ack(task);
  }

  async function saveBlockTransactions(block) {
    if (!block.transactions.length) {
      logger.info(`Indexed block ${ block.height }, hash: ${ block.hash }, no txs`);
      return;
    }

    const bulk = Tx.collection.initializeUnorderedBulkOp();

    logger.info(`Adding txes of block ${ block.height } to bulk`);

    for (let tx of block.transactions) {
      bulk.insert({
        raw : tx.raw,
        txid : tx.hash,
        vout : tx.vout,
        vin : tx.vin,
        fullvin : false,
        total : tx.vout.reduce((acc, x) => acc + x.amount, 0),
        timestamp : tx.time,
        blockhash : tx.blockhash,
        blockindex : tx.blockheight,
        confirmations : parseInt(tx.confirmations, 10),
        calculated : false
      });

      logger.info(`Added tx ${ tx.hash } to bulk (${ bulk.length }/${ block.transactions.length })`);
    }

    if (bulk.length > 0) {
      await bulk.execute();

      logger.info(`Indexed block ${ block.height }, hash: ${ block.hash }, txs: ${ block.transactions.length }`);
    }
  }
}

async function main() {
  initWorker();
}

main();
