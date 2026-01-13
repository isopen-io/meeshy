#!/usr/bin/env python3
"""
Voice Cloning Test - Optimized Version
=======================================
High-performance voice cloning with Chatterbox TTS and XTTS-v2.

Features:
- GPU/MPS optimization for faster processing
- Parallel processing for multiple target languages
- History preservation with timestamped sessions
- Reference phrase for consistent voice samples
- Recent voice fallback when no recording provided

Performance Optimizations:
- Metal Performance Shaders (MPS) on macOS
- CUDA acceleration on NVIDIA GPUs
- torch.compile() for model optimization
- Parallel language processing
- Model caching and warm-up

Usage Examples:
    # Record with reference phrase, translate to multiple languages
    python voice_cloning_test.py --record 10 --targets fr,es,de,it

    # Use phrase prompt for consistent recordings
    python voice_cloning_test.py -r 10 -t en,es --phrase "Bonjour, je teste le clonage vocal"

    # Use most recent cloned voice (no recording needed)
    python voice_cloning_test.py --targets en,es,de --text "Hello world"

    # Clear history and start fresh
    python voice_cloning_test.py --clear-history

    # List history sessions
    python voice_cloning_test.py --list-history
"""

import os
import sys
import time
import json
import argparse
import subprocess
import shutil
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
import warnings
warnings.filterwarnings('ignore')

import numpy as np
import soundfile as sf
import sounddevice as sd
import librosa


# =============================================================================
# Configuration
# =============================================================================

SCRIPT_DIR = Path(__file__).parent.absolute()
OUTPUT_DIR = SCRIPT_DIR / "voice_cloning_output"
HISTORY_DIR = OUTPUT_DIR / "history"
LATEST_VOICE_FILE = OUTPUT_DIR / "latest_voice.wav"
HISTORY_INDEX_FILE = OUTPUT_DIR / "history_index.json"

# Accept XTTS license automatically
os.environ["COQUI_TOS_AGREED"] = "1"

# Default reference phrases for consistent voice samples
DEFAULT_PHRASES = {
    'fr': "Bonjour, je teste le système de clonage vocal avec cette phrase de référence.",
    'en': "Hello, I am testing the voice cloning system with this reference phrase.",
    'es': "Hola, estoy probando el sistema de clonación de voz con esta frase de referencia.",
    'de': "Hallo, ich teste das Stimmenklonungssystem mit diesem Referenzsatz.",
    'it': "Ciao, sto testando il sistema di clonazione vocale con questa frase di riferimento.",
    'pt': "Olá, estou testando o sistema de clonagem de voz com esta frase de referência.",
    'ja': "こんにちは、この参照フレーズで音声クローニングシステムをテストしています。",
    'zh': "你好，我正在用这个参考短语测试语音克隆系统。",
    'ko': "안녕하세요, 이 참조 문구로 음성 복제 시스템을 테스트하고 있습니다.",
    'ru': "Привет, я тестирую систему клонирования голоса с этой референсной фразой.",
}

# Supported languages
SUPPORTED_LANGUAGES = {
    'en': 'English', 'fr': 'French', 'es': 'Spanish', 'de': 'German',
    'it': 'Italian', 'pt': 'Portuguese', 'pl': 'Polish', 'tr': 'Turkish',
    'ru': 'Russian', 'nl': 'Dutch', 'cs': 'Czech', 'ar': 'Arabic',
    'zh': 'Chinese', 'ja': 'Japanese', 'ko': 'Korean', 'hu': 'Hungarian',
    'hi': 'Hindi', 'sv': 'Swedish', 'da': 'Danish', 'fi': 'Finnish',
    'no': 'Norwegian', 'he': 'Hebrew', 'el': 'Greek'
}


class Engine(Enum):
    CHATTERBOX = "chatterbox"
    XTTS = "xtts"


@dataclass
class CloningConfig:
    """Configuration for voice cloning."""
    engine: Engine = Engine.CHATTERBOX
    exaggeration: float = 0.5
    cfg_weight: float = 0.5
    target_languages: List[str] = field(default_factory=lambda: ['fr'])
    source_language: Optional[str] = None
    play_results: bool = True
    output_dir: Path = OUTPUT_DIR
    # Performance options
    parallel: bool = True
    max_workers: int = 2  # For parallel language processing
    optimize_model: bool = True
    use_fp16: bool = False  # Mixed precision (experimental)
    warmup: bool = True


