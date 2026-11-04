const mongoose = require('mongoose');
const { logger } = require('../lib/logger');
async function connectDatabase(uri, options = {}) {
  if (!uri) throw new Error('MONGODB_URI is not configured.');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, ...options });
  logger.info('mongodb_connected', { readyState: mongoose.connection.readyState });
  return mongoose.connection;
}
function isDatabaseReady() { return mongoose.connection.readyState === 1; }
module.exports = { connectDatabase, isDatabaseReady };
