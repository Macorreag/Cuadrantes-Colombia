#!/usr/bin/env python3
"""
Development utility script to inspect GeoJSON properties.
This script is for debugging purposes only.
Consider removing before production deployment.
"""
import json

with open('public/data/cuadrantes_colombia.min.geojson', 'r') as f:
    data = json.load(f)
    feature = data['features'][0]
    print('=== PROPIEDADES ===')
    for key, value in feature['properties'].items():
        print(f'{key}: {value}')
