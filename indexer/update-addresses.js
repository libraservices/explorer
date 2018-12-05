const mongoose = require('mongoose');
const settings = require('../lib/settings');
const { attempts, mongooseConnect } = require('./async-lib');

const Tx = require('../models/tx');
const Address = require('../models/address');

const dbString = `mongodb://${ settings.dbsettings.user }:${ settings.dbsettings.password }@${ settings.dbsettings.address }:${ settings.dbsettings.port }/${ settings.dbsettings.database }`;

async function main() {
  await tryMongooseConnect();
  await startUpdatingAddresses();
}

async function tryMongooseConnect() {
  await attempts(1000, 10000, 1.5, () => mongooseConnect(dbString), (interval, e) => {
    console.error(`Error connecting to mongodb. Next try in ${ parseFloat(interval / 1000, 10) } s...`);
    console.error(e);
  });

  console.log(`Connected to mongodb`);
}

async function startUpdatingAddresses() {
  await updateAddresses();

  setTimeout(startUpdatingAddresses, 1000);
}

async function updateAddresses() {
  const nTxes = await Tx.count({ fullvin: true, calculated: false });

  console.log(`Updating addresses, found not used txes: ${ nTxes }`)

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
    await bulk.execute();

    if (txsBulk.length) {
      await txsBulk.execute();
    }

    console.log(`Done ${ bulk.length + txsBulk.length } bulk operations`);
  }
}

main().catch(e => {
  console.error(e);

  mongoose.disconnect();
});