from typing import Optional

from . import models

PRESETS = {
    # INSTAGRAM LOGIN
    "B7D8911C-5CC8-A9A3-35B0-554ACEE604DA": {
        "siteurl": "https://www.instagram.com",
        "sitekey": "B7D8911C-5CC8-A9A3-35B0-554ACEE604DA",
        "apiurl": "https://client-api.arkoselabs.com",
        "capi_mode": "inline",
        "style_theme": "default",
        "requires_blob": False,
        "data": {
            "window__ancestor_origins": ["https://www.instagram.com"],
            "client_config__sitedata_location_href": "https://www.instagram.com/accounts/login/",
            "window__tree_structure": "[[[]]]",
            "window__tree_index": [0, 0],
        },
    },
    # ROBLOX REG
    "A2A14B1D-1AF3-C791-9BBC-EE33CC7A0A6F": {
        "siteurl": "https://www.roblox.com",
        "sitekey": "A2A14B1D-1AF3-C791-9BBC-EE33CC7A0A6F",
        "apiurl": "https://arkoselabs.roblox.com",
        "capi_mode": "inline",
        "style_theme": "default",
        "requires_blob": True,
        "data": {
            "window__ancestor_origins": [
                "https://www.roblox.com",
                "https://www.roblox.com",
            ],
            "client_config__sitedata_location_href": "https://www.roblox.com/arkose/iframe",
            "window__tree_structure": "[[[]]]",
            "window__tree_index": [0, 0],
        },
    },
    # X WEB REG
    "2CB16598-CB82-4CF7-B332-5990DB66F3AB": {
        "siteurl": "https://iframe.arkoselabs.com",
        "sitekey": "2CB16598-CB82-4CF7-B332-5990DB66F3AB",
        "apiurl": "https://client-api.arkoselabs.com",
        "capi_mode": "inline",
        "style_theme": "dark",
        "requires_blob": True,
        "data": {
            "window__ancestor_origins": [
                "https://iframe.arkoselabs.com",
                "https://x.com"
            ],
            "client_config__sitedata_location_href": "https://iframe.arkoselabs.com/2CB16598-CB82-4CF7-B332-5990DB66F3AB/index.html",
            "window__tree_structure": "[[[]]]",
            "window__tree_index": [0, 0],
        },
    },
    # GITHUB SIGNUP
    "747B83EC-2CA3-43AD-A7DF-701F286FBABA": {
        "siteurl": "https://octocaptcha.com",
        "sitekey": "747B83EC-2CA3-43AD-A7DF-701F286FBABA",
        "apiurl": "https://github-api.arkoselabs.com",
        "capi_mode": "inline",
        "style_theme": "light",
        "requires_blob": True,
        "data": {
            "window__ancestor_origins": ["https://github.com"],
            "client_config__sitedata_location_href": "https://octocaptcha.com/",
            "window__tree_structure": "[[]]",
            "window__tree_index": [0],
        },
    },
    # SNAPCHAT REGISTER
    "EA4B65CB-594A-438E-B4B5-D0DBA28C9334": {
        "siteurl": "https://iframe.arkoselabs.com",
        "sitekey": "EA4B65CB-594A-438E-B4B5-D0DBA28C9334",
        "apiurl": "https://snap-api.arkoselabs.com",
        "capi_mode": "lightbox",
        "style_theme": "default",
        "requires_blob": True,
        "data": {
            "window__ancestor_origins": ["https://accounts.snapchat.com"],
            "client_config__sitedata_location_href": "https://iframe.arkoselabs.com/EA4B65CB-594A-438E-B4B5-D0DBA28C9334/lightbox.html",
            "window__tree_structure": "[[]]",
            "window__tree_index": [0],
        },
    },
}


def get_preset(sitekey: str) -> Optional[models.Preset]:
    if sitekey not in PRESETS:
        return None
    return models.Preset.from_raw_data(PRESETS[sitekey])
