const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Tells Puppeteer to store the downloaded browser inside the project folder
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};