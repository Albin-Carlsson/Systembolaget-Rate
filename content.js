///////////////////////////////
// 0) DEBOUNCE UTILITY
///////////////////////////////
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

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
  }
  console.log("[maybeRedirectOnLoad] No overrideUrl found. Continue normal flow.");
})();

///////////////////////////////
// 2) HELPER FUNCTIONS
///////////////////////////////
function isSortimentPage() {
  return window.location.pathname.startsWith("/sortiment/");
}

function getPageParam() {
  const params = new URLSearchParams(window.location.search);
  const p = params.get("p");
  if (p && !isNaN(parseInt(p, 10))) return parseInt(p, 10);
  const segments = window.location.pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] || "";
  return /^\d+$/.test(last) ? parseInt(last, 10) : 1;
}

function buildSortUrl(newValue) {
  const [sortKey, sortDir] = newValue.split("-");
  let base = "/sortiment/ol/";
  if (window.location.pathname.includes("/vin/")) {
    base = "/sortiment/vin/";
  }
  let url = base;
  if (sortKey && sortDir)
    url += `?sortera-pa=${encodeURIComponent(sortKey)}&i-riktning=${encodeURIComponent(sortDir)}`;
  return url;
}

function normalizePath(path) {
  return path ? (path.length > 1 ? path.replace(/\/+$/, "") : path) : "";
}

function parsePrice(str) {
  if (!str) return NaN;
  str = str.replace(/\s/g, "");
  return parseFloat(str.replace(/kr$/i, "").replace(/,/g, "."));
}

function parseVolume(str) {
  if (!str) return NaN;
  return parseFloat(
    str.replace(/\s*ml\s*$/i, "").replace(/[^\d.,]/g, "").replace(/,/g, ".")
  );
}

///////////////////////////////
// 3) FILTER HELPERS
///////////////////////////////
function getCheckedOptions() {
  const container = document.querySelector("div.css-ceop7e.e12xogow0");
  if (!container) return [];
  const opts = [];
  container.querySelectorAll("div.eo01jo21 p").forEach(p => {
    let txt = p.textContent.trim().replace(/\s*\(\s*[\d\s]+\s*\)$/, "");
    if (/^\d+(?:[.,:]\d+)?\s*-\s*\d+(?:[.,:]\d+)?\s*kr$/i.test(txt)) {
      txt = txt.replace(/\s*-\s*/g, "-").replace(/\s*(kr)$/i, "kr");
    }
    opts.push(txt.toLowerCase());
  });
  return opts;
}

/**
 * Returns the store from the store div (e.g. "Fältöversten, Stockholm"),
 * with extra normalization (collapsing multiple spaces) and applying a translation.
 */
 
// --- NEW: Store Translation Map & Function ---
const STORE_TRANSLATIONS = {
  //"gränbystaden, uppsala": "gränbystaden"
  // Add more translations as needed.
};

function applyStoreTranslation(rawStore) {
  const key = rawStore.toLowerCase();
  return STORE_TRANSLATIONS[key] || rawStore;
}

function getStoreOption() {
  const storeDiv = document.querySelector("div.css-1rhbkcf.e12xogow0");
  if (storeDiv) {
    const storeP = storeDiv.querySelector("p.css-173act9.eizoeol0");
    if (storeP) {
      let txt = storeP.textContent.trim().replace(/\s+/g, " ");
      // Remove any comma and following text (e.g., the city)
      txt = txt.replace(/,.*$/, "").trim();
      // Apply translation if one exists
      txt = applyStoreTranslation(txt);
      console.log("[getStoreOption] Found store:", txt);
      return txt;
    }
  }
  console.log("[getStoreOption] No store option found.");
  return "";
}

function matchesTextFilter(product, filterText) {
  filterText = filterText.toLowerCase();
  
  // Check if any category includes the filter text.
  if (product.category && Array.isArray(product.category)) {
    if (product.category.some(item => item.trim().toLowerCase().includes(filterText)))
      return true;
  }
  
  // Check other common fields (brand, name, country, beer_name, wine_name)
  return ["brand", "name", "country", "beer_name", "wine_name"].some(
    field =>
      product[field] &&
      product[field].toString().toLowerCase().trim().includes(filterText)
  );
}

