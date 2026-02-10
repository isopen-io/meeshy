"""
Voice Clone Multi-Speaker Module
Gère la détection et le traitement des audios multi-locuteurs.

Fonctionnalités:
- Préparation de contexte pour traduction multi-voix
- Validation de mise à jour de profil utilisateur
- Nettoyage de profils temporaires

Architecture: Extrait depuis VoiceCloneService (~200 lignes)
"""

import os
import logging
from typing import Optional, List, Tuple
from pathlib import Path

from .voice_metadata import (
    MultiSpeakerTranslationContext,
    TemporaryVoiceProfile,
    VoiceModel
)
from .voice_analyzer import get_voice_analyzer

logger = logging.getLogger(__name__)


class VoiceCloneMultiSpeaker:
    """
    Service de gestion des audios multi-locuteurs pour le clonage vocal.

    Responsabilités:
    - Analyser et extraire les voix multiples d'un audio
    - Créer des profils temporaires par locuteur
    - Identifier l'utilisateur parmi les locuteurs
    - Valider les mises à jour de profils
    - Nettoyer les ressources temporaires
    """

    def __init__(self, voice_clone_service):
        """
        Initialise le service multi-speaker.

        Args:
            voice_clone_service: Instance de VoiceCloneService parent
        """
        self.voice_clone_service = voice_clone_service

    async def prepare_multi_speaker_translation(
        self,
        audio_path: str,
        user_id: str,
        temp_dir: str
    ) -> MultiSpeakerTranslationContext:
        """
        Prépare le contexte pour une traduction audio multi-locuteurs.

        Cette méthode:
        1. Analyse l'audio pour détecter tous les locuteurs
        2. Extrait l'audio de chaque locuteur séparément
        3. Crée des profils temporaires (non cachés)
        4. Si l'utilisateur a un profil existant, identifie sa voix

        Args:
            audio_path: Chemin vers l'audio source
            user_id: ID de l'utilisateur émetteur
            temp_dir: Répertoire pour les fichiers temporaires

        Returns:
            MultiSpeakerTranslationContext avec tous les profils prêts
        """
        logger.info(f"[VOICE_CLONE_MULTI] 🎭 Préparation traduction multi-voix: {audio_path}")

        voice_analyzer = get_voice_analyzer()

        # 1. Extraire l'audio de chaque locuteur
        speakers_audio = await voice_analyzer.extract_all_speakers_audio(
            audio_path,
            temp_dir,
            min_segment_duration_ms=100
        )

        if not speakers_audio:
            raise ValueError("Aucun locuteur détecté dans l'audio")

        # 2. Récupérer le profil utilisateur existant (si disponible)
        user_model = await self.voice_clone_service._get_cache_manager().load_cached_model(user_id)
        user_fingerprint = user_model.fingerprint if user_model else None

        # 3. Créer les profils temporaires
        profiles: List[TemporaryVoiceProfile] = []
        user_profile: Optional[TemporaryVoiceProfile] = None

        # Récupérer la durée totale via audio processor
        total_duration_ms = await self.voice_clone_service._audio_processor.get_audio_duration_ms(audio_path)

        for speaker_id, (speaker_audio_path, speaker_info) in speakers_audio.items():
            # Extraire l'embedding temporaire via audio processor
            temp_embedding = await self.voice_clone_service._audio_processor.extract_voice_embedding(
                speaker_audio_path,
                Path(temp_dir)
            )

            profile = TemporaryVoiceProfile(
                speaker_id=speaker_id,
                speaker_info=speaker_info,
                audio_path=speaker_audio_path,
                embedding=temp_embedding,
                original_segments=speaker_info.segments
            )

            # Vérifier si ce locuteur correspond à l'utilisateur
            if user_fingerprint and speaker_info.fingerprint:
                similarity = user_fingerprint.similarity_score(speaker_info.fingerprint)
                if similarity >= 0.75:
                    profile.matched_user_id = user_id
                    profile.is_user_match = True
                    user_profile = profile
                    logger.info(
                        f"[VOICE_CLONE_MULTI] 🎯 Utilisateur {user_id} identifié: "
                        f"{speaker_id} (similarité: {similarity:.0%})"
                    )

            profiles.append(profile)

        # 4. Créer le contexte
        context = MultiSpeakerTranslationContext(
            source_audio_path=audio_path,
            source_duration_ms=total_duration_ms,
            speaker_count=len(profiles),
            profiles=profiles,
            user_profile=user_profile
        )

        logger.info(
            f"[VOICE_CLONE_MULTI] ✅ Contexte multi-voix prêt: "
            f"{len(profiles)} locuteurs, utilisateur identifié: {user_profile is not None}"
        )

        return context

    async def should_update_user_profile(
        self,
        user_id: str,
        audio_path: str
    ) -> Tuple[bool, str]:
        """
        Détermine si le profil utilisateur doit être mis à jour avec cet audio.

        Règles:
        - Création: Un seul locuteur principal (>70% du temps de parole)
        - Mise à jour: Signature vocale doit correspondre au profil existant (>80%)

        Args:
            user_id: ID de l'utilisateur
            audio_path: Chemin vers l'audio

        Returns:
            Tuple[bool, str]: (doit mettre à jour, raison)
        """
        voice_analyzer = get_voice_analyzer()

        # Analyser l'audio
        metadata = await voice_analyzer.analyze_audio(audio_path)

        # Charger le profil existant
        existing_model = await self.voice_clone_service._get_cache_manager().load_cached_model(user_id)

        if existing_model and existing_model.fingerprint:
            # Vérifier si on peut METTRE À JOUR
            can_update, reason, _ = voice_analyzer.can_update_user_profile(
                metadata,
                existing_model.fingerprint,
                similarity_threshold=0.80
            )
            if can_update:
                return True, f"Mise à jour possible: {reason}"
            else:
                return False, f"Mise à jour impossible: {reason}"
        else:
            # Vérifier si on peut CRÉER
            can_create, reason = voice_analyzer.can_create_user_profile(metadata)
            if can_create:
                return True, f"Création possible: {reason}"
            else:
                return False, f"Création impossible: {reason}"

    async def cleanup_temp_profiles(self, context: MultiSpeakerTranslationContext):
        """
        Nettoie les fichiers temporaires d'une traduction multi-voix.

        Args:
            context: Contexte de traduction à nettoyer
        """
        for profile in context.profiles:
            try:
                if os.path.exists(profile.audio_path):
                    os.remove(profile.audio_path)
                    logger.debug(f"[VOICE_CLONE_MULTI] Nettoyage: {profile.audio_path}")
            except Exception as e:
                logger.warning(f"[VOICE_CLONE_MULTI] Erreur nettoyage {profile.audio_path}: {e}")


def get_voice_clone_multi_speaker(voice_clone_service) -> VoiceCloneMultiSpeaker:
    """
    Factory function pour créer une instance de VoiceCloneMultiSpeaker.

    Args:
        voice_clone_service: Instance de VoiceCloneService parent

    Returns:
        Instance de VoiceCloneMultiSpeaker
    """
    return VoiceCloneMultiSpeaker(voice_clone_service)
