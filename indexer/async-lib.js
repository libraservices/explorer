const request = require('request');
const mongoose = require('mongoose');
const lib = require('../lib/explorer');

module.exports = {
  attempts: async (min, max, multiplier, job, errorCallback) => {
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
  },
  request: options => {
    return new Promise((resolve, reject) => {
      request(options, function (err, response, body) {
        if (err) {
          reject(err);
        } else {
          resolve(response);
        }
      });
    });
  },
  mongooseConnect: connectionString => {
    return new Promise((resolve, reject) => {
      mongoose.connect(connectionString, err => {
        if (err) reject(err);
        else resolve();
      })
    });
  },
  getBlockHash: blockHeight => {
    return new Promise((resolve, reject) => {
      lib.get_blockhash(blockHeight, res => {
        if (!res || res == 'There was an error. Check your console.') {
          reject('Error fetching block hash');
        } else {
          resolve(res);
        }
      });
    });
  },
  getBlock: blockHash => {
    return new Promise((resolve, reject) => {
      lib.get_block(blockHash, res => {
        if (!res || res == 'There was an error. Check your console.') {
          reject('Error fetching block');
        } else {
          resolve(res);
        }
      });
    });
  },
  getBlockNumber: () => {
    return new Promise((resolve, reject) => {
      lib.get_blockcount(res => {
        if (!res || res == 'There was an error. Check your console.') {
          reject('Error fetching block number');
        } else {
          resolve(res);
        }
      });
    });
  },
  getTx: (txid, raw = false) => {
    return new Promise((resolve, reject) => {
      lib.get_rawtransaction(txid, !raw, res => {
        if (!res || res == 'There was an error. Check your console.') {
          reject('Error fetching tx');
        } else {
          resolve(res);
        }
      });
    });
  }
}