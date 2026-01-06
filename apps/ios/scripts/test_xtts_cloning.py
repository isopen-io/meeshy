#!/usr/bin/env python3
"""
XTTS-v2 Voice Cloning Test
==========================
Uses Coqui XTTS-v2 for higher quality voice cloning.
XTTS can achieve 85-95% voice similarity with just 6 seconds of audio.

Install: pip install TTS
"""

import os
import sys
import argparse


def check_tts_installed():
    """Check if TTS is installed."""
    try:
        from TTS.api import TTS
        return True
    except ImportError:
        print("TTS not installed. Install with:")
        print("  pip install TTS")
        return False


def clone_with_xtts(reference_audio, text, output_path, language="en"):
    """Clone voice using XTTS-v2."""
    from TTS.api import TTS

    print("Loading XTTS-v2 model...")
    print("(First run will download ~1.8GB model)")

    # Initialize XTTS
    tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2")

    print("Cloning voice...")
    print("  Reference: {}".format(reference_audio))
    print("  Text: '{}'".format(text[:50]))

    # Generate speech with cloned voice
    tts.tts_to_file(
        text=text,
        speaker_wav=reference_audio,
        language=language,
        file_path=output_path
    )

    print("Saved: {}".format(output_path))
    return output_path


def main():
    parser = argparse.ArgumentParser(description="XTTS-v2 Voice Cloning")
    parser.add_argument('--reference', '-r', required=True, help='Reference audio (your voice)')
    parser.add_argument('--text', '-t', required=True, help='Text to speak')
    parser.add_argument('--output', '-o', default='xtts_output.wav', help='Output file')
    parser.add_argument('--language', '-l', default='en', help='Language code')

    args = parser.parse_args()

    if not check_tts_installed():
        return

    clone_with_xtts(args.reference, args.text, args.output, args.language)

    print("\nTo play: afplay {}".format(args.output))


if __name__ == "__main__":
    main()
