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
                '--disable-blink-features=AutomationControlled',
                '--window-size=1920,1080'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // Set realistic browser headers to bypass basic detection
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        );

        const isFlipkart = targetUrl.includes('flipkart.com');

        // Navigate to the target page
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // IMPORTANT FOR FLIPKART: Wait up to 5s for hydrated DOM elements
        if (isFlipkart) {
            try {
                await page.waitForSelector('h1, span.VU-516, .B_NuT2', { timeout: 5000 });
            } catch (e) {
                // Continue even if timeout occurs
            }
        }

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
                // Expanded Flipkart Selectors
                const titleSelectors = [
                    'span.VU-516',
                    'span.B_NuT2',
                    'h1.yhR1f2',
                    'h1._6ERy96',
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
            } else {
                // Amazon Selectors
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