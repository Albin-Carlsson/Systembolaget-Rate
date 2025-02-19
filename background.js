// Helper function to perform the network fetch and cache the result.
function fetchItems(sendResponse) {
  fetch("http://localhost:3000/api/beers")
    .then(response => {
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      return response.json();
    })
    .then(data => {
      try {
        localStorage.setItem("beersData", JSON.stringify(data));
        localStorage.setItem("beersDataTimestamp", Date.now().toString());
      } catch (e) {
        console.error("Error saving to localStorage:", e);
      }
      // Indicate that this is a fresh network fetch.
      sendResponse({ data, cacheHit: false });
    })
    .catch(error => {
      sendResponse({ error: error.toString() });
    });
}

// Listen for messages from content scripts.
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  // Accept both "fetchItems" and "fetchBeers" actions.
  if (req.action === "fetchItems" || req.action === "fetchBeers") {
    // Define a TTL (time-to-live) of 10 minutes.
    const ttl = 10 * 60 * 1000; // 10 minutes in milliseconds
    const now = Date.now();

    // Retrieve cached data and its timestamp.
    const cached = localStorage.getItem("beersData");
    const ts = localStorage.getItem("beersDataTimestamp");

    // Check if cached data exists and is still fresh.
    if (cached && ts && (now - parseInt(ts, 10) < ttl)) {
      console.log("Returning cached beers data from localStorage.");
      try {
        const data = JSON.parse(cached);
        sendResponse({ data, cacheHit: true });
      } catch (e) {
        console.error("Error parsing cached data:", e);
        fetchItems(sendResponse);
      }
    } else {
      console.log("No valid cache found. Fetching new beers data from the network.");
      fetchItems(sendResponse);
    }
    // Return true to indicate asynchronous response.
    return true;
  }
});