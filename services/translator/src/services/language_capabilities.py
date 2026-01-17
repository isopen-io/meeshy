"""
Language Capabilities Service
=============================
Centralizes all language support information for Meeshy.

This service defines:
- Which languages can be transcribed (STT - Speech-to-Text)
- Which languages can be synthesized (TTS - Text-to-Speech)
- Which engine to use for each language
- Proper error messages when a capability is not available

African Languages Support:
- Lingala (ln), Swahili (sw), Yoruba (yo), Hausa (ha), Igbo (ig)
- Zulu (zu), Xhosa (xh), Amharic (am)
- Cameroonian: Basaa (bas), Bafia (ksf), Ngiemboon (nnh)
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Set
import logging

logger = logging.getLogger(__name__)


class TTSEngine(Enum):
    """Available TTS engines"""
    CHATTERBOX = "chatterbox"      # Best quality, ~23 languages
    XTTS = "xtts"                  # XTTS-v2, ~17 languages
    MMS = "mms"                    # Meta MMS, 1100+ languages (no voice cloning)
    NONE = "none"                  # No TTS available


class STTEngine(Enum):
    """Available STT engines"""
    WHISPER = "whisper"            # OpenAI Whisper, ~100 languages
    MMS_ASR = "mms_asr"            # Meta MMS ASR, 1100+ languages
    NONE = "none"                  # No STT available


@dataclass
class LanguageCapability:
    """Defines capabilities for a specific language"""
    code: str                      # ISO 639-1/3 code
    name: str                      # Human-readable name
    native_name: str               # Name in native script

    # TTS capabilities
    tts_supported: bool = False
    tts_engine: TTSEngine = TTSEngine.NONE
    tts_voice_cloning: bool = False  # Can clone voice (MMS cannot)

    # STT capabilities
    stt_supported: bool = False
    stt_engine: STTEngine = STTEngine.NONE

    # Translation capabilities
    translation_supported: bool = True  # Most languages supported by Google/DeepL

    # MMS specific codes (ISO 639-3)
    mms_tts_code: Optional[str] = None
    mms_asr_code: Optional[str] = None

    # Additional info
    region: str = ""               # Geographic region
    notes: str = ""                # Special notes


class LanguageCapabilityError(Exception):
    """Exception for language capability errors"""
    def __init__(self, message: str, code: str, capability: str,
                 available_alternatives: Optional[List[str]] = None):
        self.message = message
        self.code = code
        self.capability = capability
        self.available_alternatives = available_alternatives or []
        super().__init__(self.message)

    def to_dict(self) -> dict:
        return {
            "error": "LANGUAGE_CAPABILITY_ERROR",
            "message": self.message,
            "language_code": self.code,
            "capability": self.capability,
            "available_alternatives": self.available_alternatives
        }


class LanguageCapabilitiesService:
    """
    Centralized service for language capabilities management.

    Usage:
        service = LanguageCapabilitiesService()

        # Check if language can be transcribed
        if service.can_transcribe("ln"):
            engine = service.get_stt_engine("ln")

        # Check if language can be synthesized
        if service.can_synthesize("ln"):
            engine = service.get_tts_engine("ln")

        # Get detailed error if not supported
        try:
            service.require_tts("xyz")
        except LanguageCapabilityError as e:
            return {"error": e.to_dict()}
    """

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._capabilities: Dict[str, LanguageCapability] = {}
        self._init_capabilities()

    def _init_capabilities(self):
        """Initialize all language capabilities"""

        # =====================================================================
        # European Languages (Chatterbox/XTTS + Whisper)
        # =====================================================================
        self._add_european_languages()

        # =====================================================================
        # Asian Languages
        # =====================================================================
        self._add_asian_languages()

        # =====================================================================
        # African Languages (MMS TTS + MMS ASR or Whisper)
        # =====================================================================
        self._add_african_languages()

        logger.info(f"[LanguageCapabilities] Initialized {len(self._capabilities)} languages")

    def _add_european_languages(self):
        """Add European language capabilities"""
        european = [
            # Code, Name, Native, TTS Engine, Voice Clone, STT Engine
            ("en", "English", "English", TTSEngine.CHATTERBOX, True, STTEngine.WHISPER),
            ("fr", "French", "Français", TTSEngine.CHATTERBOX, True, STTEngine.WHISPER),
            ("es", "Spanish", "Español", TTSEngine.CHATTERBOX, True, STTEngine.WHISPER),
            ("de", "German", "Deutsch", TTSEngine.CHATTERBOX, True, STTEngine.WHISPER),
            ("it", "Italian", "Italiano", TTSEngine.CHATTERBOX, True, STTEngine.WHISPER),
            ("pt", "Portuguese", "Português", TTSEngine.CHATTERBOX, True, STTEngine.WHISPER),
            ("nl", "Dutch", "Nederlands", TTSEngine.CHATTERBOX, True, STTEngine.WHISPER),
            ("pl", "Polish", "Polski", TTSEngine.CHATTERBOX, True, STTEngine.WHISPER),
            ("ru", "Russian", "Русский", TTSEngine.CHATTERBOX, True, STTEngine.WHISPER),
            ("uk", "Ukrainian", "Українська", TTSEngine.MMS, False, STTEngine.WHISPER),
            ("cs", "Czech", "Čeština", TTSEngine.CHATTERBOX, True, STTEngine.WHISPER),
            ("ro", "Romanian", "Română", TTSEngine.MMS, False, STTEngine.WHISPER),
            ("hu", "Hungarian", "Magyar", TTSEngine.CHATTERBOX, True, STTEngine.WHISPER),
            ("bg", "Bulgarian", "Български", TTSEngine.MMS, False, STTEngine.WHISPER),
            ("hr", "Croatian", "Hrvatski", TTSEngine.MMS, False, STTEngine.WHISPER),
            ("sk", "Slovak", "Slovenčina", TTSEngine.MMS, False, STTEngine.WHISPER),
            ("sl", "Slovenian", "Slovenščina", TTSEngine.MMS, False, STTEngine.WHISPER),
            ("el", "Greek", "Ελληνικά", TTSEngine.CHATTERBOX, True, STTEngine.WHISPER),
            ("tr", "Turkish", "Türkçe", TTSEngine.CHATTERBOX, True, STTEngine.WHISPER),
            ("sv", "Swedish", "Svenska", TTSEngine.CHATTERBOX, True, STTEngine.WHISPER),
            ("da", "Danish", "Dansk", TTSEngine.CHATTERBOX, True, STTEngine.WHISPER),
            ("fi", "Finnish", "Suomi", TTSEngine.CHATTERBOX, True, STTEngine.WHISPER),
            ("no", "Norwegian", "Norsk", TTSEngine.CHATTERBOX, True, STTEngine.WHISPER),
            ("lt", "Lithuanian", "Lietuvių", TTSEngine.MMS, False, STTEngine.WHISPER),
            ("hy", "Armenian", "Հdelays", TTSEngine.MMS, False, STTEngine.WHISPER),
        ]

        # MMS codes for European languages that use MMS TTS
        european_mms_codes = {
            "uk": "ukr",  # Ukrainian
            "ro": "ron",  # Romanian
            "bg": "bul",  # Bulgarian
            "hr": "hrv",  # Croatian
            "sk": "slk",  # Slovak
            "sl": "slv",  # Slovenian
            "lt": "lit",  # Lithuanian
            "hy": "hye",  # Armenian
        }

        for code, name, native, tts_engine, voice_clone, stt_engine in european:
            mms_code = european_mms_codes.get(code)
            self._capabilities[code] = LanguageCapability(
                code=code,
                name=name,
                native_name=native,
                tts_supported=True,
                tts_engine=tts_engine,
                tts_voice_cloning=voice_clone,
                stt_supported=True,
                stt_engine=stt_engine,
                mms_tts_code=mms_code,
                mms_asr_code=mms_code,
                region="Europe"
            )

    def _add_asian_languages(self):
        """Add Asian language capabilities"""
        asian = [
            # Code, Name, Native, TTS Engine, Voice Clone, STT Engine, MMS TTS, MMS ASR
            ("ar", "Arabic", "العربية", TTSEngine.CHATTERBOX, True, STTEngine.WHISPER, "ara", "ara"),
            ("he", "Hebrew", "עברית", TTSEngine.CHATTERBOX, True, STTEngine.WHISPER, "heb", "heb"),
            ("fa", "Persian", "فارسی", TTSEngine.MMS, False, STTEngine.WHISPER, "pes", "pes"),
            ("hi", "Hindi", "हिन्दी", TTSEngine.CHATTERBOX, True, STTEngine.WHISPER, "hin", "hin"),
            ("bn", "Bengali", "বাংলা", TTSEngine.MMS, False, STTEngine.WHISPER, "ben", "ben"),
            ("ur", "Urdu", "اردو", TTSEngine.MMS, False, STTEngine.WHISPER, "urd", "urd"),
            ("ta", "Tamil", "தமிழ்", TTSEngine.MMS, False, STTEngine.WHISPER, "tam", "tam"),
            ("te", "Telugu", "తెలుగు", TTSEngine.MMS, False, STTEngine.WHISPER, "tel", "tel"),
            ("th", "Thai", "ไทย", TTSEngine.MMS, False, STTEngine.WHISPER, "tha", "tha"),
            ("vi", "Vietnamese", "Tiếng Việt", TTSEngine.MMS, False, STTEngine.WHISPER, "vie", "vie"),
            ("id", "Indonesian", "Bahasa Indonesia", TTSEngine.MMS, False, STTEngine.WHISPER, "ind", "ind"),
            ("ms", "Malay", "Bahasa Melayu", TTSEngine.CHATTERBOX, True, STTEngine.WHISPER, "zsm", "zsm"),
            ("ja", "Japanese", "日本語", TTSEngine.CHATTERBOX, True, STTEngine.WHISPER, "jpn", "jpn"),
            ("ko", "Korean", "한국어", TTSEngine.CHATTERBOX, True, STTEngine.WHISPER, "kor", "kor"),
            ("zh", "Chinese", "中文", TTSEngine.CHATTERBOX, True, STTEngine.WHISPER, "cmn", "cmn"),
        ]

        for entry in asian:
            code, name, native, tts_engine, voice_clone, stt_engine = entry[:6]
            mms_tts = entry[6] if len(entry) > 6 else None
            mms_asr = entry[7] if len(entry) > 7 else None

            self._capabilities[code] = LanguageCapability(
                code=code,
                name=name,
                native_name=native,
                tts_supported=True,
                tts_engine=tts_engine,
                tts_voice_cloning=voice_clone,
                stt_supported=True,
                stt_engine=stt_engine,
                mms_tts_code=mms_tts,
                mms_asr_code=mms_asr,
                region="Asia"
            )

    def _add_african_languages(self):
        """Add African language capabilities

        VERIFIED against dl.fbaipublicfiles.com/mms/tts/{code}.tar.gz on 2025-01
        Not all languages have MMS TTS models available.
        """

        # =====================================================================
        # Languages WITH MMS TTS support (verified available)
        # =====================================================================
        african_with_tts = [
            # Code, Name, Native, MMS TTS code, MMS ASR code, Has Whisper STT
            ("am", "Amharic", "አማርኛ", "amh", "amh", False),
            ("sw", "Swahili", "Kiswahili", "swh", "swh", True),  # Whisper supports Swahili
            ("yo", "Yoruba", "Yorùbá", "yor", "yor", False),
            ("ha", "Hausa", "Hausa", "hau", "hau", False),
            ("rw", "Kinyarwanda", "Ikinyarwanda", "kin", "kin", False),
            ("rn", "Kirundi", "Ikirundi", "run", "run", False),
            ("sn", "Shona", "chiShona", "sna", "sna", False),
            ("lg", "Luganda", "Luganda", "lug", "lug", False),
            ("om", "Oromo", "Afaan Oromoo", "orm", "orm", False),
            ("ti", "Tigrinya", "ትግርኛ", "tir", "tir", False),
            ("ny", "Chichewa", "Chinyanja", "nya", "nya", False),
            ("ee", "Ewe", "Eʋegbe", "ewe", "ewe", False),
            ("ff", "Fula", "Fulfulde", "ful", "ful", False),
            ("mg", "Malagasy", "Malagasy", "mlg", "mlg", False),
            ("so", "Somali", "Soomaali", "som", "som", False),
            ("ts", "Tsonga", "Xitsonga", "tso", "tso", False),
            ("bem", "Bemba", "Ichibemba", "bem", "bem", False),
            ("ybb", "Yemba", "Yemba", "ybb", "ybb", False),
        ]

        for code, name, native, mms_tts, mms_asr, has_whisper in african_with_tts:
            stt_engine = STTEngine.WHISPER if has_whisper else STTEngine.MMS_ASR

            self._capabilities[code] = LanguageCapability(
                code=code,
                name=name,
                native_name=native,
                tts_supported=True,
                tts_engine=TTSEngine.MMS,
                tts_voice_cloning=False,  # MMS doesn't support voice cloning
                stt_supported=True,
                stt_engine=stt_engine,
                mms_tts_code=mms_tts,
                mms_asr_code=mms_asr,
                region="Africa",
                notes="MMS TTS verified available"
            )

        # =====================================================================
        # Languages WITHOUT MMS TTS support (HTTP 403 - not available)
        # These can still be transcribed via MMS ASR or Whisper, and translated
        # =====================================================================
        african_no_tts = [
            # Code, Name, Native, MMS ASR code, Has Whisper STT
            ("ln", "Lingala", "Lingála", "lin", False),  # TTS NOT AVAILABLE
            ("ig", "Igbo", "Igbo", "ibo", False),        # TTS NOT AVAILABLE
            ("zu", "Zulu", "isiZulu", "zul", False),     # TTS NOT AVAILABLE
            ("xh", "Xhosa", "isiXhosa", "xho", False),   # TTS NOT AVAILABLE
            ("wo", "Wolof", "Wolof", "wol", False),      # TTS NOT AVAILABLE
            ("af", "Afrikaans", "Afrikaans", "afr", True),  # Whisper supports, MMS TTS not available
            ("tw", "Twi", "Twi", "twi", False),          # TTS NOT AVAILABLE
            ("nd", "Northern Ndebele", "isiNdebele", "nde", False),  # TTS NOT AVAILABLE
            ("nso", "Northern Sotho", "Sepedi", "nso", False),       # TTS NOT AVAILABLE
            ("st", "Southern Sotho", "Sesotho", "sot", False),       # TTS NOT AVAILABLE
            ("ss", "Swati", "siSwati", "ssw", False),                # TTS NOT AVAILABLE
            ("tn", "Tswana", "Setswana", "tsn", False),              # TTS NOT AVAILABLE
            ("ve", "Venda", "Tshivenda", "ven", False),              # TTS NOT AVAILABLE
        ]

        for code, name, native, mms_asr, has_whisper in african_no_tts:
            stt_engine = STTEngine.WHISPER if has_whisper else STTEngine.MMS_ASR

            self._capabilities[code] = LanguageCapability(
                code=code,
                name=name,
                native_name=native,
                tts_supported=False,  # TTS NOT AVAILABLE
                tts_engine=TTSEngine.NONE,
                tts_voice_cloning=False,
                stt_supported=True,  # STT may still work via MMS ASR
                stt_engine=stt_engine,
                mms_tts_code=None,  # No TTS model
                mms_asr_code=mms_asr,
                region="Africa",
                notes="TTS not available - transcription and translation only"
            )

        # =====================================================================
        # Cameroonian languages (TTS NOT available - HTTP 403)
        # =====================================================================
        cameroonian = [
            ("bas", "Basaa", "Basaa", "bas"),
            ("ksf", "Bafia", "Rikpa", "ksf"),
            ("nnh", "Ngiemboon", "Ngiemboon", "nnh"),
            ("dua", "Duala", "Duala", "dua"),
            ("bum", "Bulu", "Bulu", "bum"),
            ("ewo", "Ewondo", "Ewondo", "ewo"),
        ]

        for code, name, native, mms_code in cameroonian:
            self._capabilities[code] = LanguageCapability(
                code=code,
                name=name,
                native_name=native,
                tts_supported=False,  # TTS NOT AVAILABLE
                tts_engine=TTSEngine.NONE,
                tts_voice_cloning=False,
                stt_supported=True,  # ASR may work
                stt_engine=STTEngine.MMS_ASR,
                mms_tts_code=None,
                mms_asr_code=mms_code,
                region="Africa (Cameroon)",
                notes="TTS not available - transcription and translation only"
            )

    # =========================================================================
    # Public API
    # =========================================================================

    def get_capability(self, code: str) -> Optional[LanguageCapability]:
        """Get full capability info for a language"""
        return self._capabilities.get(code.lower())

    def can_transcribe(self, code: str) -> bool:
        """Check if a language can be transcribed (STT)"""
        cap = self.get_capability(code)
        return cap is not None and cap.stt_supported

    def can_synthesize(self, code: str) -> bool:
        """Check if a language can be synthesized (TTS)"""
        cap = self.get_capability(code)
        return cap is not None and cap.tts_supported

    def can_clone_voice(self, code: str) -> bool:
        """Check if voice cloning is available for a language"""
        cap = self.get_capability(code)
        return cap is not None and cap.tts_voice_cloning

    def can_translate(self, code: str) -> bool:
        """Check if translation is available for a language"""
        cap = self.get_capability(code)
        return cap is not None and cap.translation_supported

    def get_tts_engine(self, code: str) -> TTSEngine:
        """Get the TTS engine for a language"""
        cap = self.get_capability(code)
        return cap.tts_engine if cap else TTSEngine.NONE

    def get_stt_engine(self, code: str) -> STTEngine:
        """Get the STT engine for a language"""
        cap = self.get_capability(code)
        return cap.stt_engine if cap else STTEngine.NONE

    def get_mms_tts_code(self, code: str) -> Optional[str]:
        """Get MMS TTS language code (ISO 639-3)"""
        cap = self.get_capability(code)
        return cap.mms_tts_code if cap else None

    def get_mms_asr_code(self, code: str) -> Optional[str]:
        """Get MMS ASR language code (ISO 639-3)"""
        cap = self.get_capability(code)
        return cap.mms_asr_code if cap else None

    def requires_mms_tts(self, code: str) -> bool:
        """Check if a language requires MMS for TTS"""
        cap = self.get_capability(code)
        return cap is not None and cap.tts_engine == TTSEngine.MMS

    def requires_mms_asr(self, code: str) -> bool:
        """Check if a language requires MMS for ASR/STT"""
        cap = self.get_capability(code)
        return cap is not None and cap.stt_engine == STTEngine.MMS_ASR

    # =========================================================================
    # Requirement methods (raise exceptions if not supported)
    # =========================================================================

    def require_stt(self, code: str) -> LanguageCapability:
        """
        Require STT support for a language, raise error if not available.

        Raises:
            LanguageCapabilityError: If STT is not supported
        """
        cap = self.get_capability(code)

        if cap is None:
            raise LanguageCapabilityError(
                message=f"Language '{code}' is not recognized",
                code=code,
                capability="stt",
                available_alternatives=self.get_similar_languages(code)
            )

        if not cap.stt_supported:
            # Find similar languages with STT
            similar_with_stt = [
                c for c, cap in self._capabilities.items()
                if cap.stt_supported and cap.region == cap.region
            ][:5]

            raise LanguageCapabilityError(
                message=f"Speech-to-text (transcription) is not available for {cap.name} ({code}). "
                        f"This language can only be synthesized (TTS), not transcribed.",
                code=code,
                capability="stt",
                available_alternatives=similar_with_stt
            )

        return cap

    def require_tts(self, code: str) -> LanguageCapability:
        """
        Require TTS support for a language, raise error if not available.

        Raises:
            LanguageCapabilityError: If TTS is not supported
        """
        cap = self.get_capability(code)

        if cap is None:
            raise LanguageCapabilityError(
                message=f"Language '{code}' is not recognized",
                code=code,
                capability="tts",
                available_alternatives=self.get_similar_languages(code)
            )

        if not cap.tts_supported:
            raise LanguageCapabilityError(
                message=f"Text-to-speech (synthesis) is not available for {cap.name} ({code})",
                code=code,
                capability="tts",
                available_alternatives=[]
            )

        return cap

    def require_voice_cloning(self, code: str) -> LanguageCapability:
        """
        Require voice cloning support for a language.

        Raises:
            LanguageCapabilityError: If voice cloning is not supported
        """
        cap = self.require_tts(code)  # First check TTS

        if not cap.tts_voice_cloning:
            # Find languages with voice cloning in same region
            cloning_languages = [
                f"{c} ({self._capabilities[c].name})"
                for c, cap in self._capabilities.items()
                if cap.tts_voice_cloning
            ][:10]

            raise LanguageCapabilityError(
                message=f"Voice cloning is not available for {cap.name} ({code}). "
                        f"This language uses MMS TTS which generates speech with a default voice. "
                        f"Voice cloning is only available for languages using Chatterbox or XTTS engines.",
                code=code,
                capability="voice_cloning",
                available_alternatives=cloning_languages
            )

        return cap

    # =========================================================================
    # Utility methods
    # =========================================================================

    def get_similar_languages(self, code: str, limit: int = 5) -> List[str]:
        """Find similar language codes"""
        code_lower = code.lower()
        similar = []

        for lang_code in self._capabilities.keys():
            if lang_code.startswith(code_lower[:2]):
                similar.append(lang_code)

        return similar[:limit]

    def get_all_languages(self) -> List[LanguageCapability]:
        """Get all language capabilities"""
        return list(self._capabilities.values())

    def get_languages_by_region(self, region: str) -> List[LanguageCapability]:
        """Get languages by region"""
        return [
            cap for cap in self._capabilities.values()
            if region.lower() in cap.region.lower()
        ]

    def get_languages_with_tts(self) -> List[str]:
        """Get all language codes with TTS support"""
        return [code for code, cap in self._capabilities.items() if cap.tts_supported]

    def get_languages_with_stt(self) -> List[str]:
        """Get all language codes with STT support"""
        return [code for code, cap in self._capabilities.items() if cap.stt_supported]

    def get_languages_with_voice_cloning(self) -> List[str]:
        """Get all language codes with voice cloning support"""
        return [code for code, cap in self._capabilities.items() if cap.tts_voice_cloning]

    def get_mms_only_languages(self) -> List[str]:
        """Get languages that require MMS (no Chatterbox/XTTS support)"""
        return [
            code for code, cap in self._capabilities.items()
            if cap.tts_engine == TTSEngine.MMS
        ]

    def get_stats(self) -> dict:
        """Get statistics about language support"""
        caps = list(self._capabilities.values())

        return {
            "total_languages": len(caps),
            "tts_supported": len([c for c in caps if c.tts_supported]),
            "stt_supported": len([c for c in caps if c.stt_supported]),
            "voice_cloning": len([c for c in caps if c.tts_voice_cloning]),
            "mms_tts": len([c for c in caps if c.tts_engine == TTSEngine.MMS]),
            "mms_asr": len([c for c in caps if c.stt_engine == STTEngine.MMS_ASR]),
            "regions": list(set(c.region for c in caps if c.region))
        }


# Singleton accessor
def get_language_capabilities() -> LanguageCapabilitiesService:
    """Get the singleton instance of LanguageCapabilitiesService"""
    return LanguageCapabilitiesService()
