import json

with open('public/data/cuadrantes_colombia.min.geojson', 'r') as f:
    data = json.load(f)
    feature = data['features'][0]
    print('=== PROPIEDADES ===')
    for key, value in feature['properties'].items():
        print(f'{key}: {value}')
