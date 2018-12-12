const request = require('request');
const mongoose = require('mongoose');
const client = require('../lib/rpc-client');

async function attempts (min, max, multiplier, job, errorCallback) {
  let resolve, promise = new Promise((_resolve, reject) => {
    resolve = _resolve;
  });

  let tryInterval = min;
  let tryFn = async () => {
    try {
      const result = await job();

      resolve(result);
    } catch (e) {
      errorCallback(tryInterval, e);

      setTimeout(tryFn, tryInterval);

      tryInterval *= multiplier;

      if (tryInterval >= max) {
        tryInterval = max;
      }
    }
  };

  tryFn();

  return promise;
}

async function asyncRequest(options) {
  return new Promise((resolve, reject) => {
    request(options, function (err, response, body) {
      if (err) {
        reject(err);
      } else {
        resolve(response);
      }
    });
  });
}

async function mongooseConnect(connectionString) {
  return new Promise((resolve, reject) => {
    mongoose.connect(connectionString, err => {
      if (err) reject(err);
      else resolve();
    })
  });
}

async function getBlockHash(blockHeight) {
  return await client.command('getblockhash', blockHeight);
}

async function getBlock(blockHash) {
  return await client.command('getblock', blockHash);
}

async function getBlockNumber() {
  return await client.command('getblockcount');
}

async function getTx(txid, raw = false) {
  return await client.command('getrawtransaction', txid, !raw ? 1 : 0);
}

function calcJobTime(startTime) {
  return `${ parseFloat((Date.now() - startTime) / 1000) }s`;
}

function convertToSatoshi(amount) {
  var fixed = amount.toFixed(8).toString();

  return parseInt(fixed.replace('.', ''));
}

module.exports = {
  attempts,
  request : asyncRequest,
  calcJobTime,
  convertToSatoshi,
  mongooseConnect,
  getBlockNumber,
  getBlockHash,
  getBlock,
  getTx,
};
