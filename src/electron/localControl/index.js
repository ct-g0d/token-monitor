'use strict';

const { createRpcDispatcher } = require('./dispatch');
const { createLocalControlServer, startLocalControlServer, MAX_BODY_BYTES } = require('./server');
const { generateToken, constantTimeCompare, writeControlFile, removeControlFile } = require('./token');
const { sanitizeResponse, redactHomePath } = require('./redact');

module.exports = {
  createRpcDispatcher,
  createLocalControlServer,
  startLocalControlServer,
  MAX_BODY_BYTES,
  generateToken,
  constantTimeCompare,
  writeControlFile,
  removeControlFile,
  sanitizeResponse,
  redactHomePath
};