# =============================================================================
# Performance Optimization
# =============================================================================

class PerformanceOptimizer:
    """Handles GPU/MPS optimization and performance tuning."""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._setup_device()
        self._apply_optimizations()

    def _setup_device(self):
        """Detect and configure the best available device."""
        import torch

        self.torch = torch

        if torch.cuda.is_available():
            self.device = "cuda"
            self.device_name = torch.cuda.get_device_name(0)
            # CUDA optimizations
            torch.backends.cudnn.benchmark = True
            torch.backends.cudnn.allow_tf32 = True
            torch.backends.cuda.matmul.allow_tf32 = True
            print(f"  GPU: {self.device_name} (CUDA)")
        elif torch.backends.mps.is_available():
            self.device = "mps"
            self.device_name = "Apple Silicon (MPS)"
            # MPS optimizations for macOS
            os.environ["PYTORCH_MPS_HIGH_WATERMARK_RATIO"] = "0.0"
            # Enable MPS fallback for unsupported ops
            os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "1"
            print(f"  GPU: {self.device_name}")
        else:
            self.device = "cpu"
            self.device_name = "CPU"
            # CPU optimizations
            torch.set_num_threads(os.cpu_count())
            print(f"  Device: CPU ({os.cpu_count()} threads)")

    def _apply_optimizations(self):
        """Apply global performance optimizations."""
        import torch

        # Disable gradient computation for inference
        torch.set_grad_enabled(False)

        # Set inference mode
        self.inference_mode = torch.inference_mode

        # Memory optimizations
        if self.device == "cuda":
            torch.cuda.empty_cache()

    def optimize_model(self, model, warmup_input=None):
        """Optimize model for faster inference."""
        import torch

        if model is None:
            return model

        # Try torch.compile for PyTorch 2.0+
        if hasattr(torch, 'compile') and self.device in ["cuda", "cpu"]:
            try:
                # Note: torch.compile doesn't support MPS yet
                model = torch.compile(model, mode="reduce-overhead")
                print("    Model optimized with torch.compile()")
            except Exception as e:
                print(f"    torch.compile not available: {e}")

        # Warmup pass
        if warmup_input is not None:
            try:
                with self.inference_mode():
                    _ = model(warmup_input)
                print("    Model warmed up")
            except:
                pass

        return model

    def get_optimal_batch_size(self) -> int:
        """Determine optimal batch size based on available memory."""
        if self.device == "cuda":
            import torch
            total_mem = torch.cuda.get_device_properties(0).total_memory
            # Use ~70% of available memory
            if total_mem > 16 * 1024**3:  # 16GB+
                return 4
            elif total_mem > 8 * 1024**3:  # 8GB+
                return 2
        return 1


# =============================================================================
# History Management
# =============================================================================

