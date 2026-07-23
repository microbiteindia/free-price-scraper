const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ status: 'online', message: 'Price Scraper Service Ready' });
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
                '--window-size=1920,1080'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // Set natural browser headers to avoid detection
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        );

        const isFlipkart = targetUrl.includes('flipkart.com');

        // Navigate to URL
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });

        // Flipkart specific: Wait brief moment for client rendering
        if (isFlipkart) {
            try {
                // Wait for any heading or main block
                await page.waitForSelector('h1, span.VU-516, div.Nx9qGe, meta[property="og:title"]', { timeout: 6000 });
            } catch (e) {
                // Continue if selector wait times out
            }
        }

        const data = await page.evaluate((isFlipkart) => {
            const cleanPrice = (text) => {
                if (!text) return 0;
                const matches = text.replace(/[^0-9.]/g, '');
                return parseFloat(matches) || 0;
            };

            const getMeta = (prop) => {
                const el = document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`);
                return el ? el.getAttribute('content') : '';
            };

            let title = '';
            let priceText = '';
            let image = '';

            if (isFlipkart) {
                // 1. Flipkart Title Fallbacks
                const titleSelectors = [
                    'span.VU-516',
                    'span.B_NuT2',
                    'h1._6ERy96',
                    'h1.yhR1f2',
                    'h1 span',
                    'h1'
                ];
                for (const s of titleSelectors) {
                    const el = document.querySelector(s);
                    if (el && el.innerText.trim()) {
                        title = el.innerText.trim();
                        break;
                    }
                }
                if (!title) title = getMeta('og:title');

                // 2. Flipkart Price Fallbacks
                const priceSelectors = [
                    'div.Nx9qGe',
                    'div._30jeq3',
                    'div._16J9Bu',
                    'div.hl25yM',
                    'div._35Ky26'
                ];
                for (const s of priceSelectors) {
                    const el = document.querySelector(s);
                    if (el && el.innerText.trim()) {
                        priceText = el.innerText.trim();
                        break;
                    }
                }
                if (!priceText) {
                    priceText = getMeta('product:price:amount') || getMeta('og:price:amount');
                }

                // 3. Flipkart Image Fallbacks
                const imgSelectors = [
                    'img._396cs4',
                    'img.DCY3L0',
                    'img._2r_T1I',
                    'img[src*="flipkart.com/image"]'
                ];
                for (const s of imgSelectors) {
                    const el = document.querySelector(s);
                    if (el && el.src) {
                        image = el.src;
                        break;
                    }
                }
                if (!image) image = getMeta('og:image');

            } else {
                // Amazon logic (Preserved from working state)
                const titleEl = document.querySelector('#productTitle') || document.querySelector('h1 span');
                title = titleEl ? titleEl.innerText.trim() : (getMeta('title') || getMeta('og:title'));

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
                image = imgEl ? imgEl.src : getMeta('og:image');
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
    console.log(`Server started on port ${PORT}`);
});