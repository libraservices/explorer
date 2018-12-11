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

    logger.info(`Updating addresses, found not used txes: ${ nTxes }`)

    var bulk = Address.collection.initializeUnorderedBulkOp();
    var txsBulk = Tx.collection.initializeUnorderedBulkOp();

    for (let i = 0; i < nTxes; i += 1000) {
      const txes = await Tx.find({ fullvin: true, calculated: false }).skip(i).limit(1000).exec();

      for (let tx of txes) {
        for (let vin of tx.vin) {
          bulk.find({ a_id: vin.addresses }).upsert().update({ $inc: {
            sent : vin.amount,
            balance : -vin.amount
          } });
        }

        for (let vout of tx.vout) {
          bulk.find({ a_id: vout.addresses }).upsert().update({ $inc: {
            received : vout.amount,
            balance : vout.amount
          } });
        }

        txsBulk.find({ txid: tx.txid }).update({ $set: { calculated: true } });
      }
    }

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
