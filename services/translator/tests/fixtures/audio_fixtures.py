"""
Audio Test Fixtures
Provides utilities for generating test audio files and mock data
"""

import struct
import tempfile
import shutil
from pathlib import Path
from typing import Optional, Dict, Any
from dataclasses import dataclass


@dataclass
class AudioFixture:
    """Audio fixture with path and metadata"""
    path: Path
    duration_ms: int
    sample_rate: int
    channels: int
    format: str


class AudioFixtureGenerator:
    """Generates audio files for testing"""

    @staticmethod
    def create_wav_file(
        path: Path,
        duration_seconds: float = 1.0,
        sample_rate: int = 44100,
        channels: int = 1,
        bits_per_sample: int = 16
    ) -> AudioFixture:
        """
        Create a WAV file with silence or simple tone.

        Args:
            path: Output file path
            duration_seconds: Duration in seconds
            sample_rate: Sample rate (Hz)
            channels: Number of channels
            bits_per_sample: Bits per sample

        Returns:
            AudioFixture with file details
        """
        n_samples = int(sample_rate * duration_seconds)
        bytes_per_sample = bits_per_sample // 8
        data_size = n_samples * channels * bytes_per_sample
        file_size = 36 + data_size

        with open(path, 'wb') as f:
            # RIFF header
            f.write(b'RIFF')
            f.write(struct.pack('<I', file_size))
            f.write(b'WAVE')

            # fmt chunk
            f.write(b'fmt ')
            f.write(struct.pack('<I', 16))  # Chunk size
            f.write(struct.pack('<H', 1))   # Audio format (PCM)
            f.write(struct.pack('<H', channels))
            f.write(struct.pack('<I', sample_rate))
            f.write(struct.pack('<I', sample_rate * channels * bytes_per_sample))
            f.write(struct.pack('<H', channels * bytes_per_sample))
            f.write(struct.pack('<H', bits_per_sample))

            # data chunk
            f.write(b'data')
            f.write(struct.pack('<I', data_size))

            # Write silence
            for _ in range(n_samples * channels):
                f.write(struct.pack('<h', 0))

        return AudioFixture(
            path=path,
            duration_ms=int(duration_seconds * 1000),
            sample_rate=sample_rate,
            channels=channels,
            format="wav"
        )

    @staticmethod
    def create_minimal_wav_bytes() -> bytes:
        """Create minimal WAV file bytes for quick testing"""
        return bytes([
            0x52, 0x49, 0x46, 0x46,  # "RIFF"
            0x24, 0x00, 0x00, 0x00,  # File size - 8
            0x57, 0x41, 0x56, 0x45,  # "WAVE"
            0x66, 0x6D, 0x74, 0x20,  # "fmt "
            0x10, 0x00, 0x00, 0x00,  # Chunk size (16)
            0x01, 0x00,              # Audio format (1 = PCM)
            0x01, 0x00,              # Channels (1 = mono)
            0x44, 0xAC, 0x00, 0x00,  # Sample rate (44100)
            0x88, 0x58, 0x01, 0x00,  # Byte rate
            0x02, 0x00,              # Block align
            0x10, 0x00,              # Bits per sample (16)
            0x64, 0x61, 0x74, 0x61,  # "data"
            0x00, 0x00, 0x00, 0x00,  # Data size
        ])

    @staticmethod
    def create_test_audio_dir() -> Path:
        """Create a temporary directory with test audio files"""
        temp_dir = Path(tempfile.mkdtemp(prefix="audio_test_"))

        # Create various test files
        AudioFixtureGenerator.create_wav_file(
            temp_dir / "short_audio.wav",
            duration_seconds=0.5
        )

        AudioFixtureGenerator.create_wav_file(
            temp_dir / "medium_audio.wav",
            duration_seconds=5.0
        )

        AudioFixtureGenerator.create_wav_file(
            temp_dir / "long_audio.wav",
            duration_seconds=15.0
        )

        AudioFixtureGenerator.create_wav_file(
            temp_dir / "stereo_audio.wav",
            duration_seconds=1.0,
            channels=2
        )

        return temp_dir

    @staticmethod
    def cleanup_test_dir(temp_dir: Path):
        """Clean up temporary test directory"""
        if temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)


# ═══════════════════════════════════════════════════════════════
# MOCK DATA FIXTURES
# ═══════════════════════════════════════════════════════════════

