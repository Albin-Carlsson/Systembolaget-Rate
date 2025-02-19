#!/usr/bin/env python3
import json
from bs4 import BeautifulSoup

def add_review_info_to_data(input_file, output_file=None):
    # Load JSON data
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Process both "beers" and "wines" arrays if they exist.
    for key in ["beers", "wines"]:
        products = data.get(key, [])
        for index, product in enumerate(products):
            # Get the rating value (it may be None)
            rating_str = product.get("rating")
            try:
                # If rating_str is None or falsy, default to 0
                original_rating = float(rating_str or 0)
            except (ValueError, TypeError):
                original_rating = 0.0

            # Round rating to the nearest half star.
            half_star_rating = round(original_rating * 2) / 2
            full_stars = int(half_star_rating)
            has_half_star = (half_star_rating - full_stars) == 0.5

            # Build the star string.
            stars = "⭐ " * full_stars
            stars = stars.strip()  # Remove trailing space

            # Build the review text.
            formatted_rating = f"{original_rating:.2f}/5"
            if has_half_star:
                review_text = f"{stars}(+)     {formatted_rating}"
            else:
                review_text = f"{stars} {formatted_rating}"
            
            # Get the HTML from the "data" field and parse it.
            html_data = product.get("data", "")
            if html_data:
                soup = BeautifulSoup(html_data, "html.parser")
                # Find the target div where product info is stored.
                target_div = soup.find("div", class_="css-rqa69l e1iq8b8k1")
                if target_div:
                    # Locate the first <p> tag inside that div.
                    first_p = target_div.find("p")
                    if first_p:
                        # Create a new <p> tag for the review info.
                        new_p = soup.new_tag("p", color="black", **{"class": "css-1njx6qf e1iq8b8k0"})
                        new_p.string = review_text
                        # Insert the new <p> right after the first <p>.
                        first_p.insert_after(new_p)
                        # Update the product's "data" field with the modified HTML.
                        product["data"] = str(soup)
                    else:
                        prod_name = product.get("beer_name") or product.get("wine_name") or f"index {index}"
                        print(f"[Warning] No <p> tag found in target div for product: {prod_name}")
                else:
                    prod_name = product.get("beer_name") or product.get("wine_name") or f"index {index}"
                    print(f"[Warning] Target div not found in 'data' for product: {prod_name}")
            else:
                prod_name = product.get("beer_name") or product.get("wine_name") or f"index {index}"
                print(f"[Warning] No HTML data for product: {prod_name}")
    
    # If no output file is specified, overwrite the input file.
    if output_file is None:
        output_file = input_file

    # Write the updated JSON back to file.
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
    
    print(f"Review info added and JSON saved to '{output_file}'.")

if __name__ == '__main__':
    add_review_info_to_data("items.json")