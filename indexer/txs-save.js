const mongoose = require('mongoose');
const settings = require('../lib/settings');
const { attempts, request, mongooseConnect } = require('./async-lib');

const Tx = require('../models/tx');

const txsFetcherPort = process.env.TXS_FETCHER_PORT || 9082;
const txsEndpoint = `http://localhost:${ txsFetcherPort }`;
const dbString = `mongodb://${ settings.dbsettings.user }:${ settings.dbsettings.password }@${ settings.dbsettings.address }:${ settings.dbsettings.port }/${ settings.dbsettings.database }`;

var bulk;
const bulkSize = 10000;

async function main() {
  await tryMongooseConnect();
  await startSavingBlocks();
}

async function tryMongooseConnect() {
  await attempts(1000, 10000, 1.5, () => mongooseConnect(dbString), (interval, e) => {
    console.error(`Error connecting to mongodb. Next try in ${ parseFloat(interval / 1000, 10) } s...`);
    console.error(e);
  });

  console.log(`Connected to mongodb`);
}

async function startSavingBlocks() {
  const blocks = await attempts(1000, 10000, 1.5, fetchBlocks, (interval, e) => {
    console.error(`Error fetching blocks. Next try in ${ parseFloat(interval / 1000, 10) } s...`);
    console.error(e);
  });

  await await attempts(1000, 10000, 1.5, () => saveBlocks(blocks), (interval, e) => {
    console.error(`Error saving blocks. Next try in ${ parseFloat(interval / 1000, 10) } s...`);
    console.error(e);
  });

  setTimeout(startSavingBlocks, 10);
}

async function fetchBlocks() {
  const { body: blocks } = await request({ uri: txsEndpoint, json: true });

  return blocks;
}

async function saveBlocks(blocks) {
  if (blocks.length === 0) {
    return;
  }

  console.log('Got ' + blocks.length + ' new blocks');

  if (!bulk) {
    bulk = Tx.collection.initializeUnorderedBulkOp();
  }

  for (let blk of blocks) {
    console.log(`Adding txes of block ${ blk.height } to bulk (${ bulk.length }/${ bulkSize })`);

    for (let tx of blk.tx) {
      console.log(`Added tx ${ tx.hash } to bulk (${ bulk.length }/${ bulkSize })`);

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
    }
  }

  if (bulk.length >= bulkSize) {
    var bulkLength = bulk.length;

    await bulk.execute();

    bulk = Tx.collection.initializeUnorderedBulkOp();

    console.log(`Done ${ bulkLength } bulk operations`);
  }
}

async function exit() {
  if (bulk && bulk.length) {
    console.log(`Saving bulk`);

    await bulk.execute();

    console.log(`Done ${ bulk.length } bulk operations`);
  }

  mongoose.disconnect();
  process.exit();
}

process.on('SIGTERM', () => {
  console.info('SIGTERM signal received');
  exit();
});

process.on('SIGINT', () => {
  console.info('SIGINT signal received');
  exit();
});

main().catch(e => {
  console.error(e);

  mongoose.disconnect();
});