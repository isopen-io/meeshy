#!/usr/bin/env python3
"""
Verify MMS TTS Models Availability
==================================
Check which MMS TTS models actually exist on Hugging Face.
"""

import sys
import requests
from typing import Dict, List, Tuple

# African languages to check with their ISO 639-3 codes
LANGUAGES_TO_CHECK = {
    # Format: iso_639_1/2: (iso_639_3, name)
    "ln": ("lin", "Lingala"),
    "sw": ("swh", "Swahili"),  # Note: sw -> swh for Swahili
    "yo": ("yor", "Yoruba"),
    "ha": ("hau", "Hausa"),
    "ig": ("ibo", "Igbo"),
    "zu": ("zul", "Zulu"),
    "xh": ("xho", "Xhosa"),
    "am": ("amh", "Amharic"),
    "rw": ("kin", "Kinyarwanda"),
    "sn": ("sna", "Shona"),
    "wo": ("wol", "Wolof"),
    "lg": ("lug", "Luganda"),
    "om": ("orm", "Oromo"),
    "ti": ("tir", "Tigrinya"),
    "af": ("afr", "Afrikaans"),
    # Cameroonian
    "bas": ("bas", "Basaa"),
    "ksf": ("ksf", "Bafia"),
    "nnh": ("nnh", "Ngiemboon"),
    # European for comparison
    "en": ("eng", "English"),
    "fr": ("fra", "French"),
    "es": ("spa", "Spanish"),
    "de": ("deu", "German"),
    "pt": ("por", "Portuguese"),
}


def check_model_exists(iso_639_3_code: str) -> Tuple[bool, str]:
    """Check if a MMS TTS model exists on Hugging Face"""
    model_id = f"facebook/mms-tts-{iso_639_3_code}"
    url = f"https://huggingface.co/api/models/{model_id}"

    try:
        response = requests.head(url, timeout=10)
        if response.status_code == 200:
            return True, model_id
        elif response.status_code == 404:
            return False, model_id
        else:
            return False, f"{model_id} (HTTP {response.status_code})"
    except Exception as e:
        return False, f"{model_id} (Error: {e})"


def main():
    print("=" * 70)
    print("MMS TTS Model Availability Check")
    print("=" * 70)
    print()

    results: Dict[str, Dict] = {}
    available = []
    not_available = []

    for iso_2, (iso_3, name) in LANGUAGES_TO_CHECK.items():
        exists, model_id = check_model_exists(iso_3)
        results[iso_2] = {
            "iso_639_3": iso_3,
            "name": name,
            "exists": exists,
            "model_id": model_id
        }

        status = "✅" if exists else "❌"
        print(f"  {status} {iso_2:4s} ({iso_3}) - {name:15s} : {model_id}")

        if exists:
            available.append((iso_2, iso_3, name))
        else:
            not_available.append((iso_2, iso_3, name))

    print()
    print("=" * 70)
    print("Summary")
    print("=" * 70)
    print(f"\n  Available: {len(available)}/{len(LANGUAGES_TO_CHECK)}")
    print(f"  Not available: {len(not_available)}/{len(LANGUAGES_TO_CHECK)}")

    if not_available:
        print("\n  Languages WITHOUT MMS TTS support:")
        for iso_2, iso_3, name in not_available:
            print(f"    - {name} ({iso_2}/{iso_3})")

    print("\n  Python dict for available languages:")
    print("  MMS_TTS_LANGUAGES = {")
    for iso_2, iso_3, name in available:
        print(f'      "{iso_2}": "{iso_3}",  # {name}')
    print("  }")

    return results


if __name__ == "__main__":
    main()
