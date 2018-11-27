var mongoose = require('mongoose')
  , Stats = require('../models/stats')
  , Markets = require('../models/markets')
  , Address = require('../models/address')
  , Tx = require('../models/tx')
  , Richlist = require('../models/richlist')
  , Peers = require('../models/peers')
  , Heavy = require('../models/heavy')
  , lib = require('./explorer')
  , settings = require('./settings')
  , poloniex = require('./markets/poloniex')
  , bittrex = require('./markets/bittrex')
  , bleutrade = require('./markets/bleutrade')
  , cryptsy = require('./markets/cryptsy')
  , cryptopia = require('./markets/cryptopia')
  , yobit = require('./markets/yobit')
  , empoex = require('./markets/empoex')
  , ccex = require('./markets/ccex'),
  db = require('./database');
//  , BTC38 = require('./markets/BTC38');


var dbString = 'mongodb://' + settings.dbsettings.user;
dbString = dbString + ':' + settings.dbsettings.password;
dbString = dbString + '@' + settings.dbsettings.address;
dbString = dbString + ':' + settings.dbsettings.port;
dbString = dbString + '/' + settings.dbsettings.database;

db.connect(dbString, function() {
  Address.distinct('a_id').exec((err, addrs) => {
    for (const addr of addrs) {
      const txcount = Tx
        .count({ $or: [ { 'vout.addresses': addr }, { 'vin.addresses': addr } ] })
        .exec((err, count) => {
          if (count > 10) {
            console.log(addr + ' ' + count);
          }
        });
    }
  })
});