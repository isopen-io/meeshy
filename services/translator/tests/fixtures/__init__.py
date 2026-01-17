"""
Test Fixtures Package
Provides audio fixtures and mock data for testing
"""

from .audio_fixtures import (
    # Real audio fixtures
    AUDIO_FIXTURES_DIR,
    VOICE_CLONE_SAMPLES,
    VOICE_SAMPLE_PATH,
    get_voice_clone_sample,
    get_voice_sample,
    get_available_voice_samples,
    load_voice_sample_bytes,
    # Generated fixtures
    AudioFixture,
    AudioFixtureGenerator,
    SAMPLE_MOBILE_TRANSCRIPTIONS,
    SAMPLE_AUDIO_REQUESTS,
    SAMPLE_TRANSLATIONS,
    get_translation,
    EXPECTED_TRANSCRIPTION_FIELDS,
    EXPECTED_TTS_RESULT_FIELDS,
    EXPECTED_PIPELINE_RESULT_FIELDS,
    EXPECTED_VOICE_MODEL_FIELDS
)

__all__ = [
    # Real audio fixtures
    "AUDIO_FIXTURES_DIR",
    "VOICE_CLONE_SAMPLES",
    "VOICE_SAMPLE_PATH",
    "get_voice_clone_sample",
    "get_voice_sample",
    "get_available_voice_samples",
    "load_voice_sample_bytes",
    # Generated fixtures
    "AudioFixture",
    "AudioFixtureGenerator",
    "SAMPLE_MOBILE_TRANSCRIPTIONS",
    "SAMPLE_AUDIO_REQUESTS",
    "SAMPLE_TRANSLATIONS",
    "get_translation",
    "EXPECTED_TRANSCRIPTION_FIELDS",
    "EXPECTED_TTS_RESULT_FIELDS",
    "EXPECTED_PIPELINE_RESULT_FIELDS",
    "EXPECTED_VOICE_MODEL_FIELDS"
]
