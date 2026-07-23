const { resolve } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Uses absolute path to ensure extract-zip receives a valid target directory
  cacheDirectory: resolve(__dirname, '.cache', 'puppeteer'),
};