// --- EXISTING: Filter Translation Map & Function ---
const FILTER_TRANSLATIONS = {
  "zwickel, keller- och landbier": "zwickel"
  // Add more translations here if needed.
};

function applyFilterTranslation(rawFilterText) {
  const key = rawFilterText.toLowerCase();
  return FILTER_TRANSLATIONS[key] || rawFilterText;
}

/**
 * Filters products by checked options, query words, and store.
 */
function filterItems(items) {
  const options = getCheckedOptions();
  const store = getStoreOption();
  const normStore = store.toLowerCase().trim().replace(/\s+/g, " ");
  const params = new URLSearchParams(window.location.search);
  const q = params.get("q");
  const queryWords = q ? q.trim().split(/\s+/).map(w => w.toLowerCase()) : [];
  console.log("[filterItems] Options:", options, "Query:", queryWords, "Store:", normStore);

  return items.filter(product => {
    const uiPass = options.length
      ? options.every(opt => {
          const translatedOpt = applyFilterTranslation(opt);
          if (translatedOpt.includes("-")) {
            if (translatedOpt.toLowerCase().includes("ml")) {
              const [minRaw, maxRaw] = translatedOpt.split("-");
              const minVol = parseVolume(minRaw),
                maxVol = parseVolume(maxRaw);
              return !isNaN(minVol) && !isNaN(maxVol)
                ? product.volume >= minVol && product.volume <= maxVol
                : matchesTextFilter(product, translatedOpt);
            } else {
              const [minRaw, maxRaw] = translatedOpt.split("-");
              const minPrice = parsePrice(minRaw),
                maxPrice = parsePrice(maxRaw);
              return !isNaN(minPrice) && !isNaN(maxPrice)
                ? parsePrice(product.price) >= minPrice &&
                    parsePrice(product.price) <= maxPrice
                : matchesTextFilter(product, translatedOpt);
            }
          }
          return matchesTextFilter(product, translatedOpt);
        })
      : true;
    const queryPass = queryWords.length
      ? queryWords.every(word => {
          const fields = [];
          if (product.name) fields.push(product.name);
          if (product.brand) fields.push(product.brand);
          if (product.category)
            fields.push(...(Array.isArray(product.category) ? product.category : [product.category]));
          return fields.some(field => field.toLowerCase().includes(word));
        })
      : true;
    let storePass = true;
    if (normStore) {
      storePass =
        product.locations && Array.isArray(product.locations)
          ? product.locations.some(
              loc => loc.toLowerCase().trim().replace(/\s+/g, " ") === normStore
            )
          : false;
    }
    return uiPass && queryPass && storePass;
  });
}

/**
 * --- NEW: Check Unsupported Filter Options ---
 * Checks the currently checked options for unsupported words.
 * If found and if Rating sort is selected, displays a centered textbox.
 * The box is removed once those options are no longer active.
 */
function checkUnsupportedFilterOptions() {
  // Only run this check if "Rating-Descending" is active
  if (localStorage.getItem("selectedSortOption") !== "Rating-Descending") {
    const existingBox = document.getElementById("unsupported-filter-box");
    if (existingBox) {
      existingBox.remove();
    }
    return;
  }
  
  // Define unsupported words (all lower-case)
  const unsupportedWords = ["nyhet", "ekologiskt"];
  const options = getCheckedOptions();
  let unsupportedFiltersFound = [];

  options.forEach(opt => {
    unsupportedWords.forEach(word => {
      if (opt.toLowerCase().includes(word)) {
        if (!unsupportedFiltersFound.includes(word)) {
          unsupportedFiltersFound.push(word);
        }
      }
    });
  });

  let box = document.getElementById("unsupported-filter-box");
  if (unsupportedFiltersFound.length > 0) {
    if (!box) {
      box = document.createElement("div");
      box.id = "unsupported-filter-box";
      // Place the box in the middle of the screen
      box.style.position = "fixed";
      box.style.top = "50%";
      box.style.left = "50%";
      box.style.transform = "translate(-50%, -50%)";
      box.style.backgroundColor = "#ffcccc";
      box.style.color = "#000";
      box.style.padding = "20px";
      box.style.border = "2px solid #ff0000";
      box.style.zIndex = "9999";
      document.body.appendChild(box);
    }
    box.textContent = "Filter(s) not supported: " + unsupportedFiltersFound.join(", ");
  } else {
    if (box) {
      box.remove();
    }
  }
}

