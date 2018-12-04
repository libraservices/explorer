var mongoose = require('mongoose')
  , db = require('../lib/database')
  , Tx = require('../models/tx')  
  , Address = require('../models/address')  
  , Richlist = require('../models/richlist')  
  , Stats = require('../models/stats')  
  , settings = require('../lib/settings')
  , fs = require('fs');

var dbString = 'mongodb://' + settings.dbsettings.user;
dbString = dbString + ':' + settings.dbsettings.password;
dbString = dbString + '@' + settings.dbsettings.address;
dbString = dbString + ':' + settings.dbsettings.port;
dbString = dbString + '/' + settings.dbsettings.database;

function check(done_callback) {
  db.update_db(settings.coin, function(){
    db.get_stats(settings.coin, function(stats){
      if (settings.heavy == true) {
        db.update_heavy(settings.coin, stats.count, 20, function(){
        });
      }

      db.update_tx_db(settings.coin, stats.last, stats.count, 0, function(){
        db.update_richlist('received', function(){
          db.update_richlist('balance', function(){
            db.get_stats(settings.coin, function(nstats){
              console.log('update complete (block: %s)', nstats.last);
              set_check_timeout();
            });
          });
        });
      });
    });
  });
}

function set_check_timeout() {
  setTimeout(check, settings.update_index_interval);
}

mongoose.connect(dbString, function(err) {
  if (err) {
    console.log('Unable to connect to database: %s', dbString);
    console.log('Aborting');
    process.exit();
  }

  console.log('Check new blocks, interval:' + settings.update_index_interval);

  check();
});

