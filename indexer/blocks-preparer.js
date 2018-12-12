const amqp = require('amqplib');
const settings = require('../lib/settings');
const {
  QUEUE_BLOCKS_TO_FETCH
} = require('./constants');
const { attempts, mongooseConnect, getBlockNumber } = require('./async-lib');
const Logger = require('../lib/logger');
const { prefix : amqpPrefix, url : amqpUrl } = settings.amqp;

const Tx = require('../models/tx');

async function initWorker() {
  const logger = new Logger('block-preparer');
  var connection, channel;
  var synchedBlocks;

  logger.info(`Initializing...`);

  await tryConnectMongo();
  await initAMQP();
  await updateLastState();
  await checkAndPrepareTasks();

  async function tryConnectMongo() {
    await attempts(1000, 10000, 1.5, () => mongooseConnect(settings.dbsettings.connectionString), (ms, e) => {
      logger.error(`Failed to connect to the mongodb server (${ settings.dbsettings.connectionString }). Next attempt in ${ parseFloat(ms / 1000) }s`);
      logger.error(e);
    });
  }

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
    logger.info(`Initialized the amqp channel`);

    await attempts(1000, 10000, 1.5, () => channel.assertQueue(amqpPrefix + QUEUE_BLOCKS_TO_FETCH), (ms, e) => {
      logger.error(`Failed to assert AMQP queue. Next attempt in ${ parseFloat(ms / 1000) }s`);
      logger.error(e);
    });
    logger.info(`Initialized the amqp queue ${ amqpPrefix + QUEUE_BLOCKS_TO_FETCH }`);
  }

  async function updateLastState() {
    synchedBlocks = await Tx.distinct('blockindex');
  }

  async function checkAndPrepareTasks() {
    setTimeout(async () => {
      const { messageCount } = await channel.checkQueue(amqpPrefix + QUEUE_BLOCKS_TO_FETCH);

      if (messageCount === 0) {
        await prepareBlocksToFetch();
      }

      checkAndPrepareTasks();
    }, 1000);
  }

  async function prepareBlocksToFetch() {
    const blockCount = await attempts(1000, 10000, 1.5, () => getBlockNumber(), (ms, e) => {
      logger.error(`Failed to get block count. Next attempt in ${ parseFloat(ms / 1000) }s`);
      logger.error(e);
    });
    let pushedToQueue = [];

    for (let i = 0; i < blockCount + 1 && pushedToQueue.length < 1000; i++) {
      if (synchedBlocks.indexOf(i) !== -1) {
        continue;
      }

      channel.sendToQueue(amqpPrefix + QUEUE_BLOCKS_TO_FETCH, Buffer.from(i + ''));

      synchedBlocks.push(i);
      pushedToQueue.push(i);
    }

    logger.info(`Prepared blocks to fetch: ${ pushedToQueue.join(', ') }`);
  }
}

async function main() {
  initWorker();
}

main();
