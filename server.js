const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ status: 'active', message: 'Scraper service is running.' });
});

app.get('/scrape', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).json({ success: false, error: "Missing 'url' query parameter" });
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--window-size=1920,1080',
                '--start-maximized'
            ]
        });

        const page = await browser.newPage();

        // 1. Configure anti-bot headers
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
        );
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        });

        const isFlipkart = targetUrl.includes('flipkart.com');

        // 2. Navigate with NetworkIdle to wait for full DOM hydration
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 45000 });

        // 3. Close Flipkart popup modal if present
        if (isFlipkart) {
            try {
                const closeBtn = await page.$('button._2KpZ6l._2doB4z, button._2xm1JU');
                if (closeBtn) await closeBtn.click();
            } catch (e) {
                // Ignore if pop-up does not exist
            }
        }

        // 4. Extract data using both DOM selectors and Meta Tags (Fallback)
        const data = await page.evaluate((isFlipkart) => {
            const cleanPrice = (text) => {
                if (!text) return 0;
                const matches = text.replace(/[^0-9.]/g, '');
                return parseFloat(matches) || 0;
            };

            const getMeta = (property) => {
                const el = document.querySelector(`meta[property="${property}"], meta[name="${property}"]`);
                return el ? el.getAttribute('content') : null;
            };

            let title = '';
            let priceText = '';
            let image = '';

            if (isFlipkart) {
                // Primary UI Selectors
                const titleEl = document.querySelector('span.VU-516') || document.querySelector('.B_NuT2') || document.querySelector('h1');
                title = titleEl ? titleEl.innerText.trim() : (getMeta('og:title') || '');

                const priceEl = document.querySelector('div.Nx9qGe') || document.querySelector('div._30jeq3') || document.querySelector('div._16J9Bu');
                priceText = priceEl ? priceEl.innerText.trim() : (getMeta('product:price:amount') || getMeta('og:price:amount') || '');

                const imgEl = document.querySelector('img._396cs4') || document.querySelector('img.DCY3L0') || document.querySelector('img._2r_T1I');
                image = imgEl ? imgEl.src : (getMeta('og:image') || '');
            } else {
                // Amazon UI Selectors
                const titleEl = document.querySelector('#productTitle') || document.querySelector('h1 span');
                title = titleEl ? titleEl.innerText.trim() : (getMeta('title') || getMeta('og:title') || '');

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
                if (!priceText) {
                    priceText = getMeta('product:price:amount') || getMeta('og:price:amount') || '';
                }

                const imgEl = document.querySelector('#landingImage') || document.querySelector('#imgBlkFront');
                image = imgEl ? imgEl.src : (getMeta('og:image') || '');
            }

            return {
                title,
                price: cleanPrice(priceText),
                image
            };
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});