SAMPLE_MOBILE_TRANSCRIPTIONS = {
    "french": {
        "text": "Bonjour, comment allez-vous aujourd'hui?",
        "language": "fr",
        "confidence": 0.92,
        "source": "ios_speech",
        "segments": [
            {"text": "Bonjour,", "startMs": 0, "endMs": 800, "confidence": 0.95},
            {"text": "comment allez-vous", "startMs": 800, "endMs": 2000, "confidence": 0.90},
            {"text": "aujourd'hui?", "startMs": 2000, "endMs": 3000, "confidence": 0.88}
        ]
    },
    "english": {
        "text": "Hello, how are you doing today?",
        "language": "en",
        "confidence": 0.95,
        "source": "whisperkit",
        "segments": [
            {"text": "Hello,", "startMs": 0, "endMs": 500, "confidence": 0.98},
            {"text": "how are you doing", "startMs": 500, "endMs": 1500, "confidence": 0.94},
            {"text": "today?", "startMs": 1500, "endMs": 2000, "confidence": 0.93}
        ]
    },
    "spanish": {
        "text": "Hola, como estas hoy?",
        "language": "es",
        "confidence": 0.90,
        "source": "android_speech",
        "segments": [
            {"text": "Hola,", "startMs": 0, "endMs": 400},
            {"text": "como estas hoy?", "startMs": 400, "endMs": 1500}
        ]
    },
    "german": {
        "text": "Guten Tag, wie geht es Ihnen?",
        "language": "de",
        "confidence": 0.88,
        "source": "ios_speech"
    }
}


SAMPLE_AUDIO_REQUESTS = {
    "simple": {
        "message_id": "msg_simple_001",
        "attachment_id": "att_simple_001",
        "conversation_id": "conv_001",
        "sender_id": "user_sender_001",
        "audio_duration_ms": 5000,
        "target_languages": ["fr"],
        "generate_voice_clone": True,
        "model_type": "medium"
    },
    "multi_language": {
        "message_id": "msg_multi_001",
        "attachment_id": "att_multi_001",
        "conversation_id": "conv_002",
        "sender_id": "user_sender_002",
        "audio_duration_ms": 10000,
        "target_languages": ["fr", "es", "de", "zh"],
        "generate_voice_clone": True,
        "model_type": "premium"
    },
    "no_clone": {
        "message_id": "msg_noclone_001",
        "attachment_id": "att_noclone_001",
        "conversation_id": "conv_003",
        "sender_id": "user_sender_003",
        "audio_duration_ms": 3000,
        "target_languages": ["en"],
        "generate_voice_clone": False,
        "model_type": "basic"
    }
}


SAMPLE_TRANSLATIONS = {
    ("en", "fr"): "Ceci est un texte de test traduit en francais.",
    ("en", "es"): "Este es un texto de prueba traducido al espanol.",
    ("en", "de"): "Dies ist ein ubersetzter Testtext auf Deutsch.",
    ("en", "zh"): "这是翻译成中文的测试文本。",
    ("fr", "en"): "This is a test text translated into English.",
    ("fr", "es"): "Este es un texto de prueba traducido del frances.",
    ("es", "en"): "This is a test text translated from Spanish.",
    ("de", "en"): "This is a test text translated from German."
}


def get_translation(source_lang: str, target_lang: str, original_text: str) -> str:
    """Get a sample translation for testing"""
    key = (source_lang, target_lang)
    if key in SAMPLE_TRANSLATIONS:
        return SAMPLE_TRANSLATIONS[key]
    return f"[{target_lang}] {original_text}"


# ═══════════════════════════════════════════════════════════════
# EXPECTED RESULTS FOR ASSERTIONS
# ═══════════════════════════════════════════════════════════════

EXPECTED_TRANSCRIPTION_FIELDS = [
    "text",
    "language",
    "confidence",
    "source",
    "duration_ms"
]

EXPECTED_TTS_RESULT_FIELDS = [
    "audio_path",
    "audio_url",
    "duration_ms",
    "format",
    "language",
    "voice_cloned",
    "voice_quality"
]

EXPECTED_PIPELINE_RESULT_FIELDS = [
    "message_id",
    "attachment_id",
    "original",
    "translations",
    "voice_model_user_id",
    "voice_model_quality",
    "processing_time_ms"
]

EXPECTED_VOICE_MODEL_FIELDS = [
    "user_id",
    "embedding_path",
    "audio_count",
    "total_duration_ms",
    "quality_score",
    "version"
]
