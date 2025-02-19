import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import minimist from 'minimist';
import fs from 'fs-extra';
import PQueue from 'p-queue';

puppeteer.use(StealthPlugin());

// A small pool of realistic user agents
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/88.0.4324.182 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36',
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function randomDelay(minMs, maxMs) {
  return randomInt(minMs, maxMs);
}

// Removes a 4-digit year (e.g., "1999" or "2010") from a string.
function removeYear(str) {
  return str.replace(/\b(19|20)\d{2}\b/g, '').trim();
}

// Scrolls the page in small steps to mimic human behavior.
async function randomScroll(page) {
  const steps = randomInt(2, 5);
  for (let i = 0; i < steps; i++) {
    await page.evaluate((scrollStep) => {
      window.scrollBy(0, scrollStep);
    }, randomInt(200, 600));
    await sleep(randomDelay(300, 800)); // shorter delay for improved performance
  }
}

const BASE_URL = 'https://www.vivino.com';
const SEARCH_PATH = '/search/wines?q=';

// Helper: Chunk an array into pieces of a given size.
function chunkArray(arr, chunkSize) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    chunks.push(arr.slice(i, i + chunkSize));
  }
  return chunks;
}

// Functions to set and verify the "Ship To" destination on the site.
async function setShipTo(countryCode, stateCode, page) {
  return page.evaluate(
    async (c, s) => {
      const token = document.querySelector('[name="csrf-token"]')?.content;
      if (!token) return false;
      const fetchResult = await fetch('https://www.vivino.com/api/ship_to/', {
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': token,
        },
        body: JSON.stringify({ country_code: c, state_code: s }),
        method: 'PUT',
      });
      if (fetchResult.status === 200) {
        const result = await fetchResult.json();
        return (
          result?.ship_to?.country_code?.toLowerCase() === c.toLowerCase() &&
          result?.ship_to?.state_code?.toLowerCase() === s.toLowerCase()
        );
      }
      return false;
    },
    countryCode,
    stateCode
  );
}

async function isShipTo(countryCode, stateCode, page) {
  return page.evaluate(
    (c, s) => {
      return (
        c.toLowerCase() === window.__PRELOADED_COUNTRY_CODE__?.toLowerCase() &&
        s.toLowerCase() === window.__PRELOADED_STATE_CODE__?.toLowerCase()
      );
    },
    countryCode,
    stateCode
  );
}

// Extracts rating data from the page.
function collectItems() {
  const numerize = (stringNumber) => {
    const str = stringNumber.replace(/[^0-9,.]+/g, '').replace(',', '.');
    return parseFloat(str);
  };

  const card = document.querySelector('.card.card-lg');
  if (!card) {
    return {
      average_rating: null,
      rating_link: null,
    };
  }

  const ratingElem = card.querySelector('.average__number');
  let rating = null;
  if (ratingElem) {
    const rawText = ratingElem.textContent.trim();
    rating = numerize(rawText);
  }

  const linkElem = card.querySelector('a[data-cartitemsource="text-search"]');
  let ratingLink = null;
  if (linkElem) {
    const href = linkElem.getAttribute('href');
    if (href) {
      ratingLink = 'https://www.vivino.com' + href;
    }
  }

  return {
    average_rating: rating,
    rating_link: ratingLink,
  };
}

// Navigates to a URL with retries and exponential backoff.
async function robustGoto(page, url, maxRetries = 3) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      // Wait for the key element to appear.
      await page.waitForSelector('.card.card-lg', { timeout: 5000 });
      return response;
    } catch (err) {
      attempt++;
      const delay = 1000 * Math.pow(2, attempt);
      console.warn(
        `Retry ${attempt} for ${url} after ${delay}ms due to error: ${err.message}`
      );
      await sleep(delay);
    }
  }
  throw new Error(`Failed to load ${url} after ${maxRetries} attempts`);
}

// Creates a new page (in the current browser instance) to search for a wine.
async function searchWine(browser, wineTerm) {
  const p = await browser.newPage();

  // Set random user agent, viewport, and enable request interception.
  await p.setUserAgent(USER_AGENTS[randomInt(0, USER_AGENTS.length - 1)]);
  await p.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
  await p.setViewport({ width: randomInt(1366, 1920), height: randomInt(768, 1080) });
  await p.setRequestInterception(true);
  p.on('request', (req) => {
    const allowed = ['document', 'xhr', 'fetch', 'script', 'stylesheet', 'image'];
    allowed.includes(req.resourceType()) ? req.continue() : req.abort();
  });

  const url = BASE_URL + SEARCH_PATH + encodeURIComponent(wineTerm);
  let rating = null;
  let link = null;

  try {
    await robustGoto(p, url);
    await randomScroll(p);
    const result = await p.evaluate(collectItems);
    if (result.average_rating && result.average_rating <= 5) {
      rating = result.average_rating;
    }
    link = result.rating_link || null;
  } catch (err) {
    console.error(`   → searchWine error for ${wineTerm}: ${err.message}`);
  }
  await p.close();
  return { rating, link };
}

