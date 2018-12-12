const amqp = require('amqplib');
const settings = require('../lib/settings');
const {
  QUEUE_BLOCKS_TO_FETCH,
  QUEUE_BLOCKS_TO_FETCH_TXS
} = require('./constants');
const {
  attempts,
  getBlockHash,
  getBlock,
  calcJobTime
} = require('./async-lib');
const Logger = require('../lib/logger');
const { prefix : amqpPrefix, url : amqpUrl } = settings.amqp;

async function initWorker() {
  const logger = new Logger('blocks-fetcher');
  var connection, channel;

  logger.info(`Initializing...`);

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
    await attempts(1000, 10000, 1.5, () => channel.assertQueue(amqpPrefix + QUEUE_BLOCKS_TO_FETCH), (ms, e) => {
      logger.error(`Failed to assert AMQP queue ${ amqpPrefix + QUEUE_BLOCKS_TO_FETCH }. Next attempt in ${ parseFloat(ms / 1000) }s`);
      logger.error(e);
    });
    logger.info(`Initialized the amqp queue ${ amqpPrefix + QUEUE_BLOCKS_TO_FETCH }`);
    await attempts(1000, 10000, 1.5, () => channel.assertQueue(amqpPrefix + QUEUE_BLOCKS_TO_FETCH_TXS), (ms, e) => {
      logger.error(`Failed to assert AMQP queue ${ amqpPrefix + QUEUE_BLOCKS_TO_FETCH_TXS }. Next attempt in ${ parseFloat(ms / 1000) }s`);
      logger.error(e);
    });
    logger.info(`Initialized the amqp queue ${ amqpPrefix + QUEUE_BLOCKS_TO_FETCH_TXS }`);
  }

  async function consumeChannels() {
    channel.consume(amqpPrefix + QUEUE_BLOCKS_TO_FETCH, tryFetchBlock, { noAck: false });
  }

  async function tryFetchBlock (task) {
    const blockHeight = parseInt(task.content.toString(), 10);
    logger.info(`Received block to fetch: ${ blockHeight }`);
    const startTime = Date.now();
    const block = await attempts(1000, 10000, 1.5, () => fetchBlock(blockHeight), (ms, e) => {
      logger.error(`Failed to fetch block. Next attempt in ${ parseFloat(ms / 1000) }s`);
      logger.error(e);
    });
    logger.info(`Fetched block ${ blockHeight } in ${ calcJobTime(startTime) }`);
    channel.sendToQueue(amqpPrefix + QUEUE_BLOCKS_TO_FETCH_TXS, Buffer.from(JSON.stringify(block)));
    channel.ack(task);
    logger.info(`Pushed block ${ blockHeight } to the next queue`);
  }

  async function fetchBlock (blockHeight) {
    const blockHash = await getBlockHash(blockHeight);
    const block = await getBlock(blockHash);

    return block;
  }
}

async function main() {
  initWorker();
}

main();
