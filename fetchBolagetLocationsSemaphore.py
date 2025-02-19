#!/usr/bin/env python3
import asyncio
import json
import os
import re
from playwright.async_api import async_playwright

# -----------------------
# Your original scraping
# function (unchanged).
# -----------------------
async def scrape_product(product_url, page) -> list[str]:
    locations = []

    print(f"\nNavigating to {product_url}")
    # 1. Navigate with "load" instead of "networkidle"
    await page.goto(product_url, wait_until="load", timeout=30000)
    
    # 2. Try age confirmation
    try:
        await page.click("xpath=//a[contains(text(), 'Jag har fyllt 20 år')]", timeout=3000)
        print("Clicked age confirmation.")
    except:
        print("Age confirmation not found or already accepted.")

    # 3. Try save settings
    try:
        await page.click("css=button.css-xute7l.enbz1310", timeout=3000)
        print("Clicked save settings button.")
    except:
        print("Save settings button not found or already clicked.")

    # 4. Click the "Välj butik" button by class or text
    try:
        await page.click("button.css-1vu4ctf.enbz1310", timeout=5000)
        print("Clicked 'Välj butik' button by class.")
    except:
        try:
            await page.click("button:has-text('Välj butik')", timeout=5000)
            print("Clicked 'Välj butik' button by text.")
        except Exception as e:
            print("Failed to click 'Välj butik':", e)
            return locations  # Return empty if we can't proceed

    # 5. Toggle in-stock checkbox
    try:
        checkbox = page.locator("input#in_stock")
        await checkbox.wait_for(timeout=5000)
        print("Clicking the in_stock checkbox...")

        await checkbox.check()
        print("Pressed in_stock toggle (no wait for new data).")
    except Exception as e:
        print("Error pressing in_stock toggle:", e)
        return locations

    # 6. Wait and scroll
    await page.wait_for_timeout(2000)
    try:
        store_container = await page.wait_for_selector("#productStoreStockScrollContainerId", timeout=5000)
        print("Found store container. Starting to scroll...")
        prev_scroll = await page.evaluate("(el) => el.scrollTop", store_container)
        while True:
            await page.evaluate("(el) => el.scrollTop = el.scrollHeight", store_container)
            await page.wait_for_timeout(1000)
            current_scroll = await page.evaluate("(el) => el.scrollTop", store_container)
            if current_scroll == prev_scroll:
                print("Reached bottom of the store container.")
                break
            prev_scroll = current_scroll
    except Exception as e:
        print("Error scrolling store container:", e)
        return locations

    # 7. Extract store availability
    try:
        store_divs = await store_container.query_selector_all("div.css-z7mtfw.e12xogow0")
        print(f"Found {len(store_divs)} store element(s).")
        for div in store_divs:
            store_name_elem = await div.query_selector("p.css-173act9.eizoeol0")
            if not store_name_elem:
                continue
            store_name = (await store_name_elem.inner_text()).strip()

            availability_elem = await div.query_selector("p.css-hajcer.eizoeol0")
            if not availability_elem:
                continue
            availability_text = (await availability_elem.inner_text()).strip()

            match = re.search(r'(\d+)', availability_text)
            if match and int(match.group(1)) > 0:
                locations.append(store_name)
            else:
                print(f"Skipping '{store_name}' as availability is '{availability_text}'")
    except Exception as e:
        print("Error extracting store locations:", e)

    print("\nLocations with availability:", locations)
    return locations


# -----------------------
# Helper coroutine to run
# each scrape with a limit.
# -----------------------
async def handle_scraping(item, context, base_url, sem):
    """
    Acquires the semaphore, opens a page, calls scrape_product,
    and closes the page when done.
    """
    # Construct rating_link using the Untappd base URL.
    # Use "rating_href" if available (which would be a relative link like "/b/…"),
    # otherwise fallback to the existing "href".
    untappd_base = "https://untappd.com"
    rating_href = item.get("rating_href", item.get("href", ""))
    if rating_href:
        item["rating_link"] = untappd_base + rating_href
    else:
        item["rating_link"] = ""

    href = item.get("href")
    if not href:
        print("Skipping item with no 'href':", item)
        item["locations"] = []
        return  # No scraping

    product_url = base_url + href

    # Acquire one slot in the concurrency pool
    async with sem:
        page = await context.new_page()
        try:
            # Do the actual scraping
            locations = await scrape_product(product_url, page)
            # Save the results directly into the item
            item["locations"] = locations
        finally:
            await page.close()  # Ensure the page is closed regardless of success/failure


async def main():
    input_filename = "items.json"
    if not os.path.exists(input_filename):
        print(f"{input_filename} not found.")
        return

    # Load JSON data
    try:
        with open(input_filename, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print("Error loading JSON data:", e)
        return

    # We'll only process "beers" (adjust if needed)
    if "beers" not in data:
        print("No 'beers' category found in JSON.")
        return

    items = data["beers"]

    # Decide how many tasks you want to run in parallel
    concurrency_limit = 10  # <--- Adjust here as needed
    sem = asyncio.Semaphore(concurrency_limit)

    # Base URL for Systembolaget
    base_url = "https://www.systembolaget.se"

    # Start Playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--start-maximized"]
        )
        context = await browser.new_context(viewport={"width": 1000, "height": 500})
        context.set_default_navigation_timeout(30000)
        context.set_default_timeout(30000)

        # Create a list of tasks that respect the semaphore limit
        tasks = [
            asyncio.create_task(handle_scraping(item, context, base_url, sem))
            for item in items
        ]

        # Wait until all tasks are done
        await asyncio.gather(*tasks)

        # Close the browser
        await context.close()
        await browser.close()

    # Save updated JSON
    with open(input_filename, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

    print(f"\nDone! Updated store locations have been saved in '{input_filename}'.")


if __name__ == "__main__":
    asyncio.run(main())