"""
Models - Définitions des modèles TTS et leurs métadonnées
==========================================================

Types et enums pour les modèles TTS supportés.
"""

from typing import Optional, Dict
from dataclasses import dataclass
from enum import Enum


class TTSModel(str, Enum):
    """Modèles TTS disponibles"""
    CHATTERBOX = "chatterbox"           # Recommandé - Apache 2.0 (FALLBACK par défaut)
    CHATTERBOX_TURBO = "chatterbox-turbo"  # Plus rapide, 350M params
    HIGGS_AUDIO_V2 = "higgs-audio-v2"   # État de l'art - Licence limitée
    XTTS_V2 = "xtts-v2"                 # Legacy - Non-commercial
    MMS = "mms"                         # Meta MMS - 1100+ langues (sans clonage vocal)
    VITS = "vits"                       # VITS générique - Langues africaines spécifiques

    @classmethod
    def get_default(cls) -> 'TTSModel':
        """Retourne le modèle par défaut (et fallback)"""
        return cls.CHATTERBOX

    @classmethod
    def get_fallback(cls) -> 'TTSModel':
        """Retourne le modèle de fallback"""
        return cls.CHATTERBOX

    @classmethod
    def get_african_fallback(cls) -> 'TTSModel':
        """Retourne le modèle de fallback pour langues africaines"""
        return cls.MMS

    @classmethod
    def get_vits_languages(cls) -> set:
        """Retourne les langues supportées par VITS custom (ex: Lingala)"""
        return {'ln'}  # Lingala via DigitalUmuganda/lingala_vits_tts


@dataclass
class TTSModelInfo:
    """Informations sur un modèle TTS"""
    name: str
    display_name: str
    license: str
    commercial_use: bool
    license_warning: Optional[str]
    languages: list
    min_audio_seconds: float
    quality_score: int  # 1-100
    speed_score: int    # 1-100
    vram_gb: float
    # Identifiants HuggingFace pour vérification locale
    hf_model_id: Optional[str] = None
    model_size_gb: float = 0.0  # Taille approximative du modèle


