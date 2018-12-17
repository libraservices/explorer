const amqp = require('amqplib');
const settings = require('../lib/settings');
const {
  QUEUE_BLOCKS_TO_FETCH,
  QUEUE_BLOCKS_TO_FETCH_TXS,
  QUEUE_BLOCKS_TO_SAVE
} = require('./constants');
const { attempts, mongooseConnect, getBlockNumber } = require('./async-lib');
const Logger = require('../lib/logger');
const { url : amqpUrl } = settings.amqp;
const nBlocksToPrepare = 100;

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

    await attempts(1000, 10000, 1.5, () => channel.assertQueue(QUEUE_BLOCKS_TO_FETCH), (ms, e) => {
      logger.error(`Failed to assert AMQP queue ${ QUEUE_BLOCKS_TO_FETCH }. Next attempt in ${ parseFloat(ms / 1000) }s`);
      logger.error(e);
    });
    logger.info(`Initialized the amqp queue ${ QUEUE_BLOCKS_TO_FETCH }`);

    await checkAllQueues();
  }

  async function checkAllQueues() {
    await checkQueueEmptiness(QUEUE_BLOCKS_TO_FETCH);
    await checkQueueEmptiness(QUEUE_BLOCKS_TO_FETCH_TXS);
    await checkQueueEmptiness(QUEUE_BLOCKS_TO_SAVE);
  }

  async function checkQueueEmptiness(queueName) {
    const queue = await attempts(1000, 10000, 1.5, () => channel.assertQueue(queueName), (ms, e) => {
      logger.error(`Failed to assert AMQP queue ${ queueName }. Next attempt in ${ parseFloat(ms / 1000) }s`);
      logger.error(e);
    });

    if (queue.messageCount) {
      logger.info(`The queue ${ queueName } is not empty, messages=${ queue.messageCount }, consumers=${ queue.consumerCount }`);

      if (queue.consumerCount) {
        logger.info(`The queue ${ queueName } has consumers, consumers count: ${ queue.consumerCount }`);

        try {
          logger.info(`Waiting for queue ${ queueName } emptiness...`);
          await waitForEmptyQueue(queueName);
          logger.info(`The queue ${ queueName } is empy`);
        } catch (e) {
          logger.error(e);
        }
      }

      logger.info(`Purging the queue ${ queueName }...`);
      await channel.purgeQueue(queueName);
      logger.info(`The queue ${ queueName } has been purged`);
    }
  }

  async function waitForEmptyQueue(queueName) {
    return new Promise((resolve, reject) => {
      const checkQueueFn = () => {
        setTimeout(() => {
          channel.assertQueue(queueName)
            .then(queue => {
              logger.info(`Queue current ${ queueName } state: messages=${ queue.messageCount }, consumers=${ queue.consumerCount }`);

              if (queue.messageCount === 0 || queue.consumerCount === 0) {
                resolve();
              } else {
                checkQueueFn();
              }
            }).catch(reject);
        }, 1000);
      }

      checkQueueFn();
    });
  }

  async function updateLastState() {
    synchedBlocks = await Tx.distinct('blockindex');
  }

  async function checkAndPrepareTasks() {
    setTimeout(async () => {
      const { messageCount } = await channel.checkQueue(QUEUE_BLOCKS_TO_FETCH);

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

    for (let i = 0; i < blockCount + 1 && pushedToQueue.length < nBlocksToPrepare; i++) {
      if (synchedBlocks.includes(i)) {
        continue;
      }

      channel.sendToQueue(QUEUE_BLOCKS_TO_FETCH, Buffer.from(i + ''));

      synchedBlocks.push(i);
      pushedToQueue.push(i);
    }

    logger.info(`Prepared blocks to fetch: ${ pushedToQueue.join(', ') }`);
  }
}

async function main() {
  initWorker();
}

main().catch(e => {
  console.error(e);
  console.error(e.stack);
  console.error('____________');
});
