const mongoose = require('mongoose');
const { logger } = require('../lib/logger');

let connected = false;
mongoose.connection.on('connected', () => { connected = true; logger.info('mongodb_connected', { readyState: mongoose.connection.readyState }); });
mongoose.connection.on('disconnected', () => { connected = false; logger.warn('mongodb_disconnected'); });
mongoose.connection.on('error', (error) => { connected = false; logger.error('mongodb_connection_error', { errorName: error.name, message: error.message }); });

async function connectDatabase(uri, options = {}) {
  if (!uri) throw new Error('MONGODB_URI is not configured.');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, ...options });
  connected = mongoose.connection.readyState === 1;
  return mongoose.connection;
}
async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  connected = false;
}
function isDatabaseReady() { return connected && mongoose.connection.readyState === 1; }
module.exports = { connectDatabase, disconnectDatabase, isDatabaseReady };
