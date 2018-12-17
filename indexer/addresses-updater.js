const mongoose = require('mongoose');
const settings = require('../lib/settings');
const Logger = require('../lib/logger');
const { attempts, mongooseConnect } = require('./async-lib');

const Tx = require('../models/tx');
const Address = require('../models/address');

async function initWorker() {
  const logger = new Logger('addresses-updater');

  await tryMongooseConnect();
  await startUpdatingAddresses();

  async function tryMongooseConnect() {
    await attempts(1000, 10000, 1.5, () => mongooseConnect(settings.dbsettings.connectionString), (ms, e) => {
      logger.error(`Failed to connect to the mongodb server (${ settings.dbsettings.connectionString }). Next attempt in ${ parseFloat(ms / 1000) }s`);
      logger.error(e);
    });

    logger.info(`Connected to mongodb`);
  }

  async function startUpdatingAddresses() {
    await updateAddresses();

    setTimeout(startUpdatingAddresses, 1000);
  }

  async function updateAddresses() {
    const nTxes = await Tx.count({ fullvin: true, calculated: false });
    const limit = 1000;

    logger.info(`Updating addresses, selecting: ${ limit }`);

    var bulk = Address.collection.initializeUnorderedBulkOp();
    var txsBulk = Tx.collection.initializeUnorderedBulkOp();

    const txes = await Tx.find({ fullvin: true, calculated: false }).limit(limit).exec();
    const addressesBalancesIncrements = {};

    for (let tx of txes) {
      for (let vin of tx.vin) {
        if (!(vin.addresses in addressesBalancesIncrements)) {
          addressesBalancesIncrements[vin.addresses] = {
            sent : 0,
            received : 0,
            balance : 0
          };
        }

        addressesBalancesIncrements[vin.addresses].sent += vin.amount;
        addressesBalancesIncrements[vin.addresses].balance -= vin.amount;
      }

      for (let vout of tx.vout) {
        if (!(vout.addresses in addressesBalancesIncrements)) {
          addressesBalancesIncrements[vout.addresses] = {
            sent : 0,
            received : 0,
            balance : 0
          };
        }

        addressesBalancesIncrements[vout.addresses].received += vout.amount;
        addressesBalancesIncrements[vout.addresses].balance += vout.amount;
      }

      txsBulk.find({ txid: tx.txid }).update({ $set: { calculated: true } });
    }

    Object.keys(addressesBalancesIncrements).forEach(address => {
      const addressBalancesIncrements = addressesBalancesIncrements[address];

      bulk.find({ a_id: address }).upsert().update({ $inc: {
        received : addressBalancesIncrements.received,
        sent : addressBalancesIncrements.sent,
        balance : addressBalancesIncrements.balance
      } });
    });

    if (bulk.length) {
      var bulkLength = bulk.length;

      await bulk.execute();

      if (txsBulk.length) {
        bulkLength += txsBulk.length;

        await txsBulk.execute();
      }

      await bulk.execute();

      logger.info(`Done ${ bulkLength } bulk operations`);
    }
  }
}

async function main() {
  await initWorker();
}

main();
