///////////////////////////////
// 1) IMMEDIATE REDIRECT IF overrideUrl IS PENDING
///////////////////////////////
(function maybeRedirectOnLoad() {
  const pendingUrl = localStorage.getItem("overrideUrl");
  if (pendingUrl) {
    console.log("[maybeRedirectOnLoad] Found overrideUrl =", pendingUrl);
    localStorage.removeItem("overrideUrl");
    window.location.href = pendingUrl;
    return;
  } else {
    console.log("[maybeRedirectOnLoad] No overrideUrl found. Continue normal flow.");
  }
})();

///////////////////////////////
// 2) HELPER FUNCTIONS
///////////////////////////////
function isSortimentPage() {
  return window.location.pathname.startsWith("/sortiment/");
}

function getPageParam() {
  const urlParams = new URLSearchParams(window.location.search);
  const pValue = urlParams.get("p");
  if (pValue) {
    const pInt = parseInt(pValue, 10);
    if (!isNaN(pInt)) {
      console.log("[getPageParam] Found page in query param:", pInt);
      return pInt;
    }
  }
  const pathSegments = window.location.pathname.split("/").filter(Boolean);
  const lastSegment = pathSegments[pathSegments.length - 1] || "";
  if (/^\d+$/.test(lastSegment)) {
    const pathInt = parseInt(lastSegment, 10);
    if (!isNaN(pathInt)) {
      console.log("[getPageParam] Found page in path:", pathInt);
      return pathInt;
    }
  }
  console.log("[getPageParam] No numeric page found, defaulting to 1.");
  return 1;
}

function buildSortUrl(newValue) {
  console.log("[buildSortUrl] newValue =", newValue);
  const [sortKey, sortDir] = newValue.split("-"); 
  let finalUrl = "/sortiment/ol/";
  if (sortKey && sortDir) {
    finalUrl += `?sortera-pa=${encodeURIComponent(sortKey)}&i-riktning=${encodeURIComponent(sortDir)}`;
  }
  return finalUrl;
}

/**
 * Parses a price string that might include characters such as a comma, colon, or period
 * as a decimal separator (e.g., "14:50*" or "14,50 kr") and returns a float.
 *
 * @param {string} priceStr - The price string to parse.
 * @returns {number} The parsed price.
 */
/**
 * Converts a price string (e.g., "2 861", "9,5kr", "3 499,90kr") to a float.
 * It removes thousands separators (spaces, periods) and currency symbols,
 * then standardizes any commas to decimal points.
 *
 * @param {string} priceStr - The price string to parse.
 * @returns {number} The numeric value of the price or NaN if invalid.
 */
/**
 * Converts a price string (e.g., "1 000", "2 861" (with a non-breaking space),
 * "3,499.90kr") to a float. It removes all non-digit, non-comma, non-period
 * characters, then standardizes commas to periods before parsing.
 *
 * @param {string} priceStr - The price string to parse.
 * @returns {number} Parsed numeric value of the price (or NaN if invalid).
 */
function parsePrice(priceStr) {
  if (!priceStr) return NaN;

  // 1) Remove trailing currency (e.g., "kr") if present
  priceStr = priceStr.replace(/\s*kr\s*$/i, "");

  // 2) Remove everything except digits, commas, and periods
  //    (this nukes all whitespace, including non-breaking spaces, plus any other symbols).
  priceStr = priceStr.replace(/[^\d.,]/g, "");

  // 3) Convert commas to periods (if your locale uses commas as decimals)
  priceStr = priceStr.replace(/,/g, ".");

  // 4) Finally parse as float
  return parseFloat(priceStr);
}

// EXAMPLES:
console.log(parsePrice("999"));         // => 999
console.log(parsePrice("1 000"));       // => 1000
console.log(parsePrice("2 861"));       // => 2861 (non-breaking space)
console.log(parsePrice("3,499.90kr"));  // => 3499.9
console.log(parsePrice("9,5"));         // => 9.5 (comma as decimal)
///////////////////////////////
// 3) RATING SELECTION LOGIC & FILTERING
///////////////////////////////

/**
 * Called when the rating (or filter) option is selected.
 * It loads the beers.json file, filters the products according to the
 * currently checked options on the page, and injects the filtered items.
 */