///////////////////////////////
// 4) SORTING & RATING FUNCTIONS
///////////////////////////////
function onRecensionerSelected(page) {
  console.log("[onRecensionerSelected] Injecting items for page:", page);
  const container = document.querySelector("div.css-1fgrh1r.e12xogow0");
  if (!container) return console.warn("[onRecensionerSelected] Container not found.");
  container.innerHTML = "";

  chrome.runtime.sendMessage({ action: "fetchItems" }, response => {
    if (!response) return console.error("[onRecensionerSelected] No response received from fetchItems.");
    if (response.error) return console.error("[onRecensionerSelected] Error:", response.error);

    // Merge ALL products (beers + wines)
    let data = [];
    if (Array.isArray(response.data)) {
      data = response.data;
    } else {
      data = [
        ...(response.data.beers || []),
        ...(response.data.wines || [])
      ];
    }
    console.log("[onRecensionerSelected] Loaded", data.length, "items.");

    const filtered = filterItems(data);
    console.log("[onRecensionerSelected] After filtering:", filtered.length, "items.");

    const startIndex = (page - 1) * 30;
    filtered.slice(startIndex, startIndex + 30).forEach(prod => {
      container.innerHTML +=
        prod.data ||
        `
        <div class="item">
          <h3>${prod.name}</h3>
          <p><strong>Brand:</strong> ${prod.brand}</p>
          <p><strong>Category:</strong> ${
            Array.isArray(prod.category) ? prod.category.join(", ") : prod.category
          }</p>
          <p><strong>Price:</strong> ${prod.price}</p>
        </div>`;
    });
  });
}

function onRecensionerDeselected() {
  console.log("[onRecensionerDeselected] Called.");
}

function checkIfRatingSelected(sel) {
  const last = localStorage.getItem("selectedSortOption");
  const params = new URLSearchParams(window.location.search);
  if (
    last === "Rating-Descending" &&
    params.get("sortera-pa") === "Rating" &&
    params.get("i-riktning") === "Descending"
  ) {
    sel.value = "Rating-Descending";
    const label = sel.parentNode.querySelector("span.css-1iiwfip.eizoeol0");
    if (label) label.textContent = "Betyg (högst först)";
    onRecensionerSelected(getPageParam());
  } else {
    localStorage.removeItem("selectedSortOption");
  }
}

function handleDropdownChange(e) {
  const newVal = e.target.value;
  const oldVal = localStorage.getItem("selectedSortOption");
  const label = e.target.parentNode.querySelector("span.css-1iiwfip.eizoeol0");
  if (newVal === "Rating-Descending") {
    if (label) label.textContent = "Betyg (högst först)";
    localStorage.setItem("selectedSortOption", "Rating-Descending");
    setTimeout(() => onRecensionerSelected(getPageParam()), 300);
  } else if (oldVal === "Rating-Descending") {
    onRecensionerDeselected();
    localStorage.removeItem("selectedSortOption");
    if (label) label.textContent = e.target.options[e.target.selectedIndex].textContent;
    localStorage.setItem("overrideUrl", buildSortUrl(newVal));
    window.location.reload();
  }
}

function appendReviewsOption() {
  if (!isSortimentPage()) return;
  const selects = document.querySelectorAll("select.css-18g6poy.e1u8t75b0");
  if (!selects.length) return setTimeout(appendReviewsOption, 300);
  const sel = Array.from(selects).find(el => el.offsetParent !== null);
  if (!sel) return setTimeout(appendReviewsOption, 300);
  if (!sel.querySelector("option[value='Rating-Descending']")) {
    const opt = document.createElement("option");
    opt.value = "Rating-Descending";
    opt.textContent = "Betyg (högst först)";
    opt.className = "css-tuoqgp e1u8t75b1";
    const vintage = sel.querySelector("option[value='Vintage-Ascending']");
    if (vintage) sel.insertBefore(opt, vintage);
    else sel.appendChild(opt);
  }
  sel.removeEventListener("change", handleDropdownChange);
  sel.addEventListener("change", handleDropdownChange);
  checkIfRatingSelected(sel);
}

