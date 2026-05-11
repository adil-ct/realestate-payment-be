import mongoose from 'mongoose';
import process from 'process';
import logger from '../config/logger.js';
import db_string from '../config/config.js';

mongoose.connect((await db_string.db).str, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;

db.on('connected', () => {
  logger.info('Mongoose connection open to master DB');
});

db.on('error', (err) => {
  logger.debug(`Mongoose connection error for master DB: ${err}`);
});

db.on('disconnected', () => {
  logger.debug('Mongoose connection disconnected for master DB');
});

db.on('reconnected', () => {
  logger.info('Mongoose connection reconnected for master DB');
});

// If the Node process ends, close the Mongoose connection
process.on('SIGINT', () => {
  db.close(() => {
    logger.debug('Mongoose connection disconnected for master DB through app termination');
    process.exit(0);
  });
});

export default db;