function onRecensionerSelected(page) {
  console.log("[onRecensionerSelected] Injecting rating-based items for page:", page);

  const container = document.querySelector("div.css-1fgrh1r.e12xogow0");
  if (!container) {
    console.warn("[onRecensionerSelected] Container not found; aborting.");
    return;
  }
  
  container.innerHTML = "";

  // Load the beers.json file from your extension
  const beersJsonUrl = chrome.runtime.getURL("beers.json");
  fetch(beersJsonUrl)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(jsonData => {
      // Check if jsonData is an array. If not, assume it has a property "beers".
      const beers = Array.isArray(jsonData) ? jsonData : (jsonData.beers || []);
      console.log("[onRecensionerSelected] Loaded", beers.length, "products.");
      
      // Filter products based on the currently checked options
      const filteredBeers = filterItems(beers);
      console.log("[onRecensionerSelected] After filtering:", filteredBeers.length, "products.");
      
      // 30 items per page
      const startIndex = (page - 1) * 30;
      const sliced = filteredBeers.slice(startIndex, startIndex + 30);

      sliced.forEach(beer => {
        // If a product comes with prebuilt HTML use that,
        // otherwise build a simple snippet.
        if (beer.data) {
          container.innerHTML += beer.data;
        } else {
          container.innerHTML += `
            <div class="beer">
              <h3>${beer.name}</h3>
              <p><strong>Brand:</strong> ${beer.brand}</p>
              <p><strong>Category:</strong> ${Array.isArray(beer.category) ? beer.category.join(", ") : beer.category}</p>
              <p><strong>Price:</strong> ${beer.price}</p>
            </div>
          `;
        }
      });
      console.log(`[onRecensionerSelected] Injected ${sliced.length} items on page ${page}.`);
    })
    .catch(error => {
      console.error("[onRecensionerSelected] Error fetching beers.json:", error);
    });
}

/**
 * Extracts the filter options from the page.
 * It searches inside the container with class "css-ceop7e e12xogow0" and
 * iterates over its child divs (each representing an option).
 *
 * In particular, it removes any trailing count in parentheses and, if the option
 * appears to be a price range, it cleans it up to a standardized format (e.g., "9.5-40kr").
 *
 * @returns {string[]} An array of filter option strings (in lower-case).
 */
function getCheckedOptions() {
  const container = document.querySelector("div.css-ceop7e.e12xogow0");
  if (!container) {
    console.warn("[getCheckedOptions] Options container not found.");
    return [];
  }
  const optionDivs = container.querySelectorAll("div.eo01jo21");
  const options = [];
  optionDivs.forEach(div => {
    const pEl = div.querySelector("p");
    if (pEl) {
      let text = pEl.textContent.trim();
      // Remove trailing count such as " (4 076)" (allowing spaces inside the parentheses)
      text = text.replace(/\s*\(\s*[\d\s]+\s*\)$/, "");
      // If the text represents a price range (allowing decimals and different separators)
      if (/^\d+(?:[.,:]\d+)?\s*-\s*\d+(?:[.,:]\d+)?\s*kr$/i.test(text)) {
        // Remove extra spaces around the dash and before "kr"
        text = text.replace(/\s*-\s*/g, "-").replace(/\s*(kr)$/i, "kr");
      }
      text = text.toLowerCase();
      options.push(text);
    }
  });
  return options;
}

/**
 * Checks if a product matches a non-price text filter.
 * It first checks if the product’s category array contains an element that
 * exactly equals the filterText (ignoring case). Optionally, other fields can be checked.
 *
 * @param {Object} product - A product object.
 * @param {string} filterText - The filter text to search for.
 * @returns {boolean} True if the product matches the filter.
 */
function matchesTextFilter(product, filterText) {
  // First, check if product.category contains an exact match.
  if (product.category && Array.isArray(product.category)) {
    if (product.category.some(item => item.trim().toLowerCase() === filterText)) {
      return true;
    }
  }
  
  // For other fields, require an exact match instead of substring matching.
  const fieldsToSearch = ["brand", "name", "country", "beer_name"];
  const filterLower = filterText.toLowerCase();
  
  return fieldsToSearch.some(field => {
    if (!product[field]) return false;
    // Exact match check (after lowercasing and trimming)
    return product[field].toString().toLowerCase().trim() === filterLower;
  });
}

/**
 * Filters the products so that only items matching ALL currently
 * checked options remain.
 *
 * - If no options are chosen, all products are returned.
 * - For options that look like a price range (e.g., "10-40kr" or "9.5-40kr"), the product’s price
 *   is compared against the extracted min and max values.
 * - For text options, the product is kept if it matches in any relevant field.
 *
 * @param {Object[]} products - Array of product objects.
 * @returns {Object[]} Filtered array of products.
 */
/**
 * Filters the products so that only items matching ALL currently
 * checked options remain.
 *
 * - If no options are chosen, all products are returned.
 * - For options that look like a price or volume range (e.g., "10-40kr" or "250-16 673 ml"),
 *   the product’s price or volume is compared against the extracted min and max values.
 * - For text options, the product is kept if it matches in any relevant field.
 *
 * @param {Object[]} products - Array of product objects.
 * @returns {Object[]} Filtered array of products.
 */
