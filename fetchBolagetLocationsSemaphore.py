#!/usr/bin/env python3
import argparse
import asyncio
import json
import os
import re
from playwright.async_api import async_playwright

# -----------------------
# Progress counter class
# -----------------------
class ProgressCounter:
    def __init__(self):
        self.count = 0
        self.lock = asyncio.Lock()

    async def increment(self):
        async with self.lock:
            self.count += 1
            return self.count

# -----------------------
# Scraping function
# -----------------------
async def scrape_product(product_url, page) -> list[str]:
    locations = []

    print(f"\nNavigating to {product_url}")
    # 1. Navigate with "load" (instead of "networkidle")
    await page.goto(product_url, wait_until="load", timeout=30000)
    
    # 2. Try age confirmation
    try:
        await page.click("xpath=//a[contains(text(), 'Jag har fyllt 20 år')]", timeout=3000)
        print("Clicked age confirmation.")
    except Exception:
        print("Age confirmation not found or already accepted.")

    # 3. Try save settings
    try:
        await page.click("css=button.css-xute7l.enbz1310", timeout=3000)
        print("Clicked save settings button.")
    except Exception:
        print("Save settings button not found or already clicked.")

    # 4. Click the "Välj butik" button by class or text
    try:
        await page.click("button.css-1vu4ctf.enbz1310", timeout=5000)
        print("Clicked 'Välj butik' button by class.")
    except Exception:
        try:
            await page.click("button:has-text('Välj butik')", timeout=5000)
            print("Clicked 'Välj butik' button by text.")
        except Exception as e:
            print("Failed to click 'Välj butik':", e)
            return locations  # Exit early if we can’t proceed

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
# Helper coroutine for scraping each item
# -----------------------
async def handle_scraping(item, context, base_url, sem, progress_counter, subset_total, start_index, overall_total):
    href = item.get("href")
    if not href:
        print("Skipping item with no 'href':", item)
        item["locations"] = []
        current = await progress_counter.increment()
        overall_progress = start_index + current
        print(f"Task {current}/{subset_total} processed (overall: {overall_progress}/{overall_total})")
        return

    product_url = base_url + href

    async with sem:
        page = await context.new_page()
        try:
            locations = await scrape_product(product_url, page)
            item["locations"] = locations
        except Exception as e:
            print(f"Error processing {product_url}: {e}")
            item["locations"] = []
        finally:
            await page.close()
        current = await progress_counter.increment()
        overall_progress = start_index + current
        print(f"Task {current}/{subset_total} processed (overall: {overall_progress}/{overall_total})")

# -----------------------
# Main coroutine
# -----------------------
async def main():
    parser = argparse.ArgumentParser(description='Scrape Systembolaget locations.')
    parser.add_argument('--start', type=int, default=0, help='Starting index (inclusive) of items to process.')
    parser.add_argument('--end', type=int, default=None, help='Ending index (exclusive) of items to process.')
    parser.add_argument('--concurrency', type=int, default=10, help='Number of concurrent tasks.')
    args = parser.parse_args()

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

    if "beers" not in data:
        print("No 'beers' category found in JSON.")
        return

    items = data["beers"]
    overall_total = len(items)
    start_index = args.start
    end_index = args.end if args.end is not None else overall_total
    if start_index < 0 or start_index >= overall_total:
        print("Invalid start index.")
        return
    # Select only a subset of the data
    items_subset = items[start_index:end_index]
    subset_total = len(items_subset)
    print(f"Processing items from index {start_index} to {end_index} (subset: {subset_total} tasks, overall: {overall_total} tasks)")

    concurrency_limit = args.concurrency
    sem = asyncio.Semaphore(concurrency_limit)
    progress_counter = ProgressCounter()

    base_url = "https://www.systembolaget.se"

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--start-maximized"]
        )
        context = await browser.new_context(viewport={"width": 1000, "height": 500})
        context.set_default_navigation_timeout(30000)
        context.set_default_timeout(30000)

        tasks = [
            asyncio.create_task(
                handle_scraping(item, context, base_url, sem, progress_counter, subset_total, start_index, overall_total)
            )
            for item in items_subset
        ]
        # Using return_exceptions=True to prevent one failed task from cancelling all others
        await asyncio.gather(*tasks, return_exceptions=True)

        await context.close()
        await browser.close()

    # Save updated JSON with the scraped store locations
    with open(input_filename, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

    print(f"\nDone! Updated store locations have been saved in '{input_filename}'.")

if __name__ == "__main__":
    asyncio.run(main())