# Informations sur les modèles
TTS_MODEL_INFO: Dict[TTSModel, TTSModelInfo] = {
    TTSModel.CHATTERBOX: TTSModelInfo(
        name="chatterbox",
        display_name="Chatterbox (Resemble AI)",
        license="Apache 2.0",
        commercial_use=True,
        license_warning=None,
        languages=["en", "es", "fr", "de", "it", "pt", "pl", "tr", "ru", "nl", "cs", "ar", "zh", "ja", "hu", "ko", "hi"],
        min_audio_seconds=3.0,
        quality_score=95,
        speed_score=85,
        vram_gb=4.0,
        hf_model_id="ResembleAI/chatterbox",
        model_size_gb=3.5
    ),
    TTSModel.CHATTERBOX_TURBO: TTSModelInfo(
        name="chatterbox-turbo",
        display_name="Chatterbox Turbo (Resemble AI)",
        license="Apache 2.0",
        commercial_use=True,
        license_warning=None,
        languages=["en", "es", "fr", "de", "it", "pt", "pl", "tr", "ru", "nl", "cs", "ar", "zh", "ja", "hu", "ko", "hi"],
        min_audio_seconds=3.0,
        quality_score=90,
        speed_score=95,
        vram_gb=2.0,
        hf_model_id="ResembleAI/chatterbox-turbo",
        model_size_gb=1.5
    ),
    TTSModel.HIGGS_AUDIO_V2: TTSModelInfo(
        name="higgs-audio-v2",
        display_name="Higgs Audio V2 (Boson AI)",
        license="Boson Higgs Audio 2 Community License",
        commercial_use=False,
        license_warning=(
            "⚠️ ALERTE LICENCE HIGGS AUDIO V2 ⚠️\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "La licence 'Boson Higgs Audio 2 Community License' autorise:\n"
            "  ✅ Usage commercial si < 100,000 utilisateurs actifs annuels\n"
            "  ❌ Au-delà de 100k users → licence commerciale OBLIGATOIRE\n"
            "\n"
            "Si vous prévoyez de dépasser ce seuil, contactez Boson AI:\n"
            "  📧 https://www.boson.ai/contact\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        ),
        languages=[
            "en", "es", "fr", "de", "it", "pt", "ru", "zh", "ja", "ko", "ar",
            "hi", "bn", "pa", "ta", "te", "mr", "gu", "kn", "ml", "or",
            "pl", "nl", "sv", "da", "no", "fi", "cs", "sk", "hu", "ro",
            "bg", "uk", "el", "tr", "he", "th", "vi", "id", "ms", "tl",
            "sw", "am", "yo", "ig", "ha", "zu", "af", "fa", "ur"
        ],
        min_audio_seconds=3.0,
        quality_score=98,
        speed_score=75,
        vram_gb=8.0,
        hf_model_id="bosonai/higgs-audio-v2-generation-3B-base",
        model_size_gb=6.0
    ),
    TTSModel.XTTS_V2: TTSModelInfo(
        name="xtts-v2",
        display_name="XTTS v2 (Coqui - Legacy)",
        license="Coqui Public Model License",
        commercial_use=False,
        license_warning=(
            "⚠️ ALERTE LICENCE XTTS V2 ⚠️\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "XTTS v2 utilise la 'Coqui Public Model License' qui:\n"
            "  ❌ INTERDIT tout usage commercial\n"
            "  ✅ Autorise uniquement usage personnel/recherche\n"
            "\n"
            "Pour un usage commercial, utilisez Chatterbox (Apache 2.0).\n"
            "Note: Coqui a fermé en 2024, ce modèle n'est plus maintenu.\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        ),
        languages=["en", "es", "fr", "de", "it", "pt", "pl", "tr", "ru", "nl", "cs", "ar", "zh", "ja", "hu", "ko"],
        min_audio_seconds=6.0,
        quality_score=75,
        speed_score=70,
        vram_gb=4.0,
        hf_model_id=None,  # XTTS utilise son propre système de téléchargement
        model_size_gb=3.0
    ),
    TTSModel.MMS: TTSModelInfo(
        name="mms",
        display_name="Meta MMS TTS (1100+ langues)",
        license="CC-BY-NC 4.0",
        commercial_use=False,
        license_warning=(
            "⚠️ ALERTE LICENCE MMS TTS ⚠️\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "Meta MMS utilise la licence CC-BY-NC 4.0:\n"
            "  ❌ Usage commercial INTERDIT sans accord\n"
            "  ✅ Usage recherche/personnel autorisé\n"
            "  ⚠️ Pas de clonage vocal - voix synthétique par défaut\n"
            "\n"
            "Pour un usage commercial, contactez Meta AI.\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        ),
        languages=[
            # Langues africaines avec MMS TTS vérifié disponible
            "am", "sw", "yo", "ha", "rw", "rn", "sn", "lg", "om", "ti",
            "ny", "ee", "ff", "mg", "so", "ts", "bem", "ybb",
            # Langues européennes/asiatiques (fallback)
            "en", "fr", "es", "de", "pt", "it", "ru", "ar", "hi", "bn",
            "ta", "te", "th", "vi", "id", "ms", "ja", "ko", "zh"
        ],
        min_audio_seconds=0.0,  # MMS n'a pas besoin d'audio de référence
        quality_score=70,
        speed_score=90,
        vram_gb=1.0,
        hf_model_id="facebook/mms-tts",
        model_size_gb=0.5  # Modèles MMS sont légers (téléchargés à la demande)
    ),
    TTSModel.VITS: TTSModelInfo(
        name="vits",
        display_name="VITS Custom (Langues spécifiques)",
        license="Apache 2.0 / MIT (selon modèle)",
        commercial_use=True,
        license_warning=None,
        languages=[
            "ln",  # Lingala (DigitalUmuganda/lingala_vits_tts)
            # Ajouter d'autres langues VITS ici quand disponibles
        ],
        min_audio_seconds=0.0,  # VITS n'a pas besoin d'audio de référence
        quality_score=80,
        speed_score=85,
        vram_gb=1.0,
        hf_model_id="vits-custom",  # Variable selon la langue
        model_size_gb=0.3  # Modèles VITS sont relativement légers
    ),
}
