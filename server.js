const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/scrape', async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).json({ success: false, message: 'Missing URL parameter' });
  }

  let browser;
  try {
    // Launch headless Chromium browser
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    
    // Set human user agent & viewport
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    let result = { price: 0, title: '', image: '', rating: '', url: targetUrl };

    if (targetUrl.includes('amazon')) {
      result = await page.evaluate(() => {
        const priceEl = document.querySelector('.a-price-whole') || document.querySelector('.a-offscreen');
        const titleEl = document.getElementById('productTitle');
        const imgEl = document.querySelector('#landingImage') || document.querySelector('#imgBlkFront');
        const ratingEl = document.querySelector('span.a-icon-alt');

        const rawPrice = priceEl ? priceEl.innerText.replace(/[^0-9.]/g, '') : '0';
        const ratingMatch = ratingEl ? ratingEl.innerText.match(/([0-9\.]+)/) : null;

        return {
          price: parseFloat(rawPrice) || 0,
          title: titleEl ? titleEl.innerText.trim() : '',
          image: imgEl ? imgEl.src : '',
          rating: ratingMatch ? ratingMatch[1] : ''
        };
      });
    } else if (targetUrl.includes('flipkart')) {
      result = await page.evaluate(() => {
        const priceEl = document.querySelector('div.Nx9bqj') || document.querySelector('div._30jeq3');
        const titleEl = document.querySelector('span.VU-Fc7') || document.querySelector('span.B_NuCn') || document.querySelector('h1');
        const imgEl = document.querySelector('img._D2B91') || document.querySelector('img._396cs4');
        const ratingEl = document.querySelector('div.X3rA3') || document.querySelector('div._1lda');

        const rawPrice = priceEl ? priceEl.innerText.replace(/[^0-9.]/g, '') : '0';

        return {
          price: parseFloat(rawPrice) || 0,
          title: titleEl ? titleEl.innerText.trim() : '',
          image: imgEl ? imgEl.src : '',
          rating: ratingEl ? ratingEl.innerText.trim() : ''
        };
      });
    }

    await browser.close();
    return res.json({ success: result.price > 0, ...result });

  } catch (error) {
    if (browser) await browser.close();
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Puppeteer microservice running on port ${PORT}`);
});