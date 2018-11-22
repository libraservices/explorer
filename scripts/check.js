var cluster = require('cluster');
var os = require('os');
var settings = require('../lib/settings');
var lib = require('../lib/explorer');

function check(from, to) {
  lib.syncLoop(to - from + 1, function (blocksLoop) {
    var blockIndex = from + blocksLoop.iteration();
    console.log(blockIndex + '. Checking block index ' + blockIndex);

    try {
      lib.get_blockhash(blockIndex, function (hash) {
        try {
          console.log(blockIndex + '. Checking block ' + hash);

          lib.get_block(hash, function (block) {
            lib.syncLoop(block.tx.length, function (txsLoop) {
              var txIndex = txsLoop.iteration();
              var txHash = block.tx[txIndex];

              console.log(blockIndex + '. Checking tx ' + txHash);

              try {
                lib.get_rawtransaction(txHash, function (rawTx) {
                  if (typeof(rawTx) === 'string') {
                    console.log(blockIndex + '. Skipping tx ' + txHash + ': ' + rawTx);
                    txsLoop.next();
                    return;
                  }

                  for (let rawTxVoutIndex in rawTx.vout) {
                    var rawTxVout = rawTx.vout[rawTxVoutIndex];
                    var nVoutsAddrs = rawTxVout.scriptPubKey.addresses.length;
                    console.log(blockIndex + '. Vouts n addr: ' + nVoutsAddrs);

                    if (nVoutsAddrs > 1) {
                      console.error(blockIndex + '. Vouts more than 1 in block ' + block.hash + ' tx ' + txHash);
                    }
                  }

                  lib.syncLoop(rawTx.vin.length, function (vinLoop) {
                    var vinIndex = vinLoop.iteration();
                    var rawTxVin = rawTx.vin[vinIndex];

                    if (rawTxVin.coinbase) {
                      console.log(blockIndex + '. Vin ' + vinIndex + ' is coinbase');
                      vinLoop.next();
                      return;
                    }

                    var vinTx = rawTxVin.txid;

                    lib.get_rawtransaction(vinTx, function (vinRawTx) {
                      for (let vinRawTxVoutIndex in vinRawTx.vout) {
                        var vinRawTxVout = vinRawTx.vout[vinRawTxVoutIndex];
                        var nVinsAddrs = vinRawTxVout.scriptPubKey.addresses.length;

                        console.log(blockIndex + '. Vin n addr: ' + nVinsAddrs);

                        if (nVinsAddrs > 1) {
                          console.error(blockIndex + '. Vins more than 1 in block ' + block.hash + ' tx ' + txHash);
                        }
                      }

                      vinLoop.next();
                    });
                  }, function () {
                    txsLoop.next();
                  });
                });
              } catch (e) {
                console.error('Error handling tx ' + txHash + ', block ' + hash, e);
                txsLoop.next();
              }
            }, function () {
              blocksLoop.next();
            });
          });
        } catch (e) {
          console.error('Error handling block ' + hash);
          blocksLoop.next();
        }
      });
    } catch (e) {
      console.error('Error handling block ' + blockIndex);
      blocksLoop.next();
    }
  }, function(){
    console.log('Done checking blocks ' + from + '-' + to);
  });
}

function createRanges(nItems, nRanges) {
  var nItemsPerRangse = Math.ceil(nItems / nRanges);
  var ranges = [];

  for (var i = 0; i < nRanges; i++) {
    var start = nItemsPerRangse * i;
    var end = start + nItemsPerRangse;

    end -= 1;

    if (i == nRanges - 1)
      end = nItems;
    else if (end > nItems)
      end = nItems;

    ranges.push([start, end]);
  }

  return ranges;
}

if (cluster.isMaster) {
  var nBlocks = 551060;
  var nRanges = os.cpus().length;
  var ranges = createRanges(nBlocks, nRanges);

  function checkBlocksRanges(ranges) {
    for (let i in ranges) {
      var range = ranges[i];

      var fork = cluster.fork({
        from: range[0],
        to: range[1]
      });

      fork.on('exit', function () {
        console.log('Fork ' + i + ' exited');
      });
    }
  }

  // console.log(ranges);

  checkBlocksRanges(ranges);
} else {
  console.log('Fork will check range: ' + process.env.from + '-' + process.env.to);
  check(parseInt(process.env.from, 10), parseInt(process.env.to, 10));
}