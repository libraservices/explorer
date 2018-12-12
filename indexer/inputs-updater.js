const mongoose = require('mongoose');
const settings = require('../lib/settings');
const Logger = require('../lib/logger');
const { attempts, mongooseConnect } = require('./async-lib');

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

    logger.info(`Found ${ nTxes } not full txes`);

    for (let i = 0; i < nTxes; i += limit) {
      const bulk = Tx.collection.initializeUnorderedBulkOp();
      const txes = await Tx.find({ fullvin : false }).sort({ txid: 1 }).limit(limit).skip(i).exec();

      logger.info(`Handling ${ (i + limit) } of ${ nTxes } (${ ((i + limit) / nTxes) * 100 }%)`);

      const relatedTxesHashed = txes.reduce((acc, tx) => {
        for (let vin of tx.vin) {
          if (acc.findIndex(x => x !== vin.txid) === -1 && txes.findIndex(x => x.txid !== vin.txid) === -1) {
            acc.push(vin.txid);
          }
        }

        return acc;
      }, []);

      const relatedTxes = relatedTxesHashed.length ? await Tx.find({ txid: relatedTxesHashed }) : [];

      for (let tx of txes) {
        const txVin = [];

        for (const vinIndex in tx.vin) {
          const vin = tx.vin[vinIndex];

          if (vin.coinbase) {
            txVin.push({ ...vin, addresses: 'coinbase', amount: tx.vout[vinIndex].amount });
          } else {
            const vinTx = txes.find(x => x.txid === vin.txid) || relatedTxes.find(x => x.txid === vin.txid);

            if (vinTx) {
              const vinTxVout = vinTx.vout.find(x => x.n === vin.vout);

              if (vinTxVout) {
                txVin.push({ ...vin, addresses: vinTxVout.addresses, amount: vinTxVout.amount });
              }
            }
          }
        }

        if (txVin.length === tx.vin.length) {
          bulk.find({ txid: tx.txid }).update({ $set: { vin: txVin, fullvin: true } });
        }
      }

      if (bulk.length) {
        const bulkLength = bulk.length;

        await bulk.execute();

        logger.info(`Done ${ bulkLength } bulk operations`);
      }
    }
  }
}

async function main() {
  await initWorker();
}

main();
