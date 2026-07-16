---
name: FuncapSolver Instagram preset
description: Correct preset config for Instagram sitekey B7D8911C in lib/funcaptcha-solver/helpers/presets.py.
---

## Rule
The FuncapSolver repo ships `B7D8911C-5CC8-A9A3-35B0-554ACEE604DA` mapped to "OUTLOOK MOBILE REG" with wrong settings. The correct Instagram config is:

```python
"B7D8911C-5CC8-A9A3-35B0-554ACEE604DA": {
    "siteurl": "https://www.instagram.com",
    "sitekey": "B7D8911C-5CC8-A9A3-35B0-554ACEE604DA",
    "apiurl": "https://client-api.arkoselabs.com",   # NOT instagram-api.arkoselabs.com (NXDOMAIN)
    "capi_mode": "lightbox",
    "style_theme": "default",
    "requires_blob": False,                           # Instagram mobile API does NOT need a blob
    "data": {
        "window__ancestor_origins": ["https://www.instagram.com"],
        "client_config__sitedata_location_href": "https://iframe.arkoselabs.com/B7D8911C.../index.html",
        "window__tree_structure": "[[]]",
        "window__tree_index": [0],
    },
}
```

**Why:** The old mapping pointed to a non-existent hostname; the blob requirement caused 400 "Blob is required" before even reaching Arkose's network.

**How to apply:** If FuncapSolver is ever re-cloned or the preset file is reset, reapply this config immediately.
