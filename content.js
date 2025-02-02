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

///////////////////////////////
// 3) RATING SELECTION LOGIC
///////////////////////////////

function onRecensionerSelected(page) {
  console.log("[onRecensionerSelected] Injecting rating-based items for page:", page);

  const container = document.querySelector("div.css-1fgrh1r.e12xogow0");
  if (!container) {
    console.warn("[onRecensionerSelected] Container not found; aborting.");
    return;
  }
  
  container.innerHTML = "";

  // Load from your extension
  const beersJsonUrl = chrome.runtime.getURL("beers.json");
  fetch(beersJsonUrl)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(jsonData => {
      const beers = jsonData.beers || [];
      // 30 items per page
      const startIndex = (page - 1) * 30;
      const sliced = beers.slice(startIndex, startIndex + 30);

      sliced.forEach(beer => {
        container.innerHTML += beer.data;
      });
      console.log(`[onRecensionerSelected] Injected ${sliced.length} items on page ${page}.`);
    })
    .catch(error => {
      console.error("[onRecensionerSelected] Error fetching beers.json:", error);
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
    onRecensionerSelected(getPageParam());
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
    console.warn("[appendReviewsOption] No dropdowns found yet.");
    return;
  }
  
  const selectElement = Array.from(selectElements).find(el => el.offsetParent !== null);
  if (!selectElement) {
    console.warn("[appendReviewsOption] Dropdown is not visible yet.");
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

  selectElement.removeEventListener("change", handleDropdownChange);
  selectElement.addEventListener("change", handleDropdownChange);

  // Re-check rating
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
// 6) WAITING FOR THE CONTAINER
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
// 7) SPA NAV DETECTION (OVERRIDE pushState + popstate)
///////////////////////////////
function observePushState() {
  window.addEventListener("popstate", () => {
    // This event triggers on back/forward browser navigation
    // We'll simply call onUrlChanged() if the URL changed
    if (location.href !== observePushState.lastHref) {
      observePushState.lastHref = location.href;
      onUrlChanged();
    }
  });

  const origPushState = history.pushState;
  history.pushState = function () {
    origPushState.apply(history, arguments);
    // The site *should* call pushState with a new URL
    if (location.href !== observePushState.lastHref) {
      observePushState.lastHref = location.href;
      onUrlChanged();
    }
  };

  // Set initial
  observePushState.lastHref = location.href;
}

///////////////////////////////
// 8) POLLING FALLBACK (BE AGGRESSIVE)
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
// 9) MUTATION OBSERVER FOR INITIAL LOAD
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
// 10) RUN ALL DETECTION
///////////////////////////////
observePushState();     // Hook pushState/popstate
startUrlPolling();      // Aggressive fallback
appendReviewsOption();  // Try once immediately
waitForContainerAndInject();