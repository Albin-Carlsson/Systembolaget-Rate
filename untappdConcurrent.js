#!/usr/bin/env node
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs-extra';
import PQueue from 'p-queue';

// Use the stealth plugin to help bypass bot detection.
puppeteer.use(StealthPlugin());

// A pool of realistic user agents.
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/88.0.4324.182 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36',
];

// Helper: sleep for a specified number of milliseconds.
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper: generate a random integer between min and max (inclusive).
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper: generate a random delay between min and max milliseconds.
function randomDelay(minMs, maxMs) {
  return randomInt(minMs, maxMs);
}

// Helper: perform some random scrolling to mimic a real user.
async function randomScroll(page) {
  const steps = randomInt(2, 5);
  for (let i = 0; i < steps; i++) {
    await page.evaluate((scrollStep) => {
      window.scrollBy(0, scrollStep);
    }, randomInt(200, 600));
    await sleep(randomDelay(500, 1500));
  }
}

/**
 * Searches Untappd for a given beer name and extracts the rating and rating link.
 * @param {string} beerName - The name of the beer to search.
 * @param {object} browser - The Puppeteer browser instance.
 * @returns {Promise<{rating: string|null, rating_link: string|null}>}
 */
async function fetchBeerRating(beerName, browser) {
  const page = await browser.newPage();

  // Randomize user agent and viewport.
  await page.setUserAgent(USER_AGENTS[randomInt(0, USER_AGENTS.length - 1)]);
  await page.setViewport({
    width: randomInt(1366, 1920),
    height: randomInt(768, 1080),
  });

  // Intercept and block unnecessary requests to reduce load.
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const allowedTypes = ['document', 'xhr', 'fetch', 'script', 'stylesheet'];
    if (allowedTypes.includes(req.resourceType())) {
      req.continue();
    } else {
      req.abort();
    }
  });

  try {
    console.log(`Processing beer: ${beerName}`);
    const searchUrl = `https://untappd.com/search?q=${encodeURIComponent(beerName)}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Mimic human behavior by scrolling a bit.
    await randomScroll(page);

    // Wait for the rating element to appear (adjust timeout if needed).
    await page.waitForSelector('span.num', { timeout: 5000 });

    // Extract the rating number (assumes format like "(3.677)").
    const rating = await page.evaluate(() => {
      const ratingEl = document.querySelector('span.num');
      if (ratingEl) {
        return ratingEl.innerText.trim().replace(/[()]/g, '');
      }
      return null;
    });

    // Extract the first beer result link.
    const rating_link = await page.evaluate(() => {
      const linkEl = document.querySelector('p.name a');
      if (linkEl) {
        const href = linkEl.getAttribute('href');
        return href ? 'https://untappd.com' + href : null;
      }
      return null;
    });

    console.log(`→ Found rating: ${rating} | Link: ${rating_link}`);
    return { rating, rating_link };
  } catch (err) {
    console.error(`Error processing "${beerName}": ${err.message}`);
    return { rating: null, rating_link: null };
  } finally {
    await page.close();
  }
}

(async () => {
  // Read the JSON file containing beer data.
  let data;
  try {
    data = await fs.readJSON('items.json');
  } catch (err) {
    console.error('Error reading items.json:', err);
    process.exit(1);
  }

  const beers = data.beers;
  if (!Array.isArray(beers)) {
    console.error('Error: "beers" property is not an array in items.json');
    process.exit(1);
  }

  // Launch Puppeteer with headless mode and necessary flags.
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  // Create a concurrency queue (adjust concurrency as needed).
  const queue = new PQueue({ concurrency: 3 });

  // Add a task for each beer.
  beers.forEach((beer, index) => {
    queue.add(async () => {
      const beerName = beer.beer_name || 'Unknown Beer';
      const result = await fetchBeerRating(beerName, browser);
      beer.rating = result.rating;
      beer.rating_link = result.rating_link;

      // Random delay between tasks to mimic human behavior.
      await sleep(randomDelay(1500, 3000));

      // Every 5 items, take a longer break.
      if ((index + 1) % 5 === 0) {
        console.log('Taking a longer break to appear more human...');
        await sleep(randomDelay(8000, 15000));
      }
    });
  });

  // Wait for all tasks to finish.
  await queue.onIdle();
  await browser.close();

  // Write updated data back to the JSON file.
  try {
    await fs.writeJSON('items.json', data, { spaces: 2 });
    console.log("Successfully updated items.json with ratings and rating links.");
  } catch (err) {
    console.error("Error writing items.json:", err);
  }
})();