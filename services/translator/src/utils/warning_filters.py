"""
Filtrage centralisé des warnings non-critiques
==============================================

Ce module supprime les warnings cosmétiques et dépréciations
qui polluent les logs sans impacter le fonctionnement.

À importer AU DÉBUT du main pour effet global.
"""

import warnings
import logging
import os

logger = logging.getLogger(__name__)


def configure_warning_filters():
    """
    Configure les filtres pour supprimer les warnings non-critiques.

    À appeler au démarrage de l'application (dans main.py).
    """

    # ═══════════════════════════════════════════════════════════
    # 1. LIBROSA - FutureWarnings sur audioread
    # ═══════════════════════════════════════════════════════════
    warnings.filterwarnings(
        "ignore",
        category=FutureWarning,
        module="librosa.core.audio",
        message=".*__audioread_load.*"
    )

    # ═══════════════════════════════════════════════════════════
    # 2. CHATTERBOX/LIBROSA - PySoundFile fallback
    # ═══════════════════════════════════════════════════════════
    warnings.filterwarnings(
        "ignore",
        category=UserWarning,
        message="PySoundFile failed.*"
    )

    # ═══════════════════════════════════════════════════════════
    # 3. PYTORCH - CUDA/SDPA deprecated warnings
    # ═══════════════════════════════════════════════════════════
    warnings.filterwarnings(
        "ignore",
        category=FutureWarning,
        module="contextlib",
        message=".*torch.backends.cuda.sdp_kernel.*"
    )

    # ═══════════════════════════════════════════════════════════
    # 4. TRANSFORMERS - Generation warnings
    # ═══════════════════════════════════════════════════════════
    warnings.filterwarnings(
        "ignore",
        category=UserWarning,
        module="transformers.generation.configuration_utils",
        message=".*return_dict_in_generate.*"
    )

    warnings.filterwarnings(
        "ignore",
        category=UserWarning,
        message=".*scaled_dot_product_attention.*"
    )

    warnings.filterwarnings(
        "ignore",
        category=UserWarning,
        message=".*past_key_values.*tuple.*"
    )

    # ═══════════════════════════════════════════════════════════
    # 5. LLAMA - SDPA Attention warnings
    # ═══════════════════════════════════════════════════════════
    warnings.filterwarnings(
        "ignore",
        category=UserWarning,
        message=".*LlamaSdpaAttention.*"
    )

    # ═══════════════════════════════════════════════════════════
    # 6. TORCH - General deprecation warnings
    # ═══════════════════════════════════════════════════════════
    warnings.filterwarnings(
        "ignore",
        category=FutureWarning,
        message=".*torch.*"
    )

    logger.info("✅ [WARNING_FILTERS] Filtres de warnings configurés")
    logger.debug("[WARNING_FILTERS] Warnings supprimés: librosa, torch, transformers, chatterbox")


def configure_for_production():
    """
    Configuration stricte pour la production.
    Supprime TOUS les warnings sauf les erreurs critiques.
    """
    warnings.filterwarnings("ignore")
    logger.info("⚠️  [WARNING_FILTERS] Mode production - tous warnings supprimés")


def configure_for_development():
    """
    Configuration pour le développement.
    Affiche les warnings importants mais filtre le bruit.
    """
    configure_warning_filters()
    logger.info("🔧 [WARNING_FILTERS] Mode développement - warnings ciblés supprimés")