function replaceDivsWithJsonData() {
  if (localStorage.getItem("selectedSortOption") === "Rating-Descending") return;
  const container = document.querySelector("div.css-1fgrh1r.e12xogow0");
  if (!container) return;
  chrome.runtime.sendMessage({ action: "fetchItems" }, response => {
    if (!response) return console.error("replaceDivsWithJsonData: No response received.");
    if (response.error) return console.error(response.error);
    let data = [];
    if (Array.isArray(response.data)) {
      data = response.data;
    } else {
      data = [
        ...(response.data.beers || []),
        ...(response.data.wines || [])
      ];
    }
    container.querySelectorAll("a[id^='tile:']").forEach(elem => {
      const tile = (elem.getAttribute("id") || "").trim();
      const href = (elem.getAttribute("href") || "").trim();
      const match = data.find(
        prod =>
          (prod.tile_id || "").trim() === tile ||
          (prod.href || "").trim() === href
      );
      if (match && match.data) elem.outerHTML = match.data;
    });
  });
}

///////////////////////////////
// 5) PRODUCT PAGE RATING
///////////////////////////////
function addRatingToProductPage() {
  console.log("[addRatingToProductPage] Running on product page.");
  const currentPath = normalizePath(window.location.pathname);
  chrome.runtime.sendMessage({ action: "fetchItems" }, response => {
    if (!response) return console.error("addRatingToProductPage: No response received.");
    if (response.error) return insertFallbackRating();
    let data = [];
    if (Array.isArray(response.data)) {
      data = response.data;
    } else {
      data = [
        ...(response.data.beers || []),
        ...(response.data.wines || [])
      ];
    }
    const match = data.find(prod => normalizePath(prod.href || "") === currentPath);
    console.log("[addRatingToProductPage] Matching item:", match);
    const ratingText = match && match.rating ? `${match.rating} / 5 ⭐` : `- / 5`;
    const priceContainer = document.querySelector("div.css-1ct01d4.e12xogow0");
    if (!priceContainer) return;
    const box = document.createElement("div");
    box.setAttribute("aria-hidden", "true");
    box.className = "css-ylm6mu eizoeol0";
    box.style.backgroundColor = "#f0f0f0";
    box.style.padding = "5px 10px";
    box.style.borderRadius = "3px";
    box.style.display = "inline-block";
    box.style.marginLeft = "10px";
    box.textContent = ratingText;
    if (match && match.rating_link && match.rating_link.trim() !== "") {
      box.style.cursor = "pointer";
      box.addEventListener("click", () => (window.location.href = match.rating_link));
    }
    box.addEventListener("mouseenter", () => {
      box.style.textDecoration = "underline";
    });
    box.addEventListener("mouseleave", () => {
      box.style.textDecoration = "none";
    });
    const priceEl = priceContainer.querySelector("p.css-ylm6mu.eizoeol0");
    if (priceEl) priceEl.insertAdjacentElement("afterend", box);
    else priceContainer.appendChild(box);
    console.log("[addRatingToProductPage] Inserted rating box:", ratingText);
  });
}

function insertFallbackRating() {
  const container = document.querySelector("div.css-1ct01d4.e12xogow0");
  if (!container) return;
  const fb = document.createElement("p");
  fb.setAttribute("aria-hidden", "true");
  fb.className = "css-ylm6mu eizoeol0";
  fb.textContent = "- / 5";
  const priceEl = container.querySelector("p.css-ylm6mu.eizoeol0");
  if (priceEl) priceEl.insertAdjacentElement("afterend", fb);
  else container.appendChild(fb);
  console.log("[insertFallbackRating] Inserted fallback rating.");
}

///////////////////////////////
// 6) POLL FOR STORE CHANGES
///////////////////////////////
function pollStoreChange() {
  let lastStore = getStoreOption();
  setInterval(() => {
    const newStore = getStoreOption();
    if (newStore !== lastStore) {
      console.log("[pollStoreChange] Store changed from", lastStore, "to", newStore);
      lastStore = newStore;
      if (localStorage.getItem("selectedSortOption") === "Rating-Descending") {
        onRecensionerSelected(getPageParam());
      } else {
        replaceDivsWithJsonData();
      }
    }
  }, 500);
}

