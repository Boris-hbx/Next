#!/usr/bin/env python3
"""
Download city map images for tower defense game backgrounds
Uses OpenStreetMap static map API
"""

import urllib.request
import os

# City coordinates (lat, lon) and zoom level
CITIES = {
    'Toronto': (43.6532, -79.3832, 12),
    'Vancouver': (49.2827, -123.1207, 12),
    'Kingston': (44.2312, -76.4860, 13),
    'Montreal': (45.5017, -73.5673, 12),
    'Ottawa': (45.4215, -75.6972, 12),
    'Edmonton': (53.5461, -113.4938, 12),
}

# Output directory
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'PrtSc')

def download_map(city_name, lat, lon, zoom):
    """Download a static map image from OpenStreetMap"""
    # Using OSM static map service (geoapify)
    # Free tier allows 3000 requests/day

    # Alternative: use a simple colored placeholder
    width = 700
    height = 500

    # Using staticmaps from geoapify (free tier)
    # Or we can use mapbox static API

    # For now, let's create a simple approach using urllib
    # Using Stamen/Stadia maps which are free

    url = f"https://tile.openstreetmap.org/{zoom}/{int((lon + 180) / 360 * (2 ** zoom))}/{int((1 - (lat * 3.14159 / 180).tan().log() / 3.14159) / 2 * (2 ** zoom))}.png"

    print(f"Note: For actual map images, please manually download from:")
    print(f"  https://www.openstreetmap.org/#map={zoom}/{lat}/{lon}")
    print(f"  Take a screenshot and save as: PrtSc/{city_name}.png")
    print()

def main():
    print("=" * 60)
    print("City Map Download Instructions")
    print("=" * 60)
    print()
    print("For each city, visit the URL below, take a screenshot,")
    print("crop to 700x500 pixels, and save to PrtSc/ folder.")
    print()

    for city, (lat, lon, zoom) in CITIES.items():
        url = f"https://www.openstreetmap.org/#map={zoom}/{lat}/{lon}"
        print(f"{city}:")
        print(f"  URL: {url}")
        print(f"  Save as: PrtSc/{city}.png")
        print()

    print("=" * 60)
    print("Alternative: Use Google Maps satellite view")
    print("=" * 60)
    print()
    for city, (lat, lon, zoom) in CITIES.items():
        url = f"https://www.google.com/maps/@{lat},{lon},{zoom}z"
        print(f"{city}: {url}")

if __name__ == "__main__":
    main()
