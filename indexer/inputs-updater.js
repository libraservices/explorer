const mongoose = require('mongoose');
const settings = require('../lib/settings');
const Logger = require('../lib/logger');
const { attempts, calcJobTime, mongooseConnect } = require('./async-lib');

const Tx = require('../models/tx');

async function initWorker() {
  const logger = new Logger('inputs-updater');

  await tryMongooseConnect();
  await startUpdatingInputs();

  async function tryMongooseConnect() {
    await attempts(1000, 10000, 1.5, () => mongooseConnect(settings.dbsettings.connectionString), (ms, e) => {
      logger.error(`Failed to connect to the mongodb server (${ settings.dbsettings.connectionString }). Next attempt in ${ parseFloat(ms / 1000) }s`);
      logger.error(e);
    });

    logger.info(`Connected to mongodb`);
  }

  async function startUpdatingInputs() {
    await updateInputs();

    setTimeout(startUpdatingInputs, 1000);
  }

  async function updateInputs() {
    const nTxes = await Tx.count({ fullvin: false });
    const limit = 10000;
    const checkAllTxsStartTime = Date.now();

    logger.info(`Found ${ nTxes } not full txes`);

    const checkTxsBatchStartTime = Date.now();
    const txes = await Tx.find({ fullvin : false }).sort({ blockindex: 1 }).limit(limit).exec();

    logger.info(`Handling ${ txes.length } txs`);

    const fullTxs = [];

    for (const tx of txes) {
      if (await updateTxInputs(tx)) {
        fullTxs.push(tx.txid);
      }
    }

    logger.info(`Checked ${ txes.length } in ${ calcJobTime(checkTxsBatchStartTime) }, full txs: ${ fullTxs.join(', ') }`);
  }

  async function updateTxInputs(tx) {
    const txValues = tx.toJSON();
    const txVin = await fillTxInputs(txValues);

    if (txVin.filter(x => x.addresses === undefined).length === txValues.vin.filter(x => x.addresses === undefined).length) {
      return false;
    }

    const updateValues = { vin : txVin };

    if (txVin.filter(x => x.addresses !== undefined).length === txValues.vin.length) {
      updateValues.fullvin = true;
    }

    try {
      await Tx.update({ txid : tx.txid }, updateValues);
    } catch (e) {
      logger.error(e.message);
    }

    return updateValues.fullvin !== undefined && updateValues.fullvin;
  }

  async function fillTxInputs(txValues) {
    const txVin = [];

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

    return txVin;
  }
}

async function main() {
  await initWorker();
}

main();
