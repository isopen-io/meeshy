#!/usr/bin/env python3
"""
Verify MMS TTS Models on Facebook servers
=========================================
Check which MMS TTS models are available via dl.fbaipublicfiles.com
"""

import requests
from typing import Dict, List, Tuple

# Languages to check - ISO 639-3 codes used by MMS
LANGUAGES_TO_CHECK = {
    # African languages
    "lin": "Lingala",
    "swh": "Swahili",
    "yor": "Yoruba",
    "hau": "Hausa",
    "ibo": "Igbo",
    "zul": "Zulu",
    "xho": "Xhosa",
    "amh": "Amharic",
    "kin": "Kinyarwanda",
    "sna": "Shona",
    "wol": "Wolof",
    "lug": "Luganda",
    "orm": "Oromo",
    "tir": "Tigrinya",
    "afr": "Afrikaans",
    "nya": "Chichewa",
    "som": "Somali",
    "mlg": "Malagasy",
    "run": "Kirundi",
    "ful": "Fula",
    "twi": "Twi",
    "ewe": "Ewe",
    "bem": "Bemba",
    "tso": "Tsonga",
    "ssw": "Swati",
    "tsn": "Tswana",
    "nso": "Northern Sotho",
    "sot": "Southern Sotho",
    "ven": "Venda",
    "nde": "Northern Ndebele",
    # Cameroonian
    "bas": "Basaa",
    "ksf": "Bafia",
    "nnh": "Ngiemboon",
    "dua": "Duala",
    "bum": "Bulu",
    "ewo": "Ewondo",
    "ybb": "Yemba",
    # European (for comparison)
    "eng": "English",
    "fra": "French",
    "spa": "Spanish",
    "deu": "German",
    "por": "Portuguese",
}

# ISO 639-1 to ISO 639-3 mapping
ISO_639_1_TO_3 = {
    "ln": "lin",
    "sw": "swh",
    "yo": "yor",
    "ha": "hau",
    "ig": "ibo",
    "zu": "zul",
    "xh": "xho",
    "am": "amh",
    "rw": "kin",
    "sn": "sna",
    "wo": "wol",
    "lg": "lug",
    "om": "orm",
    "ti": "tir",
    "af": "afr",
    "ny": "nya",
    "so": "som",
    "mg": "mlg",
    "rn": "run",
    "ff": "ful",
    "tw": "twi",
    "ee": "ewe",
    "ts": "tso",
    "ss": "ssw",
    "tn": "tsn",
    "st": "sot",
    "ve": "ven",
    "nd": "nde",
    "en": "eng",
    "fr": "fra",
    "es": "spa",
    "de": "deu",
    "pt": "por",
}


def check_model_exists(iso_639_3_code: str) -> Tuple[bool, str]:
    """Check if a MMS TTS model exists on Facebook servers"""
    url = f"https://dl.fbaipublicfiles.com/mms/tts/{iso_639_3_code}.tar.gz"

    try:
        response = requests.head(url, timeout=10, allow_redirects=True)
        if response.status_code == 200:
            # Get file size if available
            size = response.headers.get('content-length', 'unknown')
            if size != 'unknown':
                size = f"{int(size) / 1024 / 1024:.1f}MB"
            return True, size
        elif response.status_code == 404:
            return False, "Not found"
        else:
            return False, f"HTTP {response.status_code}"
    except Exception as e:
        return False, f"Error: {e}"


def main():
    print("=" * 70)
    print("MMS TTS Model Availability Check (Facebook servers)")
    print("URL pattern: https://dl.fbaipublicfiles.com/mms/tts/{code}.tar.gz")
    print("=" * 70)
    print()

    available = []
    not_available = []

    for iso_3, name in sorted(LANGUAGES_TO_CHECK.items(), key=lambda x: x[1]):
        exists, info = check_model_exists(iso_3)

        status = "✅" if exists else "❌"
        print(f"  {status} {iso_3:4s} - {name:20s} : {info}")

        if exists:
            available.append((iso_3, name, info))
        else:
            not_available.append((iso_3, name, info))

    print()
    print("=" * 70)
    print("Summary")
    print("=" * 70)
    print(f"\n  Available: {len(available)}/{len(LANGUAGES_TO_CHECK)}")
    print(f"  Not available: {len(not_available)}/{len(LANGUAGES_TO_CHECK)}")

    if available:
        print("\n  === AVAILABLE AFRICAN LANGUAGES ===")
        african_available = [(c, n, s) for c, n, s in available
                           if c not in ["eng", "fra", "spa", "deu", "por"]]
        for iso_3, name, size in african_available:
            # Find ISO 639-1 code
            iso_1 = next((k for k, v in ISO_639_1_TO_3.items() if v == iso_3), iso_3)
            print(f'    "{iso_1}": ("{iso_3}", "{name}"),  # {size}')

    if not_available:
        print("\n  === NOT AVAILABLE ===")
        for iso_3, name, reason in not_available:
            print(f"    - {name} ({iso_3}): {reason}")

    # Generate Python code
    print("\n\n  === PYTHON CODE FOR MMS_TTS_LANGUAGES ===")
    print("  MMS_TTS_LANGUAGES = {")
    for iso_3, name, size in sorted(available, key=lambda x: x[1]):
        iso_1 = next((k for k, v in ISO_639_1_TO_3.items() if v == iso_3), iso_3)
        print(f'      "{iso_1}": "{iso_3}",  # {name}')
    print("  }")


if __name__ == "__main__":
    main()
