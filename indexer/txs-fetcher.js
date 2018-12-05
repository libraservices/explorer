const express = require('express');
const { attempts, request, getTx } = require('./async-lib');

const blksFetcherPort = process.env.BLKS_FETCHER_PORT || 9081;
const port = process.env.TXS_FETCHER_PORT || 9082;
const blksEndpoint = `http://localhost:${ blksFetcherPort }`;

var blocks = [];
var server;

async function main() {
  await tryStartServer();
  await tryStartFetchingBlocks();
}

async function tryStartServer() {
  await attempts(1000, 10000, 1.5, startServer, interval => {
    console.error(`Error starting server. Next try in ${ parseFloat(interval / 1000, 10) } s...`);
  });

  console.log(`Listening ${ port }...`);
}

function startServer() {
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

async function tryStartFetchingBlocks() {
  const blks = await attempts(1000, 10000, 1.5, fetchBlocks, interval => {
    console.error(`Error fetching blocks. Next try in ${ parseFloat(interval / 1000, 10) } s...`);
  });

  await handleBlocks(blks);

  setTimeout(tryStartFetchingBlocks, 1000);
}

async function fetchBlocks() {
  const { body: blks } = await request({ uri: blksEndpoint, json: true });

  return blks;
}

async function handleBlocks(blks) {
  if (blks.length === 0) {
    return;
  }

  console.log('Got ' + blks.length + ' new blocks');

  for (let blk of blks) {
    console.log(`Fetching txes of block ${ blk.height }`);

    const txs = await attempts(1000, 10000, 1.5, () => fetchBlockTxs(blk), (interval, e) => {
      console.error(`Error fetching block txs, height ${ blk.height }. Next try in ${ parseFloat(interval / 1000, 10) } s...`);
    });

    blk.tx = txs;
    blocks.push(blk);
  }
}

async function fetchBlockTxs(blk) {
  const txes = [];

  for (let txid of blk.tx) {
    const tx = await attempts(1000, 10000, 1.5, () => fetchBlockTx(blk, txid), interval => {
      console.error(`Error handling tx ${ txid }. Next try in ${ parseFloat(interval / 1000, 10) } s...`);
    });

    txes.push(tx);
  }

  return txes;
}

async function fetchBlockTx(blk, txid) {
  console.log(`Fetching tx ${ txid }`);

  const tx = await getTx(txid, false);
  const raw = await getTx(txid, true);
  const vin = [];
  const vout = [];

  if (tx.vout && tx.vout.length) {

    for (let txVout of tx.vout) {
      if (txVout.scriptPubKey.type != 'nonstandard' && txVout.scriptPubKey.type != 'nulldata') {
        vout.push({ addresses: txVout.scriptPubKey.addresses[0], amount: txVout.value, n: txVout.n });
      }
    }
  }

  // for feature indexing
  if (tx.vin && tx.vin.length) {
    for (let txVin of tx.vin) {
      vin.push({ coinbase: txVin.coinbase !== undefined, txid: txVin.txid, vout: txVin.vout });
    }
  }

  tx.blockheight = blk.height;
  tx.raw = raw;
  tx.vin = vin;
  tx.vout = vout;

  return tx;
}

main().catch(e => {
  console.error(e);

  if (server) {
    server.close();
  }
});