function filterItems(products) {
  const chosenOptions = getCheckedOptions();
  console.log("[filterItems] chosenOptions =", chosenOptions);

  // If no filter options checked, return everything
  if (chosenOptions.length === 0) return products;

  return products.filter(product => {
    // Product must satisfy ALL chosen options:
    return chosenOptions.every(option => {
      // If there's a dash, assume it's some kind of range
      if (option.includes("-")) {
        // If we see "ml", treat this as a volume range
        if (option.toLowerCase().includes("ml")) {
          const [rawMin, rawMax] = option.split("-");
          const minVol = parseVolume(rawMin);
          const maxVol = parseVolume(rawMax);

          if (isNaN(minVol) || isNaN(maxVol)) {
            // If parse fails, fallback to a text filter
            return matchesTextFilter(product, option);
          }
          // Compare product.volume (which should be a number in your JSON)
          return product.volume >= minVol && product.volume <= maxVol;

        } else {
          // Otherwise, default to price filtering (old logic)
          const [rawMin, rawMax] = option.split("-");
          const minPrice = parsePrice(rawMin);
          const maxPrice = parsePrice(rawMax);

          if (isNaN(minPrice) || isNaN(maxPrice)) {
            // Fallback to text filter if parse fails
            return matchesTextFilter(product, option);
          }
          const productPrice = parsePrice(product.price);
          return productPrice >= minPrice && productPrice <= maxPrice;
        }
      }
      // If no dash, just do your existing text matching
      else {
        return matchesTextFilter(product, option);
      }
    });
  });
}

function onRecensionerDeselected() {
  console.log("[onRecensionerDeselected] Called.");
}

// Decide whether rating should be applied based on localStorage + query
function checkIfRatingSelected(selectElement) {
  const lastSelected = localStorage.getItem("selectedSortOption");
  const urlParams = new URLSearchParams(window.location.search);
  const sortParam = urlParams.get("sortera-pa");
  const dirParam  = urlParams.get("i-riktning");

  console.log("[checkIfRatingSelected] localStorage =", lastSelected, " sortParam =", sortParam, " dirParam =", dirParam);

  if (lastSelected === "Rating-Descending" && sortParam === "Rating" && dirParam === "Descending") {
    console.log("[checkIfRatingSelected] -> Re-applying rating...");
    selectElement.value = "Rating-Descending";
    onRecensionerSelected(getPageParam());
  } else {
    console.log("[checkIfRatingSelected] -> Not applying rating. Removing leftover localStorage if any.");
    localStorage.removeItem("selectedSortOption");
  }
}

///////////////////////////////
// 4) DROPDOWN + EVENT HANDLERS
///////////////////////////////
function handleDropdownChange(event) {
  const newValue = event.target.value;
  const oldValue = localStorage.getItem("selectedSortOption");

  console.log("[handleDropdownChange] newValue =", newValue, "oldValue =", oldValue);

  if (newValue === "Rating-Descending") {
    console.log("[handleDropdownChange] -> Selected rating. Save + inject items.");
    localStorage.setItem("selectedSortOption", "Rating-Descending");
    // Delay injection to allow DOM changes to settle
    setTimeout(() => onRecensionerSelected(getPageParam()), 300);
  } else {
    if (oldValue === "Rating-Descending") {
      console.log("[handleDropdownChange] -> Deselecting rating. Removing localStorage.");
      onRecensionerDeselected();
      localStorage.removeItem("selectedSortOption");

      const overrideUrl = buildSortUrl(newValue);
      localStorage.setItem("overrideUrl", overrideUrl);

      console.log("[handleDropdownChange] Reloading page with overrideUrl =", overrideUrl);
      window.location.reload();
    } else {
      console.log("[handleDropdownChange] Non-rating to non-rating. Do nothing.");
    }
  }
}

// Appends the rating option (if missing) and re-check if rating is selected
function appendReviewsOption() {
  if (!isSortimentPage()) {
    console.warn("[appendReviewsOption] Not on /sortiment/. Skip.");
    return;
  }

  console.log("[appendReviewsOption] Checking for dropdown...");
  const selectElements = document.querySelectorAll("select.css-18g6poy.e1u8t75b0");
  if (!selectElements.length) {
    console.warn("[appendReviewsOption] No dropdowns found yet. Retrying in 300ms...");
    setTimeout(appendReviewsOption, 300);
    return;
  }
  
  // Ensure we have a visible dropdown
  const selectElement = Array.from(selectElements).find(el => el.offsetParent !== null);
  if (!selectElement) {
    console.warn("[appendReviewsOption] Dropdown is not visible yet. Retrying in 300ms...");
    setTimeout(appendReviewsOption, 300);
    return;
  }

  if (!selectElement.querySelector("option[value='Rating-Descending']")) {
    const optionEl = document.createElement("option");
    optionEl.value = "Rating-Descending";
    optionEl.textContent = "Betyg (högst först)";
    optionEl.className = "css-tuoqgp e1u8t75b1";
    const vintageAsc = selectElement.querySelector("option[value='Vintage-Ascending']");
    if (vintageAsc) {
      selectElement.insertBefore(optionEl, vintageAsc);
    } else {
      selectElement.appendChild(optionEl);
    }
    console.log("[appendReviewsOption] Added 'Rating-Descending' to dropdown!");
  }

  // Remove any existing handler before adding a new one
  selectElement.removeEventListener("change", handleDropdownChange);
  selectElement.addEventListener("change", handleDropdownChange);

  // Re-check rating (in case the rating option was already selected)
  checkIfRatingSelected(selectElement);
}

