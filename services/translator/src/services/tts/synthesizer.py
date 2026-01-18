"""
Synthesizer - Synthèse TTS et conversion audio
===============================================

Responsabilités:
- Synthèse TTS avec clonage vocal
- Conversion de formats audio
- Calcul de durée audio
- Encodage base64 pour transmission
- Gestion des paramètres de synthèse
"""

import os
import logging
import time
import uuid
import asyncio
from typing import Optional, Dict, Any
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class UnifiedTTSResult:
    """Résultat unifié d'une synthèse TTS"""
    audio_path: str
    audio_url: str
    duration_ms: int
    format: str
    language: str
    voice_cloned: bool
    voice_quality: float
    processing_time_ms: int
    text_length: int
    model_used: 'TTSModel'
    model_info: 'TTSModelInfo'
    # Audio en base64 pour transmission directe au Gateway (pas de fichier partagé)
    audio_data_base64: Optional[str] = None
    audio_mime_type: Optional[str] = None


class Synthesizer:
    """
    Gestionnaire de synthèse TTS.

    Responsabilités:
    - Synthèse vocale avec ou sans clonage
    - Conversion de formats audio
    - Génération des résultats unifiés
    """

    def __init__(self, output_dir: Path, default_format: str = "mp3"):
        """
        Initialise le synthétiseur.

        Args:
            output_dir: Répertoire de sortie pour les fichiers audio
            default_format: Format de sortie par défaut
        """
        self.output_dir = output_dir
        self.default_format = default_format

        # Créer les répertoires de sortie
        self.output_dir.mkdir(parents=True, exist_ok=True)
        (self.output_dir / "translated").mkdir(parents=True, exist_ok=True)

        logger.info(f"[Synthesizer] Initialisé: output={output_dir}, format={default_format}")

    async def synthesize_with_voice(
        self,
        text: str,
        target_language: str,
        backend: 'BaseTTSBackend',
        model: 'TTSModel',
        model_info: 'TTSModelInfo',
        speaker_audio_path: Optional[str] = None,
        output_format: Optional[str] = None,
        message_id: Optional[str] = None,
        # Paramètres de clonage vocal configurables
        exaggeration: Optional[float] = None,
        cfg_weight: Optional[float] = None,
        temperature: Optional[float] = None,
        repetition_penalty: Optional[float] = None,
        min_p: Optional[float] = None,
        top_p: Optional[float] = None,
        cloning_params: Optional[Dict[str, Any]] = None,
        auto_optimize: bool = True,
        **kwargs
    ) -> UnifiedTTSResult:
        """
        Synthétise du texte avec clonage vocal optionnel.

        Args:
            text: Texte à synthétiser
            target_language: Langue cible (code ISO 639-1)
            backend: Backend TTS à utiliser
            model: Modèle TTS utilisé
            model_info: Informations sur le modèle
            speaker_audio_path: Chemin audio de référence (optionnel)
            output_format: Format de sortie (mp3, wav, etc.)
            message_id: ID du message pour le nommage du fichier

            PARAMÈTRES DE CLONAGE VOCAL (6 paramètres Chatterbox):
            exaggeration: Expressivité (0.0-1.0, défaut 0.5)
            cfg_weight: Guidance (0.0-1.0, défaut 0.0 pour non-anglais)
            temperature: Créativité (0.0-2.0, défaut 0.8)
            repetition_penalty: Pénalité répétition (1.0-3.0)
            min_p: Probabilité minimum (0.0-1.0, défaut 0.05)
            top_p: Nucleus sampling (0.0-1.0, défaut 1.0)
            cloning_params: Dict avec tous les paramètres (alternative)
            auto_optimize: Calculer automatiquement les paramètres non spécifiés

        Returns:
            UnifiedTTSResult avec les informations de l'audio généré
        """
        start_time = time.time()

        # Récupérer les paramètres de clonage depuis cloning_params ou valeurs individuelles
        if cloning_params:
            exaggeration = cloning_params.get("exaggeration", exaggeration)
            cfg_weight = cloning_params.get("cfg_weight", cfg_weight)
            temperature = cloning_params.get("temperature", temperature)
            repetition_penalty = cloning_params.get("repetition_penalty", repetition_penalty)
            min_p = cloning_params.get("min_p", min_p)
            top_p = cloning_params.get("top_p", top_p)
            auto_optimize = cloning_params.get("auto_optimize", auto_optimize)

        # Ajouter les paramètres aux kwargs pour le backend
        if exaggeration is not None:
            kwargs['exaggeration'] = exaggeration
        if cfg_weight is not None:
            kwargs['cfg_weight'] = cfg_weight
        if temperature is not None:
            kwargs['temperature'] = temperature
        if repetition_penalty is not None:
            kwargs['repetition_penalty'] = repetition_penalty
        if min_p is not None:
            kwargs['min_p'] = min_p
        if top_p is not None:
            kwargs['top_p'] = top_p

        # Activer/désactiver l'auto-optimisation
        kwargs['auto_optimize_params'] = auto_optimize

        logger.debug(
            f"[Synthesizer] Paramètres clonage: exag={exaggeration}, cfg={cfg_weight}, "
            f"temp={temperature}, rep_pen={repetition_penalty}, "
            f"min_p={min_p}, top_p={top_p}, auto_opt={auto_optimize}"
        )

        # Préparer le fichier de sortie
        output_format = output_format or self.default_format
        file_id = message_id or str(uuid.uuid4())
        output_filename = f"{file_id}_{target_language}.{output_format}"
        output_path = str(self.output_dir / "translated" / output_filename)

        logger.info(
            f"[Synthesizer] 🎤 Synthèse: '{text[:50]}...' → {target_language} "
            f"(model={model.value})"
        )

        try:
            # Synthétiser avec le backend
            await backend.synthesize(
                text=text,
                language=target_language,
                speaker_audio_path=speaker_audio_path,
                output_path=output_path,
                **kwargs
            )

            # Convertir le format si nécessaire
            if output_format != "wav":
                output_path = await self._convert_format(output_path, output_format)

            # Calculer la durée et le temps de traitement
            duration_ms = await self._get_duration_ms(output_path)
            processing_time = int((time.time() - start_time) * 1000)

            # Encoder l'audio en base64 pour transmission au Gateway
            audio_data_base64, audio_mime_type = await self._encode_audio_base64(
                output_path,
                output_format
            )

            logger.info(
                f"[Synthesizer] ✅ Synthèse terminée: {output_filename} "
                f"(dur={duration_ms}ms, time={processing_time}ms, model={model.value})"
            )

            return UnifiedTTSResult(
                audio_path=output_path,
                audio_url=f"/outputs/audio/translated/{output_filename}",
                duration_ms=duration_ms,
                format=output_format,
                language=target_language,
                voice_cloned=bool(speaker_audio_path and os.path.exists(speaker_audio_path)),
                voice_quality=model_info.quality_score / 100.0,
                processing_time_ms=processing_time,
                text_length=len(text),
                model_used=model,
                model_info=model_info,
                audio_data_base64=audio_data_base64,
                audio_mime_type=audio_mime_type
            )

        except Exception as e:
            logger.error(f"[Synthesizer] ❌ Erreur synthèse: {e}")
            import traceback
            traceback.print_exc()
            raise RuntimeError(f"Échec de la synthèse TTS: {e}")

    async def _convert_format(self, input_path: str, target_format: str) -> str:
        """
        Convertit un fichier audio vers un autre format.

        Args:
            input_path: Chemin du fichier source
            target_format: Format de sortie (mp3, wav, etc.)

        Returns:
            Chemin du fichier converti
        """
        try:
            from pydub import AudioSegment

            output_path = input_path.rsplit(".", 1)[0] + f".{target_format}"

            # Détecter le format source automatiquement
            source_ext = input_path.rsplit(".", 1)[-1].lower() if "." in input_path else "wav"

            logger.debug(f"[Synthesizer] Conversion {source_ext} → {target_format}")

            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: AudioSegment.from_file(input_path, format=source_ext).export(
                    output_path,
                    format=target_format
                )
            )

            # Supprimer le fichier source si différent
            if input_path != output_path and os.path.exists(input_path):
                os.unlink(input_path)

            logger.debug(f"[Synthesizer] Conversion terminée: {output_path}")
            return output_path

        except Exception as e:
            logger.warning(f"[Synthesizer] Erreur conversion format: {e}")
            return input_path

    async def _get_duration_ms(self, audio_path: str) -> int:
        """
        Récupère la durée d'un fichier audio en millisecondes.

        Args:
            audio_path: Chemin du fichier audio

        Returns:
            Durée en millisecondes
        """
        try:
            import librosa
            loop = asyncio.get_event_loop()
            duration = await loop.run_in_executor(
                None,
                lambda: librosa.get_duration(path=audio_path)
            )
            return int(duration * 1000)
        except Exception as e:
            logger.warning(f"[Synthesizer] Erreur calcul durée: {e}")
            return 0

    async def _encode_audio_base64(
        self,
        audio_path: str,
        audio_format: str
    ) -> tuple[Optional[str], Optional[str]]:
        """
        Encode un fichier audio en base64 pour transmission.

        Args:
            audio_path: Chemin du fichier audio
            audio_format: Format audio (mp3, wav, etc.)

        Returns:
            Tuple (audio_base64, mime_type)
        """
        try:
            import base64

            loop = asyncio.get_event_loop()

            def read_and_encode():
                with open(audio_path, 'rb') as f:
                    audio_bytes = f.read()
                return base64.b64encode(audio_bytes).decode('utf-8')

            audio_data_base64 = await loop.run_in_executor(None, read_and_encode)
            audio_mime_type = f"audio/{audio_format}"

            logger.debug(
                f"[Synthesizer] Audio encodé en base64: "
                f"{len(audio_data_base64)} chars"
            )

            return audio_data_base64, audio_mime_type

        except Exception as e:
            logger.warning(f"[Synthesizer] Erreur encodage base64: {e}")
            return None, None


# Alias pour compatibilité
TTSResult = UnifiedTTSResult
