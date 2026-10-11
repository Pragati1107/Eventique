const mongoose = require('mongoose');
const config = require('./config');

async function connect(uri = config.mongoUri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { autoIndex: !config.isProd });
  console.log(`[db] connected to ${uri.replace(/\/\/[^@]*@/, '//***@')}`);
  return mongoose.connection;
}

module.exports = { connect, mongoose };
