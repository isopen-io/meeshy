"""
Module de création de modèles vocaux pour le clonage de voix.

Responsabilités:
- Récupérer ou créer un modèle vocal pour un utilisateur
- Créer depuis un profil Gateway existant
- Logique centrale de création d'embedding OpenVoice
- Validation et vérification de qualité

Architecture:
- Délégation vers VoiceCloneAudioProcessor pour traitement audio
- Délégation vers VoiceCloneCacheManager pour cache
- Délégation vers VoiceAnalyzer pour analyse vocale
"""

import os
import logging
import asyncio
# numpy remplace pickle pour la sécurité
import time
import uuid as uuid_module
from typing import List, Dict, Any, Optional
from pathlib import Path
from datetime import datetime, timedelta

import numpy as np

from .voice_metadata import VoiceModel, VoiceCharacteristics
from .voice_analyzer import get_voice_analyzer
from .voice_fingerprint import VoiceFingerprint
from utils.audio_format_converter import convert_to_wav_if_needed
from utils.voice_cache_guard import guard_voice_cache_id, voice_cache_user_dir

logger = logging.getLogger(__name__)


class VoiceCloneModelCreator:
    """
    Gestionnaire de création de modèles vocaux.

    Responsable de:
    - Création de nouveaux modèles vocaux depuis des audios
    - Conversion de profils Gateway en VoiceModel
    - Validation et vérification de qualité
    - Gestion du cycle de vie des modèles (création, amélioration)
    """

    # Configuration
    MIN_AUDIO_DURATION_MS = 10_000  # 10 secondes minimum
    VOICE_MODEL_MAX_AGE_DAYS_DEFAULT = 7  # 7 jours par défaut (production hebdomadaire)

    def __init__(
        self,
        audio_processor,
        cache_manager,
        voice_cache_dir: Path,
        max_age_days: Optional[int] = None
    ):
        """
        Initialise le créateur de modèles vocaux.

        Args:
            audio_processor: Instance de VoiceCloneAudioProcessor
            cache_manager: Instance de VoiceCloneCacheManager
            voice_cache_dir: Répertoire de cache des modèles
            max_age_days: Âge maximum d'un modèle avant recalibration (défaut: 7 jours)
        """
        self._audio_processor = audio_processor
        self._cache_manager = cache_manager
        self.voice_cache_dir = voice_cache_dir

        # Utiliser max_age_days si fourni, sinon lire depuis env, sinon 7 jours
        if max_age_days is not None:
            self.VOICE_MODEL_MAX_AGE_DAYS = max_age_days
        else:
            self.VOICE_MODEL_MAX_AGE_DAYS = int(
                os.getenv('VOICE_MODEL_MAX_AGE_DAYS', str(self.VOICE_MODEL_MAX_AGE_DAYS_DEFAULT))
            )

        logger.info(
            f"[MODEL_CREATOR] Initialisé: cache_dir={voice_cache_dir}, "
            f"max_age={self.VOICE_MODEL_MAX_AGE_DAYS}j"
        )

    async def get_or_create_voice_model(
        self,
        user_id: str,
        current_audio_path: Optional[str] = None,
        current_audio_duration_ms: int = 0
    ) -> VoiceModel:
        """
        Récupère ou crée un modèle de voix pour un utilisateur.

        Logique:
        1. Si modèle en cache et récent → utiliser
        2. Si modèle en cache mais ancien → améliorer avec nouvel audio
        3. Si pas de modèle et audio trop court → agréger historique
        4. Créer nouveau modèle

        Environnement:
        - Development: Recalcul forcé si audio actuel > 20 secondes
        - Production: Recalcul hebdomadaire (tous les 7 jours)

        Args:
            user_id: ID de l'utilisateur
            current_audio_path: Audio actuel pour le clonage (optionnel)
            current_audio_duration_ms: Durée de l'audio actuel

        Returns:
            VoiceModel prêt à l'emploi
        """
        user_id = guard_voice_cache_id(user_id)

        # Déterminer l'environnement
        environment = os.getenv('ENVIRONMENT', os.getenv('NODE_ENV', 'production')).lower()
        is_development = environment in ['development', 'dev']

        # Durée minimale pour recalcul en développement (20 secondes)
        dev_recalc_threshold_ms = 20_000

        # 1. Vérifier le cache
        cached_model = await self._cache_manager.load_cached_model(user_id)

        if cached_model:
            age_days = (datetime.now() - cached_model.updated_at).days

            # En développement: forcer le recalcul si audio actuel > 20s
            if is_development and current_audio_path and current_audio_duration_ms >= dev_recalc_threshold_ms:
                logger.info(
                    f"[MODEL_CREATOR] 🔄 Mode DEV: Recalcul forcé pour {user_id} "
                    f"(audio {current_audio_duration_ms}ms > {dev_recalc_threshold_ms}ms)"
                )
                return await self._improve_model(cached_model, current_audio_path)

            # Modèle récent → utiliser directement
            if age_days < self.VOICE_MODEL_MAX_AGE_DAYS:
                logger.info(
                    f"[MODEL_CREATOR] 📦 Modèle en cache pour {user_id} "
                    f"(age: {age_days}j)"
                )

                # Charger l'embedding si pas en mémoire
                if cached_model.embedding is None:
                    cached_model = await self._cache_manager.load_embedding(
                        cached_model
                    )

                return cached_model

            # Modèle ancien → améliorer si on a un nouvel audio
            if current_audio_path:
                logger.info(
                    f"[MODEL_CREATOR] 🔄 Modèle obsolète pour {user_id}, "
                    f"amélioration..."
                )
                return await self._improve_model(cached_model, current_audio_path)

            # Sinon utiliser l'ancien modèle
            logger.info(
                f"[MODEL_CREATOR] ⚠️ Modèle obsolète pour {user_id} "
                f"mais pas de nouvel audio"
            )
            if cached_model.embedding is None:
                cached_model = await self._cache_manager.load_embedding(
                    cached_model
                )
            return cached_model

        # 2. Pas de modèle → créer
        if not current_audio_path:
            # Essayer de récupérer l'historique audio
            audio_paths = await self._audio_processor.get_user_audio_history(
                user_id
            )
            if not audio_paths:
                raise ValueError(
                    f"Aucun audio disponible pour créer le modèle de voix "
                    f"de {user_id}"
                )
            current_audio_path = audio_paths[0]
            current_audio_duration_ms = await self._audio_processor.get_audio_duration_ms(
                current_audio_path
            )

        audio_paths = [current_audio_path]
        total_duration = current_audio_duration_ms

        # Si audio trop court, chercher l'historique
        if total_duration < self.MIN_AUDIO_DURATION_MS:
            logger.info(
                f"[MODEL_CREATOR] ⚠️ Audio trop court ({total_duration}ms), "
                f"agrégation historique..."
            )
            historical_audios = await self._audio_processor.get_user_audio_history(
                user_id, exclude=[current_audio_path]
            )
            audio_paths.extend(historical_audios)
            total_duration = await self._audio_processor.calculate_total_duration(
                audio_paths
            )

            logger.info(
                f"[MODEL_CREATOR] 📚 {len(audio_paths)} audios agrégés, "
                f"total: {total_duration}ms"
            )

        # Créer le modèle avec ce qu'on a
        return await self._create_voice_model(user_id, audio_paths, total_duration)

    async def create_voice_model_from_gateway_profile(
        self,
        profile_data: Dict[str, Any],
        user_id: str
    ) -> Optional[VoiceModel]:
        """
        Crée un VoiceModel à partir du profil vocal reçu de Gateway.

        Cette méthode permet à Gateway d'envoyer un profil vocal existant
        (par exemple celui de l'émetteur original d'un message transféré)
        sans que Translator ait besoin d'accéder à MongoDB.

        Args:
            profile_data: Données du profil vocal envoyées par Gateway:
                - profileId: str - ID unique du profil
                - userId: str - ID de l'utilisateur propriétaire du profil
                - embedding: str - Embedding Base64 encoded (numpy array)
                - qualityScore: float - Score de qualité 0-1
                - fingerprint: Dict - Empreinte vocale (optionnel)
                - voiceCharacteristics: Dict - Caractéristiques vocales (optionnel)
                - version: int - Version du profil
                - audioCount: int - Nombre d'audios agrégés
                - totalDurationMs: int - Durée totale des audios

            user_id: ID de l'utilisateur (pour logs)

        Returns:
            VoiceModel prêt à l'emploi, ou None si échec
        """
        if not profile_data:
            logger.warning(
                f"[MODEL_CREATOR] ⚠️ Pas de profil fourni par Gateway "
                f"pour {user_id}"
            )
            return None

        try:
            logger.info(
                f"[MODEL_CREATOR] 📦 Création VoiceModel depuis profil Gateway "
                f"pour {user_id}"
            )

            # Décoder l'embedding Base64
            import base64
            embedding_base64 = profile_data.get('embedding')
            if not embedding_base64:
                logger.error(
                    f"[MODEL_CREATOR] ❌ Embedding manquant dans le profil Gateway"
                )
                return None

            embedding_bytes = base64.b64decode(embedding_base64)
            embedding = np.frombuffer(embedding_bytes, dtype=np.float32)

            logger.info(
                f"[MODEL_CREATOR] ✅ Embedding décodé: shape={embedding.shape}"
            )

            # Créer les caractéristiques vocales si fournies
            voice_characteristics = None
            voice_chars_data = profile_data.get('voiceCharacteristics')
            if voice_chars_data:
                try:
                    voice_characteristics = VoiceCharacteristics(
                        pitch_mean_hz=voice_chars_data.get('pitch_mean_hz', 0),
                        pitch_std_hz=voice_chars_data.get('pitch_std_hz', 0),
                        pitch_range_hz=voice_chars_data.get('pitch_range_hz', (0, 0)),
                        estimated_gender=voice_chars_data.get('estimated_gender', 'unknown'),
                        speaking_rate_wpm=voice_chars_data.get('speaking_rate_wpm', 0),
                        spectral_centroid_hz=voice_chars_data.get('spectral_centroid_hz', 0),
                        spectral_bandwidth_hz=voice_chars_data.get('spectral_bandwidth_hz', 0),
                        energy_mean=voice_chars_data.get('energy_mean', 0),
                        energy_std=voice_chars_data.get('energy_std', 0),
                        mfcc_signature=voice_chars_data.get('mfcc_signature'),
                        formants_hz=voice_chars_data.get('formants_hz'),
                        jitter_percent=voice_chars_data.get('jitter_percent'),
                        shimmer_percent=voice_chars_data.get('shimmer_percent'),
                        confidence=voice_chars_data.get('confidence', 0.8)
                    )
                except Exception as e:
                    logger.warning(
                        f"[MODEL_CREATOR] ⚠️ Impossible de recréer "
                        f"VoiceCharacteristics: {e}"
                    )

            # Créer l'empreinte vocale si fournie
            fingerprint = None
            fingerprint_data = profile_data.get('fingerprint')
            if fingerprint_data:
                try:
                    fingerprint = VoiceFingerprint(
                        fingerprint_id=fingerprint_data.get('fingerprint_id', ''),
                        signature=fingerprint_data.get('signature', ''),
                        signature_short=fingerprint_data.get('signature_short', ''),
                        audio_duration_ms=fingerprint_data.get('audio_duration_ms', 0),
                        created_at=datetime.fromisoformat(
                            fingerprint_data.get(
                                'created_at',
                                datetime.now().isoformat()
                            )
                        )
                    )
                except Exception as e:
                    logger.warning(
                        f"[MODEL_CREATOR] ⚠️ Impossible de recréer "
                        f"VoiceFingerprint: {e}"
                    )

            # Créer un dossier temporaire pour l'embedding (nécessaire pour TTS)
            profile_user_id = guard_voice_cache_id(profile_data.get('userId') or user_id)
            profile_id = guard_voice_cache_id(
                profile_data.get('profileId') or f"vfp_{profile_user_id[:8]}"
            )
            user_dir = voice_cache_user_dir(self.voice_cache_dir, profile_user_id)
            user_dir.mkdir(parents=True, exist_ok=True)

            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            # SÉCURITÉ: .npy au lieu de .pkl (numpy safe vs pickle unsafe)
            embedding_filename = f"{profile_user_id}_{profile_id}_{timestamp}_gateway.npy"
            embedding_path = str(user_dir / embedding_filename)

            # Sauvegarder l'embedding de manière sécurisée avec NumPy
            # SÉCURITÉ: np.save est sûr, pickle.dump permet l'exécution de code arbitraire
            np.save(embedding_path, embedding)

            logger.info(
                f"[MODEL_CREATOR] 💾 Embedding sauvegardé: {embedding_path}"
            )

            # Créer le VoiceModel
            model = VoiceModel(
                user_id=profile_user_id,
                embedding_path=embedding_path,
                audio_count=profile_data.get('audioCount', 1),
                total_duration_ms=profile_data.get('totalDurationMs', 0),
                quality_score=profile_data.get('qualityScore', 0.8),
                profile_id=profile_id,
                version=profile_data.get('version', 1),
                created_at=datetime.now(),
                updated_at=datetime.now(),
                embedding=embedding,
                voice_characteristics=voice_characteristics,
                fingerprint=fingerprint
            )

            # ═══════════════════════════════════════════════════════════════
            # DÉSÉRIALISER LES CONDITIONALS CHATTERBOX SI DISPONIBLES
            # ═══════════════════════════════════════════════════════════════
            chatterbox_conditionals_base64 = profile_data.get('chatterbox_conditionals_base64')
            if chatterbox_conditionals_base64:
                try:
                    logger.info(
                        f"[MODEL_CREATOR] 🎤 Désérialisation conditionals Chatterbox..."
                    )

                    conditionals_bytes = base64.b64decode(chatterbox_conditionals_base64)
                    model.chatterbox_conditionals_bytes = conditionals_bytes

                    # Désérialiser les conditionals pour utilisation immédiate
                    # NOTE: Import local pour éviter dépendance circulaire
                    from ..tts.backends.chatterbox_backend import ChatterboxBackend

                    backend = ChatterboxBackend(device='cpu')
                    model.chatterbox_conditionals = await backend.deserialize_conditionals(
                        conditionals_bytes,
                        device='cpu'
                    )

                    logger.info(
                        f"[MODEL_CREATOR] ✅ Conditionals Chatterbox chargés: "
                        f"{len(conditionals_bytes)} bytes → objet désérialisé"
                    )
                except Exception as e:
                    logger.warning(
                        f"[MODEL_CREATOR] ⚠️ Impossible de charger conditionals Chatterbox: {e}"
                    )
                    import traceback
                    traceback.print_exc()

            # Référence audio si fournie
            reference_audio_id = profile_data.get('reference_audio_id')
            reference_audio_url = profile_data.get('reference_audio_url')
            if reference_audio_id:
                model.reference_audio_id = reference_audio_id
            if reference_audio_url:
                model.reference_audio_url = reference_audio_url

            logger.info(
                f"[MODEL_CREATOR] ✅ VoiceModel créé depuis Gateway: "
                f"user={profile_user_id}, quality={model.quality_score:.2f}, "
                f"profile_id={profile_id}, "
                f"conditionals={'YES' if model.chatterbox_conditionals else 'NO'}"
            )

            return model

        except Exception as e:
            logger.error(
                f"[MODEL_CREATOR] ❌ Erreur création VoiceModel depuis Gateway: {e}"
            )
            import traceback
            traceback.print_exc()
            return None

    async def _validate_audio_quality_for_cloning(
        self,
        audio_path: str
    ) -> Dict[str, Any]:
        """
        Valide la qualité audio avant clonage vocal.

        Vérifie:
        - SNR (Signal-to-Noise Ratio) estimé
        - Présence de clipping
        - Ratio de silence vs parole
        - Énergie moyenne

        Args:
            audio_path: Chemin vers le fichier audio

        Returns:
            Dict avec:
            - valid: bool - True si qualité suffisante pour clonage
            - snr_db: float - SNR estimé en dB
            - clipping_ratio: float - Ratio de samples écrêtés
            - silence_ratio: float - Ratio de silence dans l'audio
            - energy_db: float - Énergie moyenne en dB
            - warnings: List[str] - Avertissements de qualité
            - can_clone: bool - True si clonage recommandé
        """
        import soundfile as sf

        warnings = []
        result = {
            "valid": True,
            "snr_db": 0.0,
            "clipping_ratio": 0.0,
            "silence_ratio": 0.0,
            "energy_db": -60.0,
            "warnings": warnings,
            "can_clone": True
        }

        try:
            # Convertir en WAV si nécessaire (M4A, AAC non supportés par soundfile)
            wav_path = convert_to_wav_if_needed(audio_path)

            # Charger l'audio
            audio, sr = sf.read(wav_path)
            if len(audio.shape) > 1:
                audio = audio.mean(axis=1)  # Convertir en mono

            # 1. Calcul de l'énergie RMS
            rms = np.sqrt(np.mean(audio ** 2))
            energy_db = 20 * np.log10(max(rms, 1e-10))
            result["energy_db"] = float(energy_db)

            if energy_db < -40:
                warnings.append(f"Audio très faible ({energy_db:.1f}dB)")
                result["can_clone"] = False

            # 2. Détection de clipping (samples > 0.99)
            clipping_samples = np.sum(np.abs(audio) > 0.99)
            clipping_ratio = clipping_samples / len(audio)
            result["clipping_ratio"] = float(clipping_ratio)

            if clipping_ratio > 0.05:  # Plus de 5% de clipping
                warnings.append(f"Clipping excessif ({clipping_ratio*100:.1f}%)")
                result["can_clone"] = False
            elif clipping_ratio > 0.01:
                warnings.append(f"Clipping modéré ({clipping_ratio*100:.1f}%)")

            # 3. Détection des silences (RMS < -40dB par fenêtre)
            frame_length = int(0.025 * sr)  # 25ms
            hop_length = int(0.010 * sr)   # 10ms

            frames = []
            for i in range(0, len(audio) - frame_length, hop_length):
                frame_rms = np.sqrt(np.mean(audio[i:i+frame_length] ** 2))
                frames.append(frame_rms)

            if frames:
                frames = np.array(frames)
                silence_threshold = 10 ** (-40 / 20)  # -40dB
                silence_frames = np.sum(frames < silence_threshold)
                silence_ratio = silence_frames / len(frames)
                result["silence_ratio"] = float(silence_ratio)

                if silence_ratio > 0.7:  # Plus de 70% de silence
                    warnings.append(f"Trop de silence ({silence_ratio*100:.1f}%)")
                    result["can_clone"] = False

            # 4. Estimation du SNR (approximatif)
            # On utilise les percentiles d'énergie comme proxy
            if frames is not None and len(frames) > 0:
                speech_level = np.percentile(frames, 90)  # Niveau parole
                noise_level = np.percentile(frames, 10)   # Niveau bruit de fond

                if noise_level > 1e-10:
                    snr_db = 20 * np.log10(speech_level / noise_level)
                    result["snr_db"] = float(snr_db)

                    if snr_db < 10:  # SNR < 10dB est problématique
                        warnings.append(f"SNR faible ({snr_db:.1f}dB)")
                        result["can_clone"] = False
                    elif snr_db < 15:
                        warnings.append(f"SNR modéré ({snr_db:.1f}dB)")

            # 5. Verdict final
            result["valid"] = len([w for w in warnings if "excessif" in w or "Trop" in w or "SNR faible" in w]) == 0

            if warnings:
                logger.warning(
                    f"[MODEL_CREATOR] ⚠️ Qualité audio: {', '.join(warnings)}"
                )
            else:
                logger.info(
                    f"[MODEL_CREATOR] ✅ Qualité audio OK: "
                    f"SNR={result['snr_db']:.1f}dB, energy={result['energy_db']:.1f}dB"
                )

        except Exception as e:
            logger.warning(f"[MODEL_CREATOR] Validation audio échouée: {e}")
            result["warnings"].append(f"Erreur validation: {e}")
            result["valid"] = False
            result["can_clone"] = False

        return result

    async def _create_voice_model(
        self,
        user_id: str,
        audio_paths: List[str],
        total_duration_ms: int
    ) -> VoiceModel:
        """
        Crée un nouveau modèle de voix à partir des audios.

        IMPORTANT: Extrait uniquement les segments du locuteur principal
        pour garantir que le clonage ne concerne que sa voix.

        Args:
            user_id: ID de l'utilisateur
            audio_paths: Liste des chemins vers les fichiers audio
            total_duration_ms: Durée totale des audios

        Returns:
            VoiceModel nouvellement créé
        """
        user_dir = voice_cache_user_dir(self.voice_cache_dir, user_id)
        start_time = time.time()
        logger.info(
            f"[MODEL_CREATOR] 🎤 Création modèle pour {user_id} "
            f"({len(audio_paths)} audios)"
        )

        # Filtrer les audios valides
        valid_paths = [p for p in audio_paths if os.path.exists(p)]
        if not valid_paths:
            raise ValueError("Aucun fichier audio valide trouvé")

        # =====================================================================
        # VALIDATION QUALITÉ AUDIO AVANT CLONAGE
        # Vérifie SNR, clipping, silences pour garantir un clonage de qualité
        # =====================================================================
        audio_quality_issues = []
        for audio_path in valid_paths:
            quality_result = await self._validate_audio_quality_for_cloning(audio_path)
            if not quality_result["can_clone"]:
                audio_quality_issues.extend(quality_result["warnings"])

        if audio_quality_issues:
            logger.warning(
                f"[MODEL_CREATOR] ⚠️ Problèmes qualité détectés pour {user_id}: "
                f"{', '.join(set(audio_quality_issues))} - clonage peut être dégradé"
            )

        # Créer le dossier utilisateur: {voice_cache_dir}/{user_id}/
        user_dir.mkdir(parents=True, exist_ok=True)

        # =====================================================================
        # EXTRACTION DU LOCUTEUR PRINCIPAL UNIQUEMENT
        # Pour chaque audio, extraire uniquement les segments du locuteur principal
        # =====================================================================
        voice_analyzer = get_voice_analyzer()
        extracted_paths = []
        primary_voice_chars = None
        recording_metadata = None

        for audio_path in valid_paths:
            try:
                # Extraire uniquement les segments du locuteur principal
                extracted_path, metadata = await voice_analyzer.extract_primary_speaker_audio(
                    audio_path,
                    output_path=str(user_dir / f"primary_{os.path.basename(audio_path)}"),
                    min_segment_duration_ms=100
                )
                extracted_paths.append(extracted_path)

                # Conserver les caractéristiques vocales du premier locuteur principal
                if primary_voice_chars is None and metadata.primary_speaker:
                    primary_voice_chars = metadata.primary_speaker.voice_characteristics
                    recording_metadata = metadata
                    logger.info(
                        f"[MODEL_CREATOR] Locuteur principal détecté: "
                        f"gender={primary_voice_chars.estimated_gender}, "
                        f"pitch={primary_voice_chars.pitch_mean_hz:.1f}Hz"
                    )

            except Exception as e:
                logger.warning(
                    f"[MODEL_CREATOR] Erreur extraction locuteur principal: {e}"
                )
                # Fallback: utiliser l'audio complet
                extracted_paths.append(audio_path)

        # Recalculer la durée totale après extraction
        extracted_duration_ms = 0
        for path in extracted_paths:
            extracted_duration_ms += await self._audio_processor.get_audio_duration_ms(
                path
            )

        logger.info(
            f"[MODEL_CREATOR] Audio extrait: {extracted_duration_ms}ms "
            f"(original: {total_duration_ms}ms, {len(extracted_paths)} fichiers)"
        )

        # Concaténer les audios extraits si multiples
        if len(extracted_paths) > 1:
            combined_audio = await self._audio_processor.concatenate_audios(
                extracted_paths,
                output_dir=user_dir,
                user_id=user_id
            )
        else:
            combined_audio = extracted_paths[0]

        # Générer un profile_id unique
        profile_id = uuid_module.uuid4().hex[:12]
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")

        # Extraire l'embedding de voix (du locuteur principal uniquement)
        embedding = await self._audio_processor.extract_voice_embedding(
            combined_audio, user_dir
        )

        # Calculer score de qualité
        quality_score = self._audio_processor.calculate_quality_score(
            extracted_duration_ms, len(valid_paths)
        )

        # Chemin de l'embedding avec nouvelle convention
        # SÉCURITÉ: .npy au lieu de .pkl (numpy safe vs pickle unsafe)
        embedding_filename = f"{user_id}_{profile_id}_{timestamp}.npy"
        embedding_path = str(user_dir / embedding_filename)

        # Créer le modèle avec les caractéristiques vocales du locuteur principal
        model = VoiceModel(
            user_id=user_id,
            embedding_path=embedding_path,
            audio_count=len(valid_paths),
            total_duration_ms=extracted_duration_ms,  # Durée extraite
            quality_score=quality_score,
            profile_id=profile_id,
            version=1,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            next_recalibration_at=datetime.now() + timedelta(
                days=self.VOICE_MODEL_MAX_AGE_DAYS
            ),
            embedding=embedding,
            voice_characteristics=primary_voice_chars
        )

        # Générer l'empreinte vocale unique
        if model.voice_characteristics or model.embedding is not None:
            fingerprint = model.generate_fingerprint()
            if fingerprint:
                logger.info(
                    f"[MODEL_CREATOR] Empreinte vocale: "
                    f"{fingerprint.fingerprint_id}"
                )

        # Sauvegarder
        await self._cache_manager.save_model_to_cache(model)

        processing_time = int((time.time() - start_time) * 1000)
        logger.info(
            f"[MODEL_CREATOR] ✅ Modèle créé pour {user_id}: "
            f"quality={quality_score:.2f}, time={processing_time}ms"
        )

        return model

    async def _improve_model(
        self,
        existing_model: VoiceModel,
        new_audio_path: str,
        improvement_weight_old: float = 0.7,
        improvement_weight_new: float = 0.3
    ) -> VoiceModel:
        """
        Améliore un modèle existant avec un nouvel audio.

        RÈGLE: La mise à jour n'est effectuée QUE si la signature vocale
        du nouvel audio correspond au profil existant (similarité > 80%).

        Args:
            existing_model: Modèle vocal existant à améliorer
            new_audio_path: Chemin vers le nouvel audio
            improvement_weight_old: Poids de l'ancien embedding (défaut: 0.7)
            improvement_weight_new: Poids du nouveau embedding (défaut: 0.3)

        Returns:
            VoiceModel amélioré
        """
        user_dir = voice_cache_user_dir(self.voice_cache_dir, existing_model.user_id) / "temp"
        logger.info(
            f"[MODEL_CREATOR] 🔄 Vérification amélioration modèle pour "
            f"{existing_model.user_id}"
        )

        voice_analyzer = get_voice_analyzer()

        # Charger l'embedding existant si nécessaire
        if existing_model.embedding is None:
            existing_model = await self._cache_manager.load_embedding(existing_model)

        # Vérifier si la signature correspond avant mise à jour
        if existing_model.fingerprint:
            metadata = await voice_analyzer.analyze_audio(new_audio_path)
            can_update, reason, matched_speaker = voice_analyzer.can_update_user_profile(
                metadata,
                existing_model.fingerprint,
                similarity_threshold=0.80
            )

            if not can_update:
                logger.warning(
                    f"[MODEL_CREATOR] ⚠️ Mise à jour refusée pour "
                    f"{existing_model.user_id}: {reason}"
                )
                # Retourner le modèle existant sans modification
                return existing_model

            logger.info(f"[MODEL_CREATOR] ✅ Signature vocale vérifiée: {reason}")

        # Extraire embedding du nouvel audio
        user_dir.mkdir(parents=True, exist_ok=True)

        new_embedding = await self._audio_processor.extract_voice_embedding(
            new_audio_path, user_dir
        )

        if existing_model.embedding is not None and new_embedding is not None:
            # Moyenne pondérée (plus de poids aux anciens pour stabilité)
            improved_embedding = (
                improvement_weight_old * existing_model.embedding +
                improvement_weight_new * new_embedding
            )
        else:
            improved_embedding = (
                new_embedding if new_embedding is not None
                else existing_model.embedding
            )

        # Mettre à jour le modèle
        existing_model.embedding = improved_embedding
        existing_model.updated_at = datetime.now()
        existing_model.audio_count += 1
        existing_model.quality_score = min(1.0, existing_model.quality_score + 0.05)
        existing_model.version += 1
        existing_model.next_recalibration_at = datetime.now() + timedelta(
            days=self.VOICE_MODEL_MAX_AGE_DAYS
        )

        # Régénérer l'empreinte vocale avec le nouvel embedding
        if existing_model.voice_characteristics:
            existing_model.generate_fingerprint()

        # Sauvegarder
        await self._cache_manager.save_model_to_cache(existing_model)

        logger.info(
            f"[MODEL_CREATOR] ✅ Modèle amélioré pour {existing_model.user_id} "
            f"(v{existing_model.version})"
        )
        return existing_model