///////////////////////////////
// 7) URL & DOM OBSERVERS
///////////////////////////////
function onUrlChanged() {
  console.log("[onUrlChanged] URL:", location.href);
  if (isSortimentPage()) {
    appendReviewsOption();
    waitForContainerAndInject();
  } else if (/\/(product|produkt)\//.test(window.location.pathname)) {
    addRatingToProductPage();
  }
}

function waitForContainerAndInject() {
  let attempts = 0;
  const poll = setInterval(() => {
    attempts++;
    const container = document.querySelector("div.css-1fgrh1r.e12xogow0");
    if (container || attempts >= 20) {
      clearInterval(poll);
      if (container) {
        localStorage.getItem("selectedSortOption") === "Rating-Descending"
          ? onRecensionerSelected(getPageParam())
          : replaceDivsWithJsonData();
      }
    }
  }, 200);
}

function observeFilterChanges() {
  const filterContainer = document.querySelector("div.css-ceop7e.e12xogow0");
  if (!filterContainer) return setTimeout(observeFilterChanges, 300);
  new MutationObserver(
    debounce(() => {
      // Check unsupported filter options only if Rating sort is selected.
      checkUnsupportedFilterOptions();
      if (localStorage.getItem("selectedSortOption") === "Rating-Descending") {
        onRecensionerSelected(getPageParam());
      }
    }, 300)
  ).observe(filterContainer, { childList: true, subtree: true, characterData: true });
}

function observePushState() {
  window.addEventListener("popstate", () => {
    if (location.href !== observePushState.lastHref) {
      observePushState.lastHref = location.href;
      onUrlChanged();
    }
  });
  const origPush = history.pushState;
  history.pushState = function () {
    origPush.apply(history, arguments);
    if (location.href !== observePushState.lastHref) {
      observePushState.lastHref = location.href;
      onUrlChanged();
    }
  };
  observePushState.lastHref = location.href;
}

function startUrlPolling() {
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      onUrlChanged();
    }
  }, 200);
}

// An initial observer to catch the select element if the page is dynamically built
const initialObserver = new MutationObserver((mutations, obs) => {
  if (document.querySelector("select.css-18g6poy.e1u8t75b0")) {
    appendReviewsOption();
    waitForContainerAndInject();
    obs.disconnect();
  }
});
initialObserver.observe(document.body, { childList: true, subtree: true });

///////////////////////////////
// 8) RUN ALL OBSERVERS & POLLING
///////////////////////////////
observePushState();
startUrlPolling();
observeFilterChanges();
appendReviewsOption();
waitForContainerAndInject();
onUrlChanged();
pollStoreChange();

///////////////////////////////
// 9) BACKGROUND FETCH & CACHING
///////////////////////////////
function fetchItems(sendResponse) {
  fetch("http://localhost:3000/api/items")
    .then(resp => {
      if (!resp.ok) throw new Error(`HTTP error! Status: ${resp.status}`);
      return resp.json();
    })
    .then(data => {
      try {
        localStorage.setItem("itemsData", JSON.stringify(data));
        localStorage.setItem("itemsDataTimestamp", Date.now().toString());
      } catch (e) {
        console.error(e);
      }
      sendResponse({ data, cacheHit: false });
    })
    .catch(err => sendResponse({ error: err.toString() }));
}

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === "fetchItems") {
    const ttl = 10 * 60 * 1000; // 10 min
    const now = Date.now();
    const cached = localStorage.getItem("itemsData");
    const ts = localStorage.getItem("itemsDataTimestamp");
    if (cached && ts && now - parseInt(ts, 10) < ttl) {
      try {
        sendResponse({ data: JSON.parse(cached), cacheHit: true });
      } catch (e) {
        fetchItems(sendResponse);
      }
    } else {
      fetchItems(sendResponse);
    }
    return true; // Keep the message channel open for async response
  }
});

///////////////////////////////
// 10) ERROR TEXT DETECTION & AUTO-REFRESH
///////////////////////////////
// Using setInterval (every 2 seconds) to look for the error text.
setInterval(() => {
  const h2 = document.querySelector("h2");
  if (
    h2 &&
    h2.textContent.trim() ===
      "Application error: a client-side exception has occurred (see the browser console for more information)."
  ) {
    // Refresh the page (similar to Ctrl+R)
    location.reload();
  }
}, 100);


