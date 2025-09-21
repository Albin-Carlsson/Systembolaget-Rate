import json
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time

#init webdriver
driver = webdriver.Chrome() 


def process_beer_name(beer_name):
    print(f"Processing beer: {beer_name}")
    address = "https://untappd.com/search?q=" + beer_name
    driver.get(address)

    try:
        rating_element = WebDriverWait(driver, 1).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "span.num"))
        )
        rating_text = rating_element.text
        rating_number = rating_text.strip('()')
        print("rating:", rating_number)
        return rating_number
    except Exception as e:
        print(f"Could not find rating for {beer_name}: {e}")
        return None


def read_and_process_beer_names(json_file_path):
    # Read the JSON file
    with open(json_file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Extract beer names and process each
    beers = data.get("beers", [])
    for beer in beers:
        beer_name = beer.get("beer_name", "Unknown Beer")
        rating = process_beer_name(beer_name)
        beer["rating"] = rating

    # Write the updated data back to the JSON file
    with open(json_file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)


try:
    read_and_process_beer_names("beers.json")
finally:
    driver.quit()

