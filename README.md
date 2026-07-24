# Isle of Night

Interactive military reconnaissance website centred on the Isle of Wight.

## Operation Vectis v1.0

This repository contains the initial full-width interactive map build:

- live satellite imagery and road reference layers
- military night-vision treatment
- red tactical HUD
- six geolocated objectives
- animated square targeting reticule
- click-only intelligence panels
- responsive desktop and mobile layouts
- no sound

## Local preview

Run a simple local web server from the repository folder:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Deployment

The project is a static website and can be deployed directly through Cloudflare Pages. Use no build command and set the output directory to the repository root.
