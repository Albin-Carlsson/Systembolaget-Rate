import json
import time
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# Initialize the WebDriver
driver = webdriver.Chrome()  # Specify the path to your ChromeDriver if needed


def scrape_beers():
    beers = []

    while True:
        # Wait for beer elements to be present
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "a.css-ijjvfs.e12xogow0"))
        )

        # Locate all <a> elements by their CSS class
        a_elements = driver.find_elements(By.CSS_SELECTOR, "a.css-ijjvfs.e12xogow0")

        for a_element in a_elements:
            content = a_element.get_attribute('outerHTML')

            try:
                beer_name_element = a_element.find_element(By.CSS_SELECTOR, "p.css-1njx6qf.e1iq8b8k0")
                brewery_name = beer_name_element.text
            except:
                brewery_name = ""

            try:
                beer_description_element = a_element.find_element(By.CSS_SELECTOR, "p.css-1hdv0wt.e1iq8b8k0")
                beer_name = beer_description_element.text
            except:
                beer_name = ""

            beer_data = {
                "data": content,
                "beer_name": brewery_name + " + " + beer_name,
            }
            beers.append(beer_data)

        # Try to find and click the next page button
        try:
            next_page_button = driver.find_element(By.CSS_SELECTOR, "a.css-17veatv.enbz1310")
            next_page_button.click()
            time.sleep(2)  # Wait for new page content to load
        except:
            break  # No more next page button, exit the loop

    return beers


try:
    # Open the webpage
    driver.get("https://www.systembolaget.se/sortiment/ol/ljus-lager/")

    # Accept age confirmation
    WebDriverWait(driver, 10).until(
        EC.element_to_be_clickable((By.XPATH, "//a[contains(text(), 'Jag har fyllt 20 år')]"))
    ).click()

    # Save settings
    WebDriverWait(driver, 10).until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "button.css-xute7l.enbz1310"))
    ).click()

    # Scrape beer data across multiple pages
    beers_data = {"beers": scrape_beers()}

    # Write the data to a JSON file
    with open('beers.json', 'w', encoding='utf-8') as f:
        json.dump(beers_data, f, ensure_ascii=False, indent=4)

finally:
    # Close the WebDriver
    driver.quit()