///////////////////////////////
// 5) SINGLE ENTRY POINT WHEN URL CHANGES
///////////////////////////////
function onUrlChanged() {
  console.log("[onUrlChanged] Detected new URL:", location.href);
  if (isSortimentPage()) {
    appendReviewsOption();
    waitForContainerAndInject();
  }
}

///////////////////////////////
// 6) WAITING FOR THE CONTAINER (for product injection)
///////////////////////////////
function waitForContainerAndInject() {
  let attempts = 0;
  const maxAttempts = 20;
  const interval = 200;

  const poll = setInterval(() => {
    attempts++;
    const container = document.querySelector("div.css-1fgrh1r.e12xogow0");

    if (container) {
      clearInterval(poll);
      if (localStorage.getItem("selectedSortOption") === "Rating-Descending") {
        console.log("[waitForContainerAndInject] Container found; re-injecting rating items...");
        onRecensionerSelected(getPageParam());
      }
    } else if (attempts >= maxAttempts) {
      clearInterval(poll);
      console.warn("[waitForContainerAndInject] Gave up waiting for container.");
    }
  }, interval);
}

///////////////////////////////
// 7) MUTATION OBSERVER ON FILTER CONTAINER
///////////////////////////////

// Debounce helper: delays execution until after a pause in rapid events
let debounceTimeout;
function debounce(fn, delay) {
  return function(...args) {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Observe changes in the filter options container (used by getCheckedOptions).
 * When changes occur, re-run the filtering logic.
 */
function observeFilterChanges() {
  const filterContainer = document.querySelector("div.css-ceop7e.e12xogow0");
  if (!filterContainer) {
    console.warn("[observeFilterChanges] Filter container not found. Retrying...");
    setTimeout(observeFilterChanges, 300);
    return;
  }
  
  const observer = new MutationObserver(debounce((mutations) => {
    console.log("[observeFilterChanges] Filter container changed. Re-applying filters...");
    // Re-read filters and update the displayed products.
    if (localStorage.getItem("selectedSortOption") === "Rating-Descending") {
      onRecensionerSelected(getPageParam());
    }
  }, 300));
  
  observer.observe(filterContainer, { childList: true, subtree: true, characterData: true });
}

///////////////////////////////
// 8) SPA NAVIGATION DETECTION (OVERRIDE pushState + popstate)
///////////////////////////////
function observePushState() {
  window.addEventListener("popstate", () => {
    if (location.href !== observePushState.lastHref) {
      observePushState.lastHref = location.href;
      onUrlChanged();
    }
  });

  const origPushState = history.pushState;
  history.pushState = function () {
    origPushState.apply(history, arguments);
    if (location.href !== observePushState.lastHref) {
      observePushState.lastHref = location.href;
      onUrlChanged();
    }
  };

  observePushState.lastHref = location.href;
}

///////////////////////////////
// 9) POLLING FALLBACK FOR URL CHANGES
///////////////////////////////
function startUrlPolling() {
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      console.log("[startUrlPolling] URL change detected by polling:", lastHref);
      onUrlChanged();
    }
  }, 200);
}

///////////////////////////////
// 10) MUTATION OBSERVER FOR INITIAL LOAD (to catch dropdown insertion)
///////////////////////////////
const observer = new MutationObserver((mutations, obs) => {
  for (const mutation of mutations) {
    if (mutation.type === "childList") {
      const dropdown = document.querySelector("select.css-18g6poy.e1u8t75b0");
      if (dropdown) {
        console.log("[MutationObserver] Found dropdown; calling appendReviewsOption + container poll.");
        appendReviewsOption();
        waitForContainerAndInject();
        obs.disconnect();
        break;
      }
    }
  }
});
const observerTarget = document.querySelector(".css-1dbvjje") || document.body;
observer.observe(observerTarget, { childList: true, subtree: true });



///////////////////////////////
// 11) RUN ALL DETECTION & OBSERVERS
///////////////////////////////
observePushState();     // Hook pushState/popstate
startUrlPolling();      // Aggressive fallback for URL changes
appendReviewsOption();  // Try once immediately
waitForContainerAndInject();
observeFilterChanges(); // Watch for changes in filter options