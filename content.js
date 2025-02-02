///////////////////////////////
// 1) IMMEDIATE REDIRECT IF overrideUrl IS PENDING
///////////////////////////////
(function maybeRedirectOnLoad() {
    const pendingUrl = localStorage.getItem("overrideUrl");
    if (pendingUrl) {
      console.log("[maybeRedirectOnLoad] Found overrideUrl =", pendingUrl);
      // Remove it so we don't keep redirecting every time
      localStorage.removeItem("overrideUrl");
      
      // Now redirect to that URL. This ensures we land on the correct param.
      window.location.href = pendingUrl;
      // Stop loading this script's logic because we're navigating away
      return;
    } else {
      console.log("[maybeRedirectOnLoad] No overrideUrl found. Continue normal flow.");
    }
  })();
  
  // Check if we're on /sortiment/...
  function isSortimentPage() {
    return window.location.pathname.startsWith("/sortiment/");
  }
  
  // Observe for SPA navigation
  function observePageChanges() {
    let lastPath = window.location.pathname;
  
    // Listen for browser back/forward
    window.addEventListener("popstate", handlePageChange);
  
    // Override pushState
    const origPushState = history.pushState;
    history.pushState = function() {
      origPushState.apply(history, arguments);
      handlePageChange();
    };
  
    function handlePageChange() {
      const newPath = window.location.pathname;
      if (newPath !== lastPath) {
        console.log("[observePageChanges] Path changed to:", newPath);
        lastPath = newPath;
        if (isSortimentPage()) {
          appendReviewsOption();
        }
      }
    }
  }
  
  // Will be called if we are on /sortiment/ol, etc.
  function appendReviewsOption() {
    if (!isSortimentPage()) {
      console.warn("[appendReviewsOption] Not on /sortiment/. Skip.");
      return;
    }
  
    console.log("[appendReviewsOption] Checking for the correct dropdown...");
  
    // The usual Systembolaget dropdown selector
    const selectElements = document.querySelectorAll("select.css-18g6poy.e1u8t75b0");
    if (!selectElements.length) {
      console.warn("[appendReviewsOption] No dropdowns found yet.");
      return;
    }
  
    const selectElement = Array.from(selectElements).find(el => el.offsetParent !== null);
    if (!selectElement) {
      console.warn("[appendReviewsOption] Dropdown is present but not visible.");
      return;
    }
  
    // Insert "Rating-Descending" if not present
    if (!selectElement.querySelector("option[value='Rating-Descending']")) {
      const optionEl = document.createElement("option");
      optionEl.value = "Rating-Descending";
      optionEl.className = "css-tuoqgp e1u8t75b1";
      optionEl.textContent = "Betyg (högst först)";
  
      // Put it before "Vintage-Ascending" or append to the end
      const vintageAsc = selectElement.querySelector("option[value='Vintage-Ascending']");
      if (vintageAsc) {
        selectElement.insertBefore(optionEl, vintageAsc);
      } else {
        selectElement.appendChild(optionEl);
      }
      console.log("[appendReviewsOption] Added 'Rating-Descending' to dropdown!");
    }
  
    // Ensure no duplicate listener
    selectElement.removeEventListener("change", handleDropdownChange);
    selectElement.addEventListener("change", handleDropdownChange);
  
    // Possibly re-apply rating if the URL still says rating
    checkIfRatingSelected(selectElement);
  }
  
  // Called on <select> change
  function handleDropdownChange(event) {
    const newValue = event.target.value;               // e.g. "Price-Ascending"
    const oldValue = localStorage.getItem("selectedSortOption"); // e.g. "Rating-Descending" or null
  
    console.log("[handleDropdownChange] newValue=", newValue, "oldValue=", oldValue);
  
    if (newValue === "Rating-Descending") {
      console.log("[handleDropdownChange] → Selected rating. Save to localStorage + insert test items.");
      localStorage.setItem("selectedSortOption", "Rating-Descending");
      onRecensionerSelected();
    } else {
      // We are picking something that is NOT rating
      if (oldValue === "Rating-Descending") {
        // We were on rating, now leaving rating => revert + remove localStorage
        console.log("[handleDropdownChange] → Deselecting rating. Removing localStorage...");
        onRecensionerDeselected();
        localStorage.removeItem("selectedSortOption");
  
        // Build the new URL we actually want:
        const overrideUrl = buildSortUrl(newValue);
        console.log("[handleDropdownChange] Computed overrideUrl =", overrideUrl);
  
        // Store overrideUrl so that next load can redirect properly
        localStorage.setItem("overrideUrl", overrideUrl);
  
        // Finally, reload (clearing DOM changes).
        console.log("[handleDropdownChange] Reloading page now...");
        window.location.reload();
      } else {
        // oldValue was not rating => switching among non-rating => do nothing
        console.log("[handleDropdownChange] Non-rating to non-rating. Do nothing.");
      }
    }
  }
  
  // This function helps us map e.g. "Price-Ascending" -> "?sortera-pa=Price&i-riktning=Ascending"
  function buildSortUrl(newValue) {
    // We'll parse the string e.g. "Price-Ascending" => sort="Price", direction="Ascending"
    // Then build a URL like: /sortiment/ol/?sortera-pa=Price&i-riktning=Ascending
    // Adjust as needed for your actual sorts
    console.log("[buildSortUrl] newValue =", newValue);
  
    // If there's a dash, split it
    const [sortKey, sortDir] = newValue.split("-"); 
    // Example: newValue="Price-Ascending" => sortKey="Price", sortDir="Ascending"
  
    let finalUrl = "/sortiment/ol/";  // base path
  
    // If we recognized a key/direction, build the query
    if (sortKey && sortDir) {
      finalUrl += `?sortera-pa=${encodeURIComponent(sortKey)}&i-riktning=${encodeURIComponent(sortDir)}`;
    } 
    // If there's no dash or it's unknown, you can fallback or do something else
    // finalUrl might just remain "/sortiment/ol/" in that case
    // or you might add logic for known sorts like "ProductLaunchDate-Ascending" etc.
  
    return finalUrl;
  }
  
  // The function that replaces items in the DOM with test items
  function onRecensionerSelected() {
    console.log("[onRecensionerSelected] Replacing product tiles with rating-based test items...");

    const container = document.querySelector("div.css-1fgrh1r.e12xogow0");
    if (!container) {
      console.warn("[onRecensionerSelected] Container not found. Aborting injection.");
      return;
    }
  
    const testItemHTML = `
    <a id="tile:24524221" href="/produkt/ol/nils-oscar-god-lager-3528801/" class="e1em7da90 css-ijjvfs e12xogow0">
        <div class="css-2114pf e12xogow0">
            <div class="css-1n1rld4 e12xogow0">
                <div class="css-k008qs e12xogow0">
                    <div height="104" width="53" class="eo1v0sn1 css-1k87ene e12xogow0">
                        <img alt="Produktbild för Nils Oscar God Lager" loading="lazy" width="53" height="104" decoding="async"
                            class="css-0 eo1v0sn0" style="color: transparent; object-fit: contain;"
                            src="https://product-cdn.systembolaget.se/productimages/24524221/24524221_100.webp?q=75&amp;w=2000">
                    </div>
                    <div class="css-1x8f7yz e12xogow0">
                        <div class="css-j7qwjs e12xogow0">
                            <p class="css-4oiqd8 eizoeol0">Öl, Ljus lager, Dortmunder och helles</p>
                            <div class="css-rqa69l e1iq8b8k1">
                                <p color="black" class="css-1njx6qf e1iq8b8k0">Nils Oscar God Lager</p>
                                <p color="black65" class="css-su700l e1iq8b8k0">Nr 35288</p>
                            </div>
                        </div>
                        <div class="css-gg4vpm e12xogow0">
                            <div id="stock_scrollcontainer" class="css-1dtnjt5 e12xogow0">
                                <div class="css-k008qs e12xogow0">
                                    <div display="flex" class="css-1kb67a e12xogow0">
                                        <svg name="Sverige" class="css-1fbfr4p e1tsvu050">
                                            <use href="/flags.sprite.svg#Sverige"></use>
                                        </svg>
                                    </div>
                                    <p overflow="hidden" class="e1fb4th00 css-zwokwd eizoeol0">Sverige</p>
                                </div>
                                <p overflow="hidden" class="e1fb4th00 css-zwokwd eizoeol0">500 ml</p>
                                <p overflow="hidden" class="e1fb4th00 css-zwokwd eizoeol0">5,3 % vol.</p>
                            </div>
                            <div class="css-k008qs e12xogow0">
                                <span class="css-12jzfu e1eak8c10"></span>
                                <p class="css-a2frwy eizoeol0">29:90</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </a>`;

  
    container.innerHTML = "";
    for (let i = 0; i < 30; i++) {
      container.innerHTML += testItemHTML;
    }
  
    console.log("[onRecensionerSelected] Injected 30 test items.");
  }
  
  // Called when leaving rating
  function onRecensionerDeselected() {
    //alert("Sorting by rating disabled. Reverting to another sorting method."); 
    console.log("[onRecensionerDeselected] Called. (Any additional cleanup logic can go here.)");
  }
  
  // Re-applies rating if localStorage + URL say rating
  function checkIfRatingSelected(selectElement) {
    const lastSelected = localStorage.getItem("selectedSortOption");
    const urlParams = new URLSearchParams(window.location.search);
    const sortParam = urlParams.get("sortera-pa");   // e.g. "Rating"
    const dirParam  = urlParams.get("i-riktning");   // e.g. "Descending"
  
    console.log("[checkIfRatingSelected] localStorage=", lastSelected, " sortParam=", sortParam, " dirParam=", dirParam);
  
    // Only re-apply rating if we see "Rating" in both localStorage and the URL
    if (lastSelected === "Rating-Descending" && sortParam === "Rating" && dirParam === "Descending") {
      console.log("[checkIfRatingSelected] -> Re-applying rating...");
      selectElement.value = "Rating-Descending";
      onRecensionerSelected();
    } else {
      console.log("[checkIfRatingSelected] -> Not applying rating. Remove leftover localStorage if any.");
      localStorage.removeItem("selectedSortOption");
    }
  }
  
  // Watch for the dropdown to appear dynamically
  const observer = new MutationObserver((mutations, obs) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        if (document.querySelector("select.css-18g6poy.e1u8t75b0")) {
          console.log("[MutationObserver] Found the dropdown, calling appendReviewsOption.");
          appendReviewsOption();
          obs.disconnect();
          break;
        }
      }
    }
  });
  
  // Start observing
  const observerTarget = document.querySelector(".css-1dbvjje") || document.body;
  observer.observe(observerTarget, { childList: true, subtree: true });
  
  // Also watch for SPA nav
  observePageChanges();
  
  // Finally, run once immediately in case the dropdown is already there
  appendReviewsOption();