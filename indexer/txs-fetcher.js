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
  await attempts(1000, 10000, 1.5, startServer, (interval, e) => {
    console.error(`Error starting server. Next try in ${ parseFloat(interval / 1000, 10) } s...`);
    console.error(e);
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
  const blks = await attempts(1000, 10000, 1.5, fetchBlocks, (interval, e) => {
    console.error(`Error fetching blocks. Next try in ${ parseFloat(interval / 1000, 10) } s...`);
    console.error(e);
  });

  var pieceOfBlocks = [];

  for (let i = 0; i < blks.length; i++) {
    pieceOfBlocks.push(blks[i]);

    if (pieceOfBlocks.length === 10 || i === blks.length -1) {
      await handleBlocks(pieceOfBlocks);

      pieceOfBlocks = [];
    }
  }

  setTimeout(tryStartFetchingBlocks, 10);
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

  const promises = [];

  for (let blk of blks) {
    console.log(`Fetching txes of block ${ blk.height }`);

    promises.push(await attempts(1000, 10000, 1.5, () => fetchBlockTxs(blk), (interval, e) => {
      console.error(`Error fetching block txs, height ${ blk.height }. Next try in ${ parseFloat(interval / 1000, 10) } s...`);
    console.error(e);
    }));
  }

  const promisesResults = await Promise.all(promises);

  const txesToBlocks = promisesResults.reduce((map, txes) => {
    txes.forEach(tx => {
      if (!map[tx.blockheight]) {
        map[tx.blockheight] = [];
      }

      map[tx.blockheight].push(tx);
    });

    return map;
  }, {});

  Object.keys(txesToBlocks).forEach(blockheight => {
    const blk = blks.find(x => x.height == blockheight);

    if (blk) {
      blk.tx = txesToBlocks[blockheight];
      blocks.push(blk);

      console.log(`Pushed block ${ blk.height }`);
    }
  });
}

async function fetchBlockTxs(blk) {
  const txes = [];
  const promises = [];

  for (let txid of blk.tx) {
    promises.push(await attempts(1000, 10000, 1.5, () => fetchBlockTx(blk, txid), (interval, e) => {
      console.error(`Error handling tx ${ txid }. Next try in ${ parseFloat(interval / 1000, 10) } s...`);
      console.error(e);
    }));
  }

  const promisesResults = await Promise.all(promises);

  promisesResults.forEach(tx => txes.push(tx));

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