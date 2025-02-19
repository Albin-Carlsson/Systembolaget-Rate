#!/usr/bin/env python3
import sys
import json
import re
from bs4 import BeautifulSoup

def parse_number(text):
    """
    Extracts the first number (allowing for decimals with a period or comma)
    from the text and returns it as an int if it's a whole number, or as a float 
    if it contains a decimal. Returns None if no number is found.
    """
    match = re.search(r'\d+(?:[.,]\d+)?', text)
    if match:
        num_str = match.group()
        if ',' in num_str:
            num_str = num_str.replace(',', '.')
        return float(num_str) if '.' in num_str else int(num_str)
    return None

def parse_product(html):
    """
    Parse an HTML snippet for a product (beer or wine) and extract fields like:
    country, name, brand, category, price, volume, product number, and image info.
    The product number, volume, and alcohol percentage are converted to numbers.
    Returns a dictionary with the data or None if no valid product is found.
    """
    soup = BeautifulSoup(html, 'html.parser')
    product = {}

    # Find the main container: an <a> tag with an id that starts with "tile:"
    tile = soup.find("a", id=lambda x: x and x.startswith("tile:"))
    if not tile:
        return None

    product["tile_id"] = tile.get("id")
    product["href"] = tile.get("href")

    # --- Category ---
    category_tag = tile.find("p", class_="css-4oiqd8")
    if category_tag:
        category_str = category_tag.get_text(strip=True)
        product["category"] = [cat.strip() for cat in category_str.split(',')]

    # --- Brand, Name, and Product Number ---
    info_div = tile.find("div", class_="css-rqa69l")
    if info_div:
        p_tags = info_div.find_all("p")
        if len(p_tags) >= 1:
            product["brand"] = p_tags[0].get_text(strip=True)
        if len(p_tags) >= 2:
            product["name"] = p_tags[1].get_text(strip=True)
        if len(p_tags) >= 3:
            prod_text = p_tags[2].get_text(strip=True)
            product["product_number"] = parse_number(prod_text)

    # --- Country, Volume, and Alcohol Content ---
    stock_div = tile.find("div", id="stock_scrollcontainer")
    if stock_div:
        p_stock = stock_div.find_all("p", class_="e1fb4th00")
        if p_stock:
            product["country"] = p_stock[0].get_text(strip=True)
        if len(p_stock) >= 2:
            vol_text = p_stock[1].get_text(strip=True)
            product["volume"] = parse_number(vol_text)
        if len(p_stock) >= 3:
            alc_text = p_stock[2].get_text(strip=True)
            product["alcohol"] = parse_number(alc_text)

    # --- Price ---
    price_tag = tile.find("p", class_="css-a2frwy")
    if price_tag:
        product["price"] = price_tag.get_text(strip=True)

    # --- Image Information (Optional) ---
    img_tag = tile.find("img")
    if img_tag:
        product["image_url"] = img_tag.get("src")
        product["image_alt"] = img_tag.get("alt")

    return product

def main():
    if len(sys.argv) < 2:
        print("Usage: {} input.json [output.json]".format(sys.argv[0]))
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else "output.json"

    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print("Error reading input file {}: {}".format(input_file, e))
        sys.exit(1)

    # Process both "beers" and "wines" arrays if they exist.
    keys_to_process = ["beers", "wines"]
    parsed_data = {}
    for key in keys_to_process:
        items_list = data.get(key)
        if not isinstance(items_list, list):
            print(f"Warning: The JSON file does not contain a '{key}' key with a list value.")
            continue
        parsed_list = []
        for index, item in enumerate(items_list):
            html = item.get("data")
            if not html:
                print(f"Entry in '{key}' at index {index} is missing the 'data' field; skipping.")
                continue

            parsed = parse_product(html)
            if parsed:
                # Optionally include the original name if available.
                if key == "beers" and "beer_name" in item:
                    parsed["beer_name"] = item["beer_name"]
                elif key == "wines" and "wine_name" in item:
                    parsed["wine_name"] = item["wine_name"]
                # Add a type field to indicate Beer or Wine.
                parsed["type"] = key[:-1].capitalize()  # "beers" -> "Beer", "wines" -> "Wine"
                parsed["data"] = html
                parsed_list.append(parsed)
            else:
                print(f"Warning: Could not parse product in '{key}' at index {index}; skipping.")
        parsed_data[key] = parsed_list

    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(parsed_data, f, ensure_ascii=False, indent=4)
        total = sum(len(lst) for lst in parsed_data.values())
        print(f"Successfully parsed {total} entries. Output saved to {output_file}")
    except Exception as e:
        print("Error writing output file {}: {}".format(output_file, e))
        sys.exit(1)

if __name__ == "__main__":
    main()