class HistoryManager:
    """Manages voice cloning session history."""

    def __init__(self, history_dir: Path = HISTORY_DIR):
        self.history_dir = Path(history_dir)
        self.index_file = self.history_dir / "index.json"
        self._ensure_dirs()

    def _ensure_dirs(self):
        """Create necessary directories."""
        self.history_dir.mkdir(parents=True, exist_ok=True)

    def _load_index(self) -> Dict:
        """Load history index."""
        if self.index_file.exists():
            with open(self.index_file) as f:
                return json.load(f)
        return {"sessions": [], "latest_voice": None}

    def _save_index(self, index: Dict):
        """Save history index."""
        with open(self.index_file, 'w') as f:
            json.dump(index, f, indent=2, ensure_ascii=False, default=str)

    def create_session(self, source_lang: str, reference_path: Path) -> Path:
        """Create a new session directory with timestamp."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        session_id = f"{timestamp}_{source_lang}"
        session_dir = self.history_dir / session_id

        session_dir.mkdir(parents=True, exist_ok=True)

        # Copy reference audio to session
        session_ref = session_dir / "reference.wav"
        shutil.copy(reference_path, session_ref)

        # Update index
        index = self._load_index()
        index["sessions"].append({
            "id": session_id,
            "timestamp": timestamp,
            "source_lang": source_lang,
            "reference": str(session_ref),
            "translations": {}
        })
        index["latest_voice"] = str(session_ref)
        self._save_index(index)

        # Also save as latest voice
        latest = self.history_dir.parent / "latest_voice.wav"
        shutil.copy(reference_path, latest)

        return session_dir

    def add_translation(self, session_dir: Path, lang: str, audio_path: Path,
                        text: str, similarity: float):
        """Add translation result to session."""
        index = self._load_index()
        session_id = session_dir.name

        for session in index["sessions"]:
            if session["id"] == session_id:
                session["translations"][lang] = {
                    "path": str(audio_path),
                    "text": text,
                    "similarity": similarity,
                    "timestamp": datetime.now().isoformat()
                }
                break

        self._save_index(index)

    def get_latest_voice(self) -> Optional[Path]:
        """Get the most recent cloned voice."""
        index = self._load_index()

        # First check for latest_voice in index
        if index.get("latest_voice") and Path(index["latest_voice"]).exists():
            return Path(index["latest_voice"])

        # Fallback: check latest_voice.wav
        latest = self.history_dir.parent / "latest_voice.wav"
        if latest.exists():
            return latest

        # Last resort: find most recent session
        if index["sessions"]:
            latest_session = index["sessions"][-1]
            ref_path = Path(latest_session["reference"])
            if ref_path.exists():
                return ref_path

        return None

    def get_recent_sessions(self, limit: int = 10) -> List[Dict]:
        """Get recent sessions."""
        index = self._load_index()
        return index["sessions"][-limit:][::-1]

    def clear_history(self):
        """Clear all history."""
        if self.history_dir.exists():
            shutil.rmtree(self.history_dir)
        self._ensure_dirs()
        self._save_index({"sessions": [], "latest_voice": None})
        print("  History cleared!")

    def list_history(self):
        """Print history summary."""
        sessions = self.get_recent_sessions(20)

        if not sessions:
            print("\n  No history found.")
            return

        print("\n  Voice Cloning History")
        print("  " + "=" * 60)

        for session in sessions:
            timestamp = session["timestamp"]
            source = session["source_lang"]
            translations = session.get("translations", {})
            langs = ", ".join(translations.keys()) if translations else "none"

            print(f"\n  [{timestamp}] Source: {source}")
            print(f"    Translations: {langs}")

            if translations:
                for lang, data in translations.items():
                    sim = data.get("similarity", 0) * 100
                    print(f"      - {lang}: {sim:.1f}% similarity")


# =============================================================================
# Voice Analysis (Optimized)
# =============================================================================

class VoiceAnalyzer:
    """Optimized voice analysis."""

    @staticmethod
    def analyze(audio_path: str, detailed: bool = False) -> Dict[str, Any]:
        """Fast voice analysis."""
        audio, sr = librosa.load(audio_path, sr=22050)

        result = {}

        # Pitch analysis
        f0, voiced, _ = librosa.pyin(audio, fmin=50, fmax=500, sr=sr)
        f0_valid = f0[~np.isnan(f0)]

        if len(f0_valid) > 0:
            result['pitch'] = {
                'mean_hz': float(np.mean(f0_valid)),
                'std_hz': float(np.std(f0_valid)),
            }
        else:
            result['pitch'] = {'mean_hz': 0, 'std_hz': 0}

        # Voice type
        pitch_mean = result['pitch']['mean_hz']
        if pitch_mean > 200:
            result['voice_type'] = "High (female/child)"
        elif pitch_mean > 140:
            result['voice_type'] = "Medium"
        else:
            result['voice_type'] = "Low (male)"

        # Spectral
        centroid = librosa.feature.spectral_centroid(y=audio, sr=sr)[0]
        result['spectral'] = {'centroid_mean_hz': float(np.mean(centroid))}

        # MFCC for comparison
        if detailed:
            mfccs = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=13)
            result['mfcc'] = {
                'coefficients': [float(np.mean(mfccs[i])) for i in range(13)]
            }

        result['duration_seconds'] = float(len(audio) / sr)

        # Legacy fields
        result['pitch_hz'] = result['pitch']['mean_hz']
        result['pitch_std'] = result['pitch']['std_hz']
        result['brightness'] = result['spectral']['centroid_mean_hz']
        result['duration'] = result['duration_seconds']

        return result

    @staticmethod
    def compare(original_path: str, cloned_path: str) -> Dict[str, Any]:
        """Compare voice similarity."""
        orig = VoiceAnalyzer.analyze(original_path, detailed=True)
        clone = VoiceAnalyzer.analyze(cloned_path, detailed=True)

        # Pitch similarity
        if orig['pitch']['mean_hz'] > 0 and clone['pitch']['mean_hz'] > 0:
            pitch_diff = abs(orig['pitch']['mean_hz'] - clone['pitch']['mean_hz'])
            pitch_sim = max(0, 1 - pitch_diff / orig['pitch']['mean_hz'])
        else:
            pitch_sim = 0

        # Brightness similarity
        bright_diff = abs(orig['spectral']['centroid_mean_hz'] -
                          clone['spectral']['centroid_mean_hz'])
        bright_sim = max(0, 1 - bright_diff / max(orig['spectral']['centroid_mean_hz'], 1))

        # MFCC similarity
        if 'mfcc' in orig and 'mfcc' in clone:
            orig_mfcc = np.array(orig['mfcc']['coefficients'])
            clone_mfcc = np.array(clone['mfcc']['coefficients'])
            dot = np.dot(orig_mfcc, clone_mfcc)
            norm = np.linalg.norm(orig_mfcc) * np.linalg.norm(clone_mfcc) + 1e-10
            mfcc_sim = float((dot / norm + 1) / 2)
        else:
            mfcc_sim = 0.5

        overall = (pitch_sim * 0.3 + bright_sim * 0.3 + mfcc_sim * 0.4)

        return {
            'pitch_similarity': pitch_sim,
            'brightness_similarity': bright_sim,
            'mfcc_similarity': mfcc_sim,
            'overall': overall
        }


# =============================================================================
# Voice Cloning Engine (Optimized)
# =============================================================================

class ChatterboxVoiceCloner:
    """Optimized Chatterbox TTS voice cloning engine."""

    MULTILINGUAL_LANGUAGES = {
        'ar', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi',
        'it', 'ja', 'ko', 'ms', 'nl', 'no', 'pl', 'pt', 'ru', 'sv',
        'sw', 'tr', 'zh'
    }

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        """Singleton pattern for model caching."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self.model = None
        self.model_multilingual = None
        self.loaded = False
        self.loaded_multilingual = False
        self.multilingual_available = None
        self.optimizer = PerformanceOptimizer()
        self.device = self.optimizer.device
        self._generation_lock = threading.Lock()

    def _check_multilingual(self) -> bool:
        """Check if multilingual is available."""
        if self.multilingual_available is not None:
            return self.multilingual_available
        try:
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS
            self.multilingual_available = True
        except ImportError:
            self.multilingual_available = False
        return self.multilingual_available

    def load(self, multilingual: bool = False):
        """Load model with optimizations."""
        import torch

        if multilingual and not self._check_multilingual():
            print("  Note: Multilingual not available, using standard model")
            multilingual = False

        # Patch torch.load for device mapping
        original_load = torch.load
        def patched_load(*args, **kwargs):
            kwargs.setdefault('map_location', self.device)
            kwargs.setdefault('weights_only', False)
            return original_load(*args, **kwargs)
        torch.load = patched_load

        try:
            if multilingual:
                if self.loaded_multilingual:
                    return
                print(f"\n  Loading Chatterbox Multilingual on {self.device}...")
                from chatterbox.mtl_tts import ChatterboxMultilingualTTS
                self.model_multilingual = ChatterboxMultilingualTTS.from_pretrained(
                    device=self.device
                )
                self.loaded_multilingual = True
                print("  Multilingual model loaded!")
            else:
                if self.loaded:
                    return
                print(f"\n  Loading Chatterbox on {self.device}...")
                from chatterbox.tts import ChatterboxTTS
                self.model = ChatterboxTTS.from_pretrained(device=self.device)
                self.loaded = True
                print("  Model loaded!")
        finally:
            torch.load = original_load

    def clone(self, reference_path: str, text: str, output_path: str,
              language: str = 'en', exaggeration: float = 0.5,
              cfg_weight: float = 0.5, **kwargs) -> str:
        """Clone voice with thread safety."""
        import torchaudio

        use_multilingual = (
            language in self.MULTILINGUAL_LANGUAGES and
            language != 'en' and
            self._check_multilingual()
        )

        # Thread-safe generation
        with self._generation_lock:
            if use_multilingual:
                self.load(multilingual=True)
                effective_cfg = 0.0 if language != 'en' else cfg_weight

                wav = self.model_multilingual.generate(
                    text=text,
                    audio_prompt_path=reference_path,
                    language_id=language,
                    exaggeration=exaggeration,
                    cfg_weight=effective_cfg
                )
                torchaudio.save(output_path, wav, self.model_multilingual.sr)
            else:
                self.load(multilingual=False)
                wav = self.model.generate(
                    text=text,
                    audio_prompt_path=reference_path,
                    exaggeration=exaggeration,
                    cfg_weight=cfg_weight
                )
                torchaudio.save(output_path, wav, self.model.sr)

        return output_path

    @property
    def name(self) -> str:
        return "Chatterbox TTS"


class XTTSVoiceCloner:
    """XTTS-v2 voice cloning engine."""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self.tts = None
        self.loaded = False
        self._generation_lock = threading.Lock()

    def load(self):
        if self.loaded:
            return
        print("\n  Loading XTTS-v2...")
        try:
            from TTS.api import TTS
            self.tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2",
                           progress_bar=False)
            self.loaded = True
            print("  XTTS-v2 loaded!")
        except ImportError:
            raise ImportError("XTTS not installed. pip install TTS>=0.22.0")

    def clone(self, reference_path: str, text: str, output_path: str,
              language: str = 'en', **kwargs) -> str:
        with self._generation_lock:
            self.load()
            self.tts.tts_to_file(
                text=text,
                speaker_wav=reference_path,
                language=language,
                file_path=output_path
            )
        return output_path

    @property
    def name(self) -> str:
        return "XTTS-v2"


def get_cloner(engine: Engine):
    """Get voice cloner instance (singleton)."""
    if engine == Engine.CHATTERBOX:
        return ChatterboxVoiceCloner()
    return XTTSVoiceCloner()


# =============================================================================
# Audio Recording & Processing
# =============================================================================

def record_voice(duration: float = 10, sample_rate: int = 22050,
                 phrase: Optional[str] = None) -> np.ndarray:
    """Record voice with optional reference phrase."""
    if phrase:
        print(f"\n  Please read this phrase:")
        print(f"  \"{phrase}\"")
        print()

    print(f"  Recording {duration} seconds...")
    print("  Speak clearly in your natural voice!\n")

    for i in range(3, 0, -1):
        print(f"    {i}...")
        time.sleep(1)

    print("    >>> RECORDING <<<")

    audio = sd.rec(int(duration * sample_rate), samplerate=sample_rate,
                   channels=1, dtype='float32')
    sd.wait()

    print("    Done!\n")

    audio = audio.flatten()
    audio = audio / (np.abs(audio).max() + 1e-6) * 0.95

    return audio


def transcribe(audio_path: str, language: Optional[str] = None) -> Dict[str, str]:
    """Transcribe audio with Whisper."""
    import whisper

    print("  Transcribing...")
    model = whisper.load_model('base')

    opts = {'language': language} if language else {}
    result = model.transcribe(audio_path, **opts)

    detected_lang = language or result.get('language', 'en')
    text = result['text'].strip()

    print(f"    Language: {detected_lang}")
    print(f"    Text: \"{text[:80]}{'...' if len(text) > 80 else ''}\"")

    return {'text': text, 'language': detected_lang}


def translate(text: str, source_lang: str, target_lang: str) -> str:
    """Translate text."""
    if source_lang == target_lang:
        return text
    try:
        from deep_translator import GoogleTranslator
        return GoogleTranslator(source=source_lang, target=target_lang).translate(text)
    except Exception as e:
        print(f"    Translation error: {e}")
        return text


def play_audio(path: str, label: str = ""):
    """Play audio file."""
    if label:
        print(f"  Playing: {label}")
    subprocess.run(['afplay', str(path)], check=True)


# =============================================================================
# Parallel Processing
# =============================================================================

def process_language(args: Tuple) -> Dict[str, Any]:
    """Process a single language (for parallel execution)."""
    (reference_path, target_lang, translated_text, output_path,
     config, cloner) = args

    lang_name = SUPPORTED_LANGUAGES.get(target_lang, target_lang)

    start_time = time.time()

    try:
        cloner.clone(
            str(reference_path),
            translated_text,
            str(output_path),
            language=target_lang,
            exaggeration=config.exaggeration,
            cfg_weight=config.cfg_weight
        )
        clone_time = time.time() - start_time

        # Analyze similarity
        comparison = VoiceAnalyzer.compare(str(reference_path), str(output_path))

        return {
            'success': True,
            'lang': target_lang,
            'lang_name': lang_name,
            'translated_text': translated_text,
            'output_path': str(output_path),
            'clone_time': clone_time,
            'similarity': comparison
        }
    except Exception as e:
        return {
            'success': False,
            'lang': target_lang,
            'error': str(e)
        }


# =============================================================================
# Main Pipeline
# =============================================================================

def run_voice_cloning(
    reference_path: Path,
    config: CloningConfig,
    provided_text: Optional[str] = None,
    history_manager: Optional[HistoryManager] = None
) -> Optional[Dict[str, Any]]:
    """Run optimized voice cloning pipeline."""

    output_dir = Path(config.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Initialize performance optimizer
    optimizer = PerformanceOptimizer()

    # Initialize cloner
    cloner = get_cloner(config.engine)

    # Analyze original voice
    print("\n" + "=" * 60)
    print("  ANALYZING VOICE")
    print("=" * 60)

    voice_info = VoiceAnalyzer.analyze(str(reference_path))
    print(f"    Pitch: {voice_info['pitch_hz']:.1f} Hz | Type: {voice_info['voice_type']}")

    # Get text
    if provided_text:
        original_text = provided_text
        source_lang = config.source_language or 'en'
        print(f"    Using provided text ({source_lang})")
    else:
        print("\n" + "=" * 60)
        print("  TRANSCRIBING")
        print("=" * 60)
        transcription = transcribe(str(reference_path), config.source_language)
        original_text = transcription['text']
        source_lang = config.source_language or transcription['language']

    if not original_text:
        print("  ERROR: No speech detected!")
        return None

    # Create history session
    session_dir = None
    if history_manager:
        session_dir = history_manager.create_session(source_lang, reference_path)
        print(f"\n  Session: {session_dir.name}")

    # Prepare translations
    print("\n" + "=" * 60)
    print("  TRANSLATING & CLONING")
    print("=" * 60)

    translations = {}
    for lang in config.target_languages:
        if lang not in SUPPORTED_LANGUAGES:
            continue
        translations[lang] = translate(original_text, source_lang, lang)

    # Prepare tasks
    tasks = []
    for lang, translated_text in translations.items():
        if session_dir:
            output_path = session_dir / f"cloned_{lang}.wav"
        else:
            output_path = output_dir / f"cloned_{lang}.wav"

        tasks.append((
            reference_path, lang, translated_text, output_path,
            config, cloner
        ))

    # Process languages
    results = {'translations': {}}
    total_start = time.time()

    if config.parallel and len(tasks) > 1:
        print(f"\n  Processing {len(tasks)} languages in parallel...")

        # Note: Due to model locking, parallelism is limited
        # but translations can be prepared in parallel
        with ThreadPoolExecutor(max_workers=config.max_workers) as executor:
            futures = {executor.submit(process_language, task): task[1]
                       for task in tasks}

            for future in as_completed(futures):
                lang = futures[future]
                result = future.result()

                if result['success']:
                    print(f"    [{lang.upper()}] {result['similarity']['overall']*100:.1f}% "
                          f"in {result['clone_time']:.1f}s")
                    results['translations'][lang] = result

                    if history_manager and session_dir:
                        history_manager.add_translation(
                            session_dir, lang,
                            Path(result['output_path']),
                            result['translated_text'],
                            result['similarity']['overall']
                        )
                else:
                    print(f"    [{lang.upper()}] FAILED: {result['error']}")
    else:
        # Sequential processing
        for task in tasks:
            lang = task[1]
            lang_name = SUPPORTED_LANGUAGES.get(lang, lang)
            print(f"\n  [{lang.upper()}] {lang_name}...")

            result = process_language(task)

            if result['success']:
                print(f"    Similarity: {result['similarity']['overall']*100:.1f}% "
                      f"| Time: {result['clone_time']:.1f}s")
                results['translations'][lang] = result

                if history_manager and session_dir:
                    history_manager.add_translation(
                        session_dir, lang,
                        Path(result['output_path']),
                        result['translated_text'],
                        result['similarity']['overall']
                    )
            else:
                print(f"    FAILED: {result['error']}")

    total_time = time.time() - total_start

    # Build results
    results['reference'] = {
        'path': str(reference_path),
        'text': original_text,
        'language': source_lang,
        'voice': voice_info
    }
    results['engine'] = config.engine.value
    results['settings'] = {
        'exaggeration': config.exaggeration,
        'cfg_weight': config.cfg_weight
    }
    results['total_time'] = total_time
    results['session_dir'] = str(session_dir) if session_dir else None

    return results


def print_summary(results: Dict[str, Any]):
    """Print results summary."""
    print("\n" + "#" * 60)
    print("#  RESULTS SUMMARY")
    print("#" * 60)

    ref = results['reference']
    print(f"""
  Engine: {results.get('engine', 'unknown').upper()}
  Voice: {ref['voice']['voice_type']} ({ref['voice']['pitch_hz']:.0f} Hz)
  Source: {ref['language']}
  Total time: {results.get('total_time', 0):.1f}s
    """)

    print("  Translations:")
    for lang, data in results.get('translations', {}).items():
        if data.get('success', True):
            sim = data['similarity']['overall'] * 100
            t = data['clone_time']
            print(f"    {lang.upper()}: {sim:.1f}% similarity ({t:.1f}s)")

    if results.get('session_dir'):
        print(f"\n  Session saved: {results['session_dir']}")


def playback_results(results: Dict[str, Any]):
    """Play back results."""
    print("\n" + "#" * 60)
    print("#  PLAYBACK")
    print("#" * 60)

    ref = results['reference']
    print("\n  [ORIGINAL]")
    play_audio(ref['path'])

    for lang, data in results.get('translations', {}).items():
        if data.get('success', True):
            time.sleep(0.5)
            sim = data['similarity']['overall'] * 100
            print(f"\n  [{lang.upper()}] {sim:.1f}% similarity")
            play_audio(data['output_path'])

    print("\n  Playback complete!")


# =============================================================================
# CLI
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Voice Cloning Test - Optimized",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""
Examples:
  # Record and clone to multiple languages (parallel)
  python voice_cloning_test.py --record 10 --targets fr,es,de,it

  # Use reference phrase for consistent recording
  python voice_cloning_test.py -r 10 -t en,es --phrase "Bonjour, ceci est un test"

  # Use most recent voice (no recording)
  python voice_cloning_test.py --targets en,es --text "Hello world"

  # Show history
  python voice_cloning_test.py --list-history

  # Clear history
  python voice_cloning_test.py --clear-history

Supported languages: {', '.join(SUPPORTED_LANGUAGES.keys())}
"""
    )

    # Engine
    parser.add_argument('--engine', '-E', default='chatterbox',
                        choices=['chatterbox', 'xtts'])

    # Audio input
    parser.add_argument('--record', '-r', type=float, default=0,
                        help='Record N seconds')
    parser.add_argument('--input', '-i', type=str, help='Input audio file')
    parser.add_argument('--phrase', type=str,
                        help='Reference phrase to read during recording')

    # Languages
    parser.add_argument('--targets', '-t', type=str, default='fr',
                        help='Target languages (comma-separated)')
    parser.add_argument('--source-lang', '-s', type=str)
    parser.add_argument('--text', type=str,
                        help='Text to synthesize (skip transcription)')

    # Chatterbox parameters
    parser.add_argument('--exaggeration', '-e', type=float, default=0.5)
    parser.add_argument('--cfg', '-c', type=float, default=0.5)

    # Performance
    parser.add_argument('--parallel', action='store_true', default=True,
                        help='Process languages in parallel')
    parser.add_argument('--no-parallel', dest='parallel', action='store_false')
    parser.add_argument('--workers', type=int, default=2,
                        help='Max parallel workers')

    # Output
    parser.add_argument('--output-dir', '-o', type=str, default=str(OUTPUT_DIR))
    parser.add_argument('--play', '-p', action='store_true', default=True)
    parser.add_argument('--no-play', dest='play', action='store_false')

    # History
    parser.add_argument('--list-history', action='store_true',
                        help='List session history')
    parser.add_argument('--clear-history', action='store_true',
                        help='Clear all history')
    parser.add_argument('--no-history', action='store_true',
                        help='Do not save to history')

    # Utility
    parser.add_argument('--list-languages', '-L', action='store_true')

    args = parser.parse_args()

    # Initialize history manager
    history_manager = HistoryManager(HISTORY_DIR)

    # Handle special commands
    if args.list_languages:
        print("\nSupported Languages:")
        for code, name in sorted(SUPPORTED_LANGUAGES.items()):
            print(f"  {code:4s}  {name}")
        return

    if args.list_history:
        history_manager.list_history()
        return

    if args.clear_history:
        history_manager.clear_history()
        return

    # Build config
    config = CloningConfig(
        engine=Engine.CHATTERBOX if args.engine == 'chatterbox' else Engine.XTTS,
        exaggeration=args.exaggeration,
        cfg_weight=args.cfg,
        target_languages=[l.strip() for l in args.targets.split(',')],
        source_language=args.source_lang,
        play_results=args.play,
        output_dir=Path(args.output_dir),
        parallel=args.parallel,
        max_workers=args.workers
    )

    config.output_dir.mkdir(parents=True, exist_ok=True)

    print("\n" + "#" * 60)
    print("#  VOICE CLONING TEST (Optimized)")
    print(f"#  Engine: {config.engine.value.upper()}")
    print("#" * 60)

    # Get reference audio
    reference_path = None

    if args.input:
        reference_path = Path(args.input)
        print(f"\n  Using input: {reference_path}")
    elif args.record > 0:
        print("\n" + "=" * 60)
        print("  RECORDING")
        print("=" * 60)

        # Get reference phrase
        phrase = args.phrase
        if not phrase and args.source_lang in DEFAULT_PHRASES:
            phrase = DEFAULT_PHRASES[args.source_lang]

        audio = record_voice(args.record, phrase=phrase)
        reference_path = config.output_dir / "original_voice.wav"
        sf.write(str(reference_path), audio, 22050)
        print(f"  Saved: {reference_path}")

        # Save as latest voice
        latest = config.output_dir / "latest_voice.wav"
        sf.write(str(latest), audio, 22050)
    else:
        # Try to use latest voice
        latest_voice = history_manager.get_latest_voice()
        if latest_voice:
            reference_path = latest_voice
            print(f"\n  Using latest voice: {reference_path}")
        else:
            print("\n  ERROR: No input provided and no recent voice found.")
            print("  Use --record N or --input FILE")
            return

    if not reference_path or not reference_path.exists():
        print(f"\n  ERROR: Reference not found: {reference_path}")
        return

    # Print config
    print(f"\n  Targets: {', '.join(config.target_languages)}")
    print(f"  Parallel: {config.parallel} ({config.max_workers} workers)")
    if config.engine == Engine.CHATTERBOX:
        print(f"  Exaggeration: {config.exaggeration} | CFG: {config.cfg_weight}")

    # Run cloning
    hm = None if args.no_history else history_manager
    results = run_voice_cloning(
        reference_path, config,
        provided_text=args.text,
        history_manager=hm
    )

    if results:
        print_summary(results)

        # Save results JSON
        results_file = config.output_dir / "results.json"
        with open(results_file, 'w') as f:
            # Convert for JSON serialization
            json_results = {
                'engine': results['engine'],
                'reference': {
                    'path': results['reference']['path'],
                    'text': results['reference']['text'],
                    'language': results['reference']['language'],
                    'pitch_hz': results['reference']['voice']['pitch_hz']
                },
                'settings': results['settings'],
                'total_time': results.get('total_time', 0),
                'translations': {
                    lang: {
                        'text': data['translated_text'],
                        'path': data['output_path'],
                        'similarity': data['similarity']['overall'],
                        'time': data['clone_time']
                    }
                    for lang, data in results.get('translations', {}).items()
                    if data.get('success', True)
                }
            }
            json.dump(json_results, f, indent=2, ensure_ascii=False)

        if config.play_results:
            playback_results(results)

    print("\n" + "=" * 60)
    print("  COMPLETE!")
    print("=" * 60)


if __name__ == "__main__":
    main()
