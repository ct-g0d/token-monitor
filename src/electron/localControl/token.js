'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function constantTimeCompare(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') {
    return false;
  }
  const bufA = Buffer.from(provided);
  const bufB = Buffer.from(expected);
  if (bufA.length !== bufB.length) {
    // Perform dummy timingSafeEqual to avoid timing discrepancy on length check
    if (bufA.length > 0) {
      crypto.timingSafeEqual(bufA, bufA);
    }
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function writeControlFile(filePath, state) {
  const content = JSON.stringify(state, null, 2);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const options = process.platform !== 'win32' ? { mode: 0o600 } : {};

  fs.writeFileSync(tempPath, content, options);
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(tempPath, 0o600);
    } catch (_) {}
  }
  fs.renameSync(tempPath, filePath);
}

function removeControlFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
    }
  } catch (_) {}
}

module.exports = {
  generateToken,
  constantTimeCompare,
  writeControlFile,
  removeControlFile
};
