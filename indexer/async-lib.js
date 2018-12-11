const request = require('request');
const mongoose = require('mongoose');
const lib = require('../lib/explorer');

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
  return new Promise((resolve, reject) => {
    lib.get_blockhash(blockHeight, res => {
      if (!res || res == 'There was an error. Check your console.') {
        reject('Error fetching block hash');
      } else {
        resolve(res);
      }
    });
  });
}

async function getBlock(blockHash) {
  return new Promise((resolve, reject) => {
    lib.get_block(blockHash, res => {
      if (!res || res == 'There was an error. Check your console.') {
        reject('Error fetching block');
      } else {
        resolve(res);
      }
    });
  });
}

async function getBlockNumber() {
  return new Promise((resolve, reject) => {
    lib.get_blockcount(res => {
      if (!res || res == 'There was an error. Check your console.') {
        reject('Error fetching block number');
      } else {
        resolve(res);
      }
    });
  });
}

async function getTx(txid, raw = false) {
  return new Promise((resolve, reject) => {
    lib.get_rawtransaction(txid, !raw, res => {
      if (!res || res == 'There was an error. Check your console.') {
        console.error(res);
        reject('Error fetching tx');
      } else {
        resolve(res);
      }
    });
  });
}

function calcJobTime(startTime) {
  return `${ parseFloat((Date.now() - startTime) / 1000) }s`;
}

module.exports = {
  attempts,
  request : asyncRequest,
  calcJobTime,
  mongooseConnect,
  getBlockNumber,
  getBlockHash,
  getBlock,
  getTx,
};
