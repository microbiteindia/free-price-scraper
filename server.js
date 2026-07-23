const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Enable stealth plugin
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

// Root test route
app.get('/', (req, res) => {
    res.json({ message: 'Puppeteer scraper service is online!' });
});

// Scraping endpoint
app.get('/scrape', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).json({ success: false, error: "Missing 'url' parameter" });
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,1080'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const isFlipkart = targetUrl.includes('flipkart.com');

        const data = await page.evaluate((isFlipkart) => {
            const cleanPrice = (text) => {
                if (!text) return 0;
                const matches = text.replace(/[^0-9.]/g, '');
                return parseFloat(matches) || 0;
            };

            let title = '';
            let priceText = '';
            let image = '';

            if (isFlipkart) {
                const titleEl = document.querySelector('span.VU-516') || document.querySelector('.B_NuT2') || document.querySelector('h1');
                title = titleEl ? titleEl.innerText.trim() : '';

                const priceEl = document.querySelector('div.Nx9qGe') || document.querySelector('div._30jeq3') || document.querySelector('div._16J9Bu');
                priceText = priceEl ? priceEl.innerText.trim() : '';

                const imgEl = document.querySelector('img._396cs4') || document.querySelector('img.DCY3L0');
                image = imgEl ? imgEl.src : '';
            } else {
                const titleEl = document.querySelector('#productTitle') || document.querySelector('h1 span');
                title = titleEl ? titleEl.innerText.trim() : '';

                const priceSelectors = [
                    '.a-price .a-offscreen',
                    '#priceblock_ourprice',
                    '#priceblock_dealprice',
                    '.a-price-whole',
                    '#corePrice_feature_div .a-offscreen'
                ];
                for (const selector of priceSelectors) {
                    const el = document.querySelector(selector);
                    if (el && el.innerText.trim()) {
                        priceText = el.innerText.trim();
                        break;
                    }
                }

                const imgEl = document.querySelector('#landingImage') || document.querySelector('#imgBlkFront');
                image = imgEl ? imgEl.src : '';
            }

            return { title, price: cleanPrice(priceText), image };
        }, isFlipkart);

        await browser.close();

        return res.json({
            success: data.price > 0 || data.title !== '',
            ...data
        });

    } catch (err) {
        if (browser) await browser.close();
        return res.status(500).json({ success: false, error: err.message });
    }
});

// START EXPRESS SERVER (Prevents early exit)
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});