var express = require('express');
var db = require('../lib/database');
var lib = require('../lib/explorer');
var settings = require('../lib/settings');
var { X, makeRequestWrapper } = require('../lib/requestwrapper');

var router = express.Router();

router.get('/getaddress/:hash', makeRequestWrapper(
  function ({ hash }, cb) {
      db.get_address(hash, function(address){
        if (!address) {
          return cb(new X({ code: 'ADDRESS_NOT_FOUND' }));
        }

        db.count_addr_txs(hash, function (err, count) {
          var a_ext = {
            address: address.a_id,
            sent: address.sent,
            received: address.received,
            balance: address.balance,
            last_txs: address.txs,
            n_tx: count
          };

          cb({ data: a_ext });
        });
      });
  },
  req => ({ ...req.params }),
  {
    hash: [ 'required', 'string' ]
  }
));

router.get('/getbalance/:hash', makeRequestWrapper(
  function ({ hash }, cb) {
    db.get_address(hash, function(address){
      if (!address) {
        return cb(new X({ code: 'ADDRESS_NOT_FOUND' }));
      }

      cb({ data: address.balance });
    });
  },
  req => ({ ...req.params }),
  {
    hash: [ 'required', 'string' ]
  }
));

router.get('/getdistribution', makeRequestWrapper(
  function(data, cb) {
    db.get_richlist(settings.coin, function(richlist){
      db.get_stats(settings.coin, function(stats){
        db.get_distribution(richlist, stats, function(dist){
          cb({ data: dist });
        });
      });
    });
  }
));

router.get('/getlasttxs/:min', makeRequestWrapper(
  function(data, cb) {
  db.get_last_txs(settings.index.last_txs, req.params.min, function(txs){
      cb({ data: txs });
    });
  },
  req => ({ ...req.params }),
  {
    min: [ 'decimal' ]
  }
));

router.get('/gettxs', makeRequestWrapper(
  function({ limit = 100, page = 1 }, cb) {
    var offset = (page - 1) * limit;

    db.get_txs(limit, offset, function(err, txs){
      if (err || txs.length === 0) {
        return cb({ txs: [], hasNext: false });
      }

      db.get_txs(1, offset + txs.length, function (err, nextTxs) {
        cb({ data: txs, hasNext: nextTxs && nextTxs.length > 0 ? true : false });
      });
    });
  },
  req => ({ ...req.params, ...req.query }),
  {
    limit: [ 'positive_integer', { number_between: [ 1, Number.MAX_SAFE_INTEGER - 1 ] } ],
    page: [ 'positive_integer', { number_between: [ 1, Number.MAX_SAFE_INTEGER - 1 ] } ]
  }
));

router.get('/gettx/:hash', makeRequestWrapper(
  function({ hash }, cb){
    db.get_tx(hash, function(tx){
      if (!tx) {
        return cb(new X({ code: 'TX_NOT_FOUND' }));
      }

      cb({ data: tx });
    });
  },
  req => ({ ...req.params }),
  {
    hash: [ 'required', 'string' ]
  }
));

router.get('/getaddrtxs/:hash', makeRequestWrapper(
  function({ hash, limit = 100, page = 1 }, cb){
    var offset = (page - 1) * limit;

    db.get_addr_txs(hash, limit, offset, function(err, txs){
      if (err || txs.length === 0) {
        return cb({ data: [], hasNext: false });
      }

      db.get_addr_txs(hash, 1, offset + txs.length, function (err, nextTxs) {
        cb({ data: txs, hasNext: nextTxs && nextTxs.length > 0 ? true : false });
      });
    });
  },
  req => ({ ...req.params, ...req.query }),
  {
    hash: [ 'required', 'string' ],
    limit: [ 'positive_integer', { number_between: [ 1, Number.MAX_SAFE_INTEGER - 1 ] } ],
    page: [ 'positive_integer', { number_between: [ 1, Number.MAX_SAFE_INTEGER - 1 ] } ]
  }
));

router.get('/connections', makeRequestWrapper(
  function(data, cb) {
    db.get_peers(function(peers){
      cb({ data: peers });
    });
  }
));

router.get('/getmoneysupply', makeRequestWrapper(
  function(data, cb){
    lib.get_supply(function(supply){
      cb({ data: ' '+supply });
    });
  }
));

module.exports = router;
