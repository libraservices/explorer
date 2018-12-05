const express = require('express');
const settings = require('../lib/settings');
const { attempts, mongooseConnect, getBlockNumber, getBlockHash, getBlock } = require('./async-lib');

const Tx = require('../models/tx');

const dbString = `mongodb://${ settings.dbsettings.user }:${ settings.dbsettings.password }@${ settings.dbsettings.address }:${ settings.dbsettings.port }/${ settings.dbsettings.database }`;
const port = process.env.BLKS_FETCHER_PORT || 9081;

var lastHeight = 0;
var blockNumber = 0;
var blocks = [];

async function main() {
  await tryMongooseConnect();
  await tryStartServer();

  await updateLastPosition();
  await startFetchingBlocks();
}

async function tryMongooseConnect() {
  await attempts(1000, 10000, 1.5, () => mongooseConnect(dbString), (interval, e) => {
    console.error(`Error connecting to mongodb. Next try in ${ parseFloat(interval / 1000, 10) } s...`);
    console.error(e);
  });

  console.log(`Connected to mongodb`);
}

async function tryUpdateBlock() {
  blockNumber = await attempts(1000, 10000, 1.5, getBlockNumber, (interval, e) => {
    console.error(`Error fetching the highest block. Next try in ${ parseFloat(interval / 1000, 10) } s...`);
    console.error(e);
  });

  console.log(`The highest block is ${ blockNumber }`);
}

async function updateLastPosition() {
  const lastTxs = await Tx.find().sort({ blockindex: -1 }).limit(1);
  const lastTx = lastTxs[0];

  if (lastTx) {
    lastHeight = lastTx.blockindex;
  }

  console.log(`The last block is ${ lastHeight }`);
}

async function tryStartServer() {
  await attempts(1000, 10000, 1.5, startServer, (interval, e) => {
    console.error(`Error starting server. Next try in ${ parseFloat(interval / 1000, 10) } s...`);
    console.error(e);
  });

  console.log(`Listening ${ port }...`);
}

async function startServer() {
  const app = express();

  app.get('/', (req, res) => {
    res.send(blocks);
    blocks = [];
  });

  return new Promise((resolve, reject) => {
    try {
      server = app.listen(port, resolve).on('error', reject);
    } catch (e) {
      reject(e);
    }
  });
}

async function startFetchingBlocks() {
  console.log(`Starting fetching blocks...`);

  await fetchBlocks();

  setTimeout(startFetchingBlocks, 1000);
}

async function fetchBlocks() {
  await tryUpdateBlock();

  for (let i = lastHeight; i < blockNumber; i++) {
    await fetchBlock(i);
  }
}

async function fetchBlock(blockHeight) {
  const blockHash = await attempts(1000, 10000, 1.5, () => getBlockHash(blockHeight), (interval, e) => {
    console.error(`Error fetching block hash ${ blockHeight }. Next try in ${ parseFloat(interval / 1000, 10) } s...`);
    console.error(e);
  });
  const block = await attempts(1000, 10000, 1.5, () => getBlock(blockHash), (interval, e) => {
    console.error(`Error fetching block ${ blockHeight }. Next try in ${ parseFloat(interval / 1000, 10) } s...`);
    console.error(e);
  });

  blocks.push(block);
  lastHeight = blockHeight;

  console.error(`Pushed block ${ blockHeight } to stack`);
}

main().catch(e => {
  console.error(e);

  if (server) {
    server.close();
  }
});