// Processes a single wine search.
async function processWine(wine, index, total, browser) {
  const searchTerm = wine.wine_name || 'Unknown Wine';
  console.log(`(${index + 1}/${total}) Searching for: ${searchTerm}`);

  let { rating, link } = await searchWine(browser, searchTerm);

  // If no rating is found, try again after removing the year.
  if (!rating) {
    const noYearTerm = removeYear(searchTerm);
    if (noYearTerm !== searchTerm) {
      console.log(`   → No rating found. Trying without year: "${noYearTerm}"`);
      await sleep(randomDelay(500, 1500));
      const retryResult = await searchWine(browser, noYearTerm);
      if (retryResult.rating) {
        rating = retryResult.rating;
        link = retryResult.link;
      }
    }
  }
  wine.rating = rating || null;
  wine.rating_link = link || null;

  if (wine.rating) {
    console.log(`   → Found rating: ${wine.rating}`);
  } else {
    console.log('   → No rating found.');
  }
  if (wine.rating_link) {
    console.log(`   → Rating link: ${wine.rating_link}`);
  }
}

(async () => {
  // Parse command-line arguments (including distributed worker options).
  const args = minimist(process.argv.slice(2));
  const country = args.country || 'US';
  let state = args.state || '';
  if (country.toLowerCase() === 'us' && !state) {
    state = 'CA';
  }

  // Distributed scraping options: e.g., --workerId=0 --totalWorkers=3.
  const workerId = args.workerId ? parseInt(args.workerId, 10) : 0;
  const totalWorkers = args.totalWorkers ? parseInt(args.totalWorkers, 10) : 1;

  // 1) Read the entire JSON file.
  let allData;
  try {
    allData = await fs.readJSON('items.json');
  } catch (err) {
    console.error('Error reading items.json:', err);
    process.exit(1);
  }

  // 2) Extract and partition the wines array if running distributed.
  let wines = allData.wines;
  if (!Array.isArray(wines)) {
    console.error('Error: "wines" property is not an array in items.json');
    process.exit(1);
  }
  if (totalWorkers > 1) {
    const total = wines.length;
    const startIndex = Math.floor((workerId * total) / totalWorkers);
    const endIndex = Math.floor(((workerId + 1) * total) / totalWorkers);
    wines = wines.slice(startIndex, endIndex);
    console.log(`Worker ${workerId} processing wines from index ${startIndex} to ${endIndex}`);
  } else {
    console.log(`Processing all ${wines.length} wines.`);
  }

  // 3) Process wines in chunks—for each chunk, launch a new browser instance for full session isolation.
  const CHUNK_SIZE = 20;
  const wineChunks = chunkArray(wines, CHUNK_SIZE);
  let processedCount = 0;

  for (const chunk of wineChunks) {
    console.log(`\n=== Starting new session for wines ${processedCount + 1} to ${processedCount + chunk.length} ===`);

    // Launch a new browser instance (fresh session) for this chunk.
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    // Create a main page to set the "Ship To" destination.
    const mainPage = await browser.newPage();
    await mainPage.setUserAgent(USER_AGENTS[randomInt(0, USER_AGENTS.length - 1)]);
    await mainPage.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await mainPage.setViewport({ width: randomInt(1366, 1920), height: randomInt(768, 1080) });
    await mainPage.setRequestInterception(true);
    mainPage.on('request', (req) => {
      const allowed = ['document', 'xhr', 'fetch', 'script', 'stylesheet', 'image'];
      allowed.includes(req.resourceType()) ? req.continue() : req.abort();
    });

    try {
      await robustGoto(mainPage, BASE_URL);
      await randomScroll(mainPage);
      let shipToOk = await isShipTo(country, state, mainPage);
      if (!shipToOk) {
        const setOk = await setShipTo(country, state, mainPage);
        if (setOk) {
          await robustGoto(mainPage, BASE_URL);
          await randomScroll(mainPage);
          shipToOk = await isShipTo(country, state, mainPage);
        }
        if (!shipToOk) {
          console.error('Error: Could not confirm Ship To destination.');
        }
      }
    } catch (err) {
      console.error('Error setting Ship To destination:', err);
    }
    await mainPage.close();

    // Create a concurrency queue for this chunk (using a concurrency of 3).
    const queue = new PQueue({ concurrency: 3 });
    for (let i = 0; i < chunk.length; i++) {
      const wineIndex = processedCount + i;
      queue.add(async () => {
        await processWine(chunk[i], wineIndex, wines.length, browser);
        await sleep(randomDelay(1000, 2000));
        if ((wineIndex + 1) % 5 === 0) {
          console.log('Taking a longer break to mimic human behavior...');
          await sleep(randomDelay(5000, 10000));
        }
      });
    }
    await queue.onEmpty();
    await queue.onIdle();
    processedCount += chunk.length;

    // Close the browser instance for this chunk (session ends here).
    await browser.close();
    console.log(`=== Finished session for wines up to ${processedCount} ===\n`);
    await sleep(randomDelay(5000, 10000)); // Delay between chunks.
  }

  // 4) Write the updated wines array to a worker-specific output file.
  try {
    let outputData = { ...allData, wines };
    const outputFileName = `items_worker_${workerId}.json`;
    await fs.writeJSON(outputFileName, outputData, { spaces: 2 });
    console.log(`Successfully wrote results to ${outputFileName}`);
  } catch (err) {
    console.error('Error writing output file:', err);
  }
})();
