const mongoose = require('mongoose');
const settings = require('../lib/settings');
const Logger = require('../lib/logger');
const { attempts, calcJobTime, mongooseConnect } = require('./async-lib');

const Tx = require('../models/tx');

async function initWorker() {
  const logger = new Logger('inputs-updater');

  await tryMongooseConnect();
  await startUpdatingVin();

  async function tryMongooseConnect() {
    await attempts(1000, 10000, 1.5, () => mongooseConnect(settings.dbsettings.connectionString), (ms, e) => {
      logger.error(`Failed to connect to the mongodb server (${ settings.dbsettings.connectionString }). Next attempt in ${ parseFloat(ms / 1000) }s`);
      logger.error(e);
    });

    logger.info(`Connected to mongodb`);
  }

  async function startUpdatingVin() {
    await updateVin();

    setTimeout(startUpdatingVin, 1000);
  }

  async function updateVin() {
    const nTxes = await Tx.count({ fullvin: false });
    const limit = 1000;
    const checkAllTxsStartTime = Date.now();

    logger.info(`Found ${ nTxes } not full txes`);

    const checkTxsBatchStartTime = Date.now();
    const txes = await Tx.find({ fullvin : false }).sort({ txid: 1 }).limit(limit).exec();

    logger.info(`Handling ${ txes.length } txs`);

    const fullTxs = [];

    for (const tx of txes) {
      const txValues = tx.toJSON();

      const txVin = [];
      const checkTxStartTime = Date.now();

      for (const vinIndex in txValues.vin) {
        const vin = txValues.vin[vinIndex];

        if (vin.addresses !== undefined) {
          txVin.push(vin);
          continue;
        }

        if (vin.coinbase) {
          txVin.push({ ...vin, addresses: 'coinbase', amount: txValues.vout[vinIndex].amount });
          continue;
        }

        const vinTx = await Tx.findOne({ txid : vin.txid });

        if (!vinTx) {
          txVin.push(vin);
          continue;
        }

        const vinTxVout = vinTx.vout.find(x => x.n === vin.vout);

        if (!vinTxVout) {
          txVin.push(vin);
          continue;
        }

        txVin.push({ ...vin, addresses: vinTxVout.addresses, amount: vinTxVout.amount });
      }

      if (txVin.filter(x => x.addresses === undefined).length === txValues.vin.filter(x => x.addresses === undefined).length) {
        continue;
      }

      const updateValues = { vin : txVin };

      if (txVin.filter(x => x.addresses !== undefined).length === txValues.vin.length) {
        updateValues.fullvin = true;
        fullTxs.push(txValues.txid);
      }

      await Tx.update({ txid : tx.txid }, updateValues);
    }

    logger.info(`Checked ${ txes.length } in ${ calcJobTime(checkTxsBatchStartTime) }, full txs: ${ fullTxs.join(', ') }`);
  }
}

async function main() {
  await initWorker();
}

main();
