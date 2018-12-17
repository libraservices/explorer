var mongoose = require('mongoose')
  , Schema = mongoose.Schema;
 
var TxSchema = new Schema({
  raw: { type: String },
  txid: { type: String, lowercase: true, unique: true },
  vin: { type: Array, default: [] },
  vout: { type: Array, default: [] },
  total: { type: Number, default: 0 },
  timestamp: { type: Number, default: 0 },
  blockhash: { type: String },
  blockindex: {type: Number, default: 0},
  confirmations: { type: Number, default: 0 },
  fullvin : { type: Boolean, default: false },
  calculated : { type: Boolean, default: false }
}, {id: false});

TxSchema.index({ txid: 1 });
TxSchema.index({ blockindex: 1 });
TxSchema.index({ timestamp: 1, blockindex: 1 });

module.exports = mongoose.model('Tx', TxSchema);
