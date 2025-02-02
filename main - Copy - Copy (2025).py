import json

from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time

# Initialize the WebDriver
driver = webdriver.Chrome()  # or specify the path to your ChromeDriver

try:
    # Open the webpage
    driver.get("https://www.systembolaget.se/sortiment/ol/annan-ol/")

    # Wait until the "Jag har fyllt 20 år" button is present and then click it
    age_confirmation_button = WebDriverWait(driver, 10).until(
        EC.element_to_be_clickable((By.XPATH, "//a[contains(text(), 'Jag har fyllt 20 år')]"))
    )
    age_confirmation_button.click()

    # Wait until the "Spara ovan gjorda val" button is clickable and then click it
    save_selections_button = WebDriverWait(driver, 10).until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "button.css-xute7l.enbz1310"))
    )
    save_selections_button.click()

    # Click on "Visa fler" button until it is no longer present
    while True:
        try:
            # Wait until the "Visa fler" button is clickable
            show_more_button = WebDriverWait(driver, 3).until(
                EC.element_to_be_clickable((By.XPATH, "//a[contains(text(), 'Visa fler')]"))
            )
            show_more_button.click()
            # Optional: Wait for new content to load before continuing
            time.sleep(0.5)
        except:
            # Break the loop if the "Visa fler" button is not found/clickable
            break

    # Wait for the presence of at least one <a> element with the specified class name
    WebDriverWait(driver, 10).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "a.css-ijjvfs.e12xogow0"))
    )

    # Locate all <a> elements by their CSS class
    a_elements = driver.find_elements(By.CSS_SELECTOR, "a.css-ijjvfs.e12xogow0")

    beers = []

    # Loop through each element and get the entire content
    for a_element in a_elements:
        content = a_element.get_attribute('outerHTML')
        try:
            # Extract the beer name
            beer_name_element = a_element.find_element(By.CSS_SELECTOR, "p.css-1njx6qf.e1iq8b8k0")
            brewery_name = beer_name_element.text
        except:
            brewery_name = ""

        try:
            # Extract the beer description
            beer_description_element = a_element.find_element(By.CSS_SELECTOR, "p.css-1hdv0wt.e1iq8b8k0")
            beer_name = beer_description_element.text
        except:
            beer_name = ""

        beer_data = {
            "data": content,
            "beer_name": brewery_name + "+" + beer_name,
        }
        beers.append(beer_data)
    # Create the final JSON structure
    final_data = {"beers": beers}

    # Write the data to a JSON file
    with open('beers.json', 'w', encoding='utf-8') as f:
        json.dump(final_data, f, ensure_ascii=False, indent=4)

finally:
    # Close the WebDriver
    driver.quit()
