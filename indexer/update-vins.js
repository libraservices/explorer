const mongoose = require('mongoose');
const settings = require('../lib/settings');
const { attempts, mongooseConnect } = require('./async-lib');

const Tx = require('../models/tx');

const dbString = `mongodb://${ settings.dbsettings.user }:${ settings.dbsettings.password }@${ settings.dbsettings.address }:${ settings.dbsettings.port }/${ settings.dbsettings.database }`;

var zeroedAttempts = 0;

async function main() {
  await tryMongooseConnect();
  await startUpdatingVin();
}

async function tryMongooseConnect() {
  await attempts(1000, 10000, 1.5, () => mongooseConnect(dbString), (interval, e) => {
    console.error(e);
    console.error(`Error connecting to mongodb. Next try in ${ parseFloat(interval / 1000, 10) } s...`);
  });

  console.log(`Connected to mongodb`);
}

async function startUpdatingVin() {
  await updateVin();

  setTimeout(startUpdatingVin, 1000);
}

async function updateVin() {
  const nTxes = await Tx.count({ fullvin: false });
  const bulk = Tx.collection.initializeUnorderedBulkOp();

  console.log(`Updating vout for not updated txs, found ${ nTxes }`);

  for (let i = 0; i < nTxes; i += 1000) {
    const txes = await Tx.find({ fullvin : false }).skip(i).limit(1000).exec();
    const relatedTxesHashed = txes.reduce((acc, tx) => {
      for (let vin of tx.vin) {
        if (acc.findIndex(x => x !== vin.txid) === -1 && txes.findIndex(x => x.txid !== vin.txid) === -1) {
          acc.push(vin.txid);
        }

        return acc;
      }
    }, []);

    const relatedTxes = relatedTxesHashed.length ? await Tx.find({ txid: relatedTxesHashed }) : [];

    for (let tx of txes) {
      const txVin = [];

      for (const vin of tx.vin) {
        const vinTx = txes.find(x => x.txid === vin.txid) || relatedTxes.find(x => x.txid === vin.txid);

        if (vinTx) {
          const vinTxVout = vinTx.vout.find(x => x.n === vin.vout);

          if (vinTxVout) {
            txVin.push({ ...vin, addresses: vinTxVout.addresses, amount: vinTxVout.amount });
          }
        }
      }

      if (txVin.length === tx.vin.length) {
        bulk.find({ txid: tx.txid }).update({ $set: { vin: txVin, fullvin: true } });
      }
    }
  }

  if (bulk.length) {
    await bulk.execute();
    console.log(`Done ${ bulk.length } bulk operations`);
  }
}

main().catch(e => {
  console.error(e);

  mongoose.disconnect();
});