"""
Synthesizer - Synthèse TTS et conversion audio
===============================================

Responsabilités:
- Synthèse TTS avec clonage vocal
- Conversion de formats audio (Opus basse bande par défaut, D1)
- Calcul de durée audio
- Gestion des paramètres de synthèse
- Segmentation intelligente pour textes longs
"""

import os
import re
import shutil
import logging
import time
import uuid
import asyncio
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from pathlib import Path

from utils.audio_format import export_options, mime_type_for

logger = logging.getLogger(__name__)

# Configuration segmentation texte long (configurable via .env)
# Chatterbox max_new_tokens=2048 ≈ 140s audio max (2min20s)
MAX_SEGMENT_CHARS = int(os.getenv("TTS_MAX_SEGMENT_CHARS", "1000"))  # Caractères max par segment (~70-80s audio)
MIN_SEGMENT_CHARS = int(os.getenv("TTS_MIN_SEGMENT_CHARS", "50"))     # Caractères min (éviter segments trop courts)
MIN_TEXT_LENGTH_FOR_TTS = int(os.getenv("MIN_TEXT_LENGTH_FOR_TTS", "10"))  # Longueur absolue minimale pour TTS

# Configuration vitesse audio (DÉSACTIVÉ - contrôlé via paramètres Chatterbox)
# La vitesse est maintenant gérée via exaggeration et cfg_weight dans chatterbox_backend.py
# Facteur de vitesse: 1.0 = normal, 0.9 = 10% plus lent, 1.1 = 10% plus rapide
AUDIO_SPEED_FACTOR = 1.0  # Désactivé - pas de post-traitement


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
    # D2 — raw bytes preferred over base64 for internal ZMQ pipeline (no encode/decode round-trip)
    audio_bytes: Optional[bytes] = None
    audio_mime_type: Optional[str] = None
    # Legacy base64 field kept for backward compat with HTTP endpoints
    audio_data_base64: Optional[str] = None


class Synthesizer:
    """
    Gestionnaire de synthèse TTS.

    Responsabilités:
    - Synthèse vocale avec ou sans clonage
    - Conversion de formats audio
    - Génération des résultats unifiés
    - Segmentation intelligente pour textes longs (>150 chars)
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
        (self.output_dir / "segments").mkdir(parents=True, exist_ok=True)

        logger.info(f"[Synthesizer] Initialisé: output={output_dir}, format={default_format}")

    def _segment_text(self, text: str, max_chars: int = MAX_SEGMENT_CHARS) -> List[str]:
        """
        Segmente un texte long en morceaux synthétisables.

        Stratégie:
        1. Découper par phrases (., !, ?)
        2. Si phrase trop longue, découper par virgules
        3. Si toujours trop long, découper par mots

        Args:
            text: Texte à segmenter
            max_chars: Longueur maximale par segment

        Returns:
            Liste de segments de texte
        """
        if len(text) <= max_chars:
            return [text]

        segments = []
        current_segment = ""

        # Découper par phrases
        # Pattern: fin de phrase + espace ou fin de texte
        sentence_pattern = r'([^.!?]*[.!?]+\s*)'
        sentences = re.findall(sentence_pattern, text)

        # Ajouter le reste s'il y en a (sans ponctuation finale)
        remaining = re.sub(sentence_pattern, '', text).strip()
        if remaining:
            sentences.append(remaining)

        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence:
                continue

            # Si la phrase tient dans le segment actuel
            if len(current_segment) + len(sentence) + 1 <= max_chars:
                current_segment = (current_segment + " " + sentence).strip()
            else:
                # La phrase ne tient pas dans le segment courant. On DOIT vider ce
                # dernier avant de l'écraser plus bas — même s'il est plus court que
                # MIN_SEGMENT_CHARS : ne pas le sauvegarder ici le perdrait
                # silencieusement (texte absent de l'audio synthétisé). Un segment
                # court est un moindre mal ; la fusion du tout dernier segment court
                # reste gérée en fin de fonction.
                if current_segment:
                    segments.append(current_segment)
                    current_segment = ""

                # Si la phrase elle-même est trop longue
                if len(sentence) > max_chars:
                    # Découper par virgules
                    sub_parts = sentence.split(',')
                    for part in sub_parts:
                        part = part.strip()
                        if not part:
                            continue

                        if len(current_segment) + len(part) + 2 <= max_chars:
                            current_segment = (current_segment + ", " + part).strip()
                            if current_segment.startswith(", "):
                                current_segment = current_segment[2:]
                        else:
                            # Idem : vider tout buffer non vide avant de l'écraser,
                            # sinon un fragment court serait perdu.
                            if current_segment:
                                segments.append(current_segment)
                            current_segment = part

                            # Si le part est encore trop long, découper par mots
                            if len(current_segment) > max_chars:
                                words = current_segment.split()
                                current_segment = ""
                                for word in words:
                                    if len(current_segment) + len(word) + 1 <= max_chars:
                                        current_segment = (current_segment + " " + word).strip()
                                    else:
                                        if current_segment:
                                            segments.append(current_segment)
                                        current_segment = word
                else:
                    current_segment = sentence

        # Ajouter le dernier segment
        if current_segment:
            # Si le dernier segment est trop court, le fusionner avec le précédent
            if len(current_segment) < MIN_SEGMENT_CHARS and segments:
                last = segments.pop()
                if len(last) + len(current_segment) + 1 <= max_chars * 1.2:  # Tolérance 20%
                    segments.append(last + " " + current_segment)
                else:
                    segments.append(last)
                    segments.append(current_segment)
            else:
                segments.append(current_segment)

        logger.info(
            f"[Synthesizer] Texte segmenté: {len(text)} chars → {len(segments)} segments "
            f"(moy: {len(text)//max(1,len(segments))} chars/seg)"
        )

        return segments if segments else [text]

    async def _concatenate_audios(
        self,
        audio_paths: List[str],
        output_path: str,
        silence_ms: int = 150
    ) -> str:
        """
        Concatène plusieurs fichiers audio avec des silences entre eux.

        Args:
            audio_paths: Liste des chemins audio à concaténer
            output_path: Chemin de sortie
            silence_ms: Durée du silence entre segments (ms)

        Returns:
            Chemin du fichier concaténé
        """
        if len(audio_paths) == 1:
            # Un seul fichier, le renommer simplement
            if audio_paths[0] != output_path:
                import shutil
                shutil.move(audio_paths[0], output_path)
            return output_path

        try:
            from pydub import AudioSegment

            loop = asyncio.get_event_loop()

            def concat():
                combined = AudioSegment.empty()
                silence = AudioSegment.silent(duration=silence_ms)

                for i, path in enumerate(audio_paths):
                    if not os.path.exists(path):
                        logger.warning(f"[Synthesizer] Fichier segment manquant: {path}")
                        continue

                    # Détecter le format
                    ext = path.rsplit(".", 1)[-1].lower() if "." in path else "wav"
                    segment = AudioSegment.from_file(path, format=ext)
                    combined += segment

                    # Ajouter silence entre segments (pas après le dernier)
                    if i < len(audio_paths) - 1:
                        combined += silence

                # Exporter
                output_format = output_path.rsplit(".", 1)[-1].lower() if "." in output_path else "mp3"
                combined.export(output_path, format=output_format)

                # Nettoyer les fichiers temporaires
                for path in audio_paths:
                    if os.path.exists(path) and path != output_path:
                        try:
                            os.unlink(path)
                        except Exception:
                            pass

                return output_path

            result = await loop.run_in_executor(None, concat)
            logger.info(
                f"[Synthesizer] ✅ {len(audio_paths)} segments concaténés → {output_path}"
            )
            return result

        except Exception as e:
            logger.error(f"[Synthesizer] ❌ Erreur concaténation: {e}")
            # En cas d'erreur, retourner le premier segment
            if audio_paths and os.path.exists(audio_paths[0]):
                return audio_paths[0]
            raise

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
        # NOUVEAU: Conditionals Chatterbox pré-calculés
        conditionals: Optional[Any] = None,
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

        # Convertir text en string si nécessaire
        text_str = str(text) if not isinstance(text, str) else text
        text_str = text_str.strip()

        # ═══════════════════════════════════════════════════════════════
        # VALIDATION LONGUEUR MINIMALE
        # Chatterbox crash avec des textes trop courts (< 10 chars)
        # ═══════════════════════════════════════════════════════════════
        if len(text_str) < MIN_TEXT_LENGTH_FOR_TTS:
            original_text = text_str

            # Ajouter une ponctuation naturelle si absente
            if not text_str.endswith(('.', '!', '?', ',')):
                # Mots courts typiques → exclamation (plus naturel vocalement)
                if len(text_str.split()) == 1 and len(text_str) <= 5:
                    text_str += "!"
                else:
                    text_str += "."

            # Si toujours trop court, ajouter des espaces (silences naturels)
            # Chatterbox interprète les espaces comme des pauses légères
            if len(text_str) < MIN_TEXT_LENGTH_FOR_TTS:
                padding_needed = MIN_TEXT_LENGTH_FOR_TTS - len(text_str)
                text_str = text_str + " " * padding_needed

            logger.warning(
                f"[Synthesizer] ⚠️ Texte court ({len(original_text)} chars): "
                f"'{original_text}' → '{text_str.strip()}' + {len(text_str) - len(text_str.strip())} espaces"
            )

        logger.info(
            f"[Synthesizer] 🎤 Synthèse: '{text_str[:50]}...' → {target_language} "
            f"(model={model.value}, len={len(text_str)} chars)"
        )

        try:
            # ═══════════════════════════════════════════════════════════════
            # SEGMENTATION POUR TEXTES LONGS
            # Chatterbox limite à ~140s audio (max_new_tokens=2048)
            # On segmente les textes > 1000 chars pour éviter la troncature
            # ═══════════════════════════════════════════════════════════════
            segments = self._segment_text(text)

            if len(segments) > 1:
                logger.info(
                    f"[Synthesizer] 📝 Texte long détecté ({len(text)} chars) → "
                    f"{len(segments)} segments à synthétiser SÉQUENTIELLEMENT"
                )

                # ═══════════════════════════════════════════════════════════════
                # SYNTHÈSE SÉQUENTIELLE des segments
                # Note: La synthèse parallèle cause des erreurs de tenseurs avec
                # Chatterbox car le modèle n'est pas thread-safe. Les appels
                # concurrents interfèrent au niveau des tenseurs internes.
                # ═══════════════════════════════════════════════════════════════

                segment_paths = []
                for i, segment_text in enumerate(segments):
                    segment_filename = f"{file_id}_{target_language}_seg{i:03d}.wav"
                    segment_path = str(self.output_dir / "segments" / segment_filename)

                    logger.debug(
                        f"[Synthesizer] 🔄 Segment {i+1}/{len(segments)}: "
                        f"'{segment_text[:40]}...' ({len(segment_text)} chars)"
                    )

                    try:
                        await backend.synthesize(
                            text=segment_text,
                            language=target_language,
                            speaker_audio_path=speaker_audio_path,
                            output_path=segment_path,
                            conditionals=conditionals,
                            **kwargs
                        )

                        if os.path.exists(segment_path):
                            logger.debug(f"[Synthesizer] ✅ Segment {i+1} synthétisé")
                            segment_paths.append(segment_path)
                        else:
                            logger.warning(f"[Synthesizer] ⚠️ Segment {i+1} non généré")
                    except Exception as e:
                        logger.error(f"[Synthesizer] ❌ Erreur segment {i+1}: {e}")

                logger.info(
                    f"[Synthesizer] ✅ Synthèse séquentielle terminée: "
                    f"{len(segment_paths)}/{len(segments)} segments réussis"
                )

                # Concaténer tous les segments
                if segment_paths:
                    temp_concat_path = str(self.output_dir / "segments" / f"{file_id}_{target_language}_full.wav")
                    await self._concatenate_audios(segment_paths, temp_concat_path)
                    # Déplacer vers la destination finale
                    output_path_wav = output_path.rsplit(".", 1)[0] + ".wav"
                    shutil.move(temp_concat_path, output_path_wav)
                    output_path = output_path_wav
                else:
                    raise RuntimeError("Aucun segment audio généré")
            else:
                # Texte court: synthèse directe
                await backend.synthesize(
                    text=text,
                    language=target_language,
                    speaker_audio_path=speaker_audio_path,
                    output_path=output_path,
                    conditionals=conditionals,
                    **kwargs
                )

            # Ajuster la vitesse de l'audio (ralentir de 10% par défaut)
            if AUDIO_SPEED_FACTOR != 1.0:
                output_path = await self._adjust_speed(output_path, AUDIO_SPEED_FACTOR)

            # Convertir le format si nécessaire
            if output_format != "wav":
                output_path = await self._convert_format(output_path, output_format)

            # Calculer la durée et le temps de traitement
            duration_ms = await self._get_duration_ms(output_path)
            processing_time = int((time.time() - start_time) * 1000)

            # D2: pas d'encodage base64 — le handler ZMQ lit les octets depuis
            # `output_path` directement (multipart binaire), zéro round-trip.
            audio_mime_type = mime_type_for(output_format)

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
                audio_data_base64=None,
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

            # D1: Opus → libopus mono basse bande (VoIP) ; autres formats inchangés.
            opts = export_options(target_format)

            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: AudioSegment.from_file(input_path, format=source_ext).export(
                    output_path,
                    **opts
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
            from utils.audio_utils import get_audio_duration
            loop = asyncio.get_event_loop()
            duration = await loop.run_in_executor(
                None,
                lambda: get_audio_duration(audio_path)
            )
            return int(duration * 1000)
        except Exception as e:
            logger.warning(f"[Synthesizer] Erreur calcul durée: {e}")
            return 0

    async def _adjust_speed(self, audio_path: str, speed_factor: float = AUDIO_SPEED_FACTOR) -> str:
        """
        Ajuste la vitesse de l'audio sans modifier le pitch.

        Utilise librosa time_stretch pour un time-stretching de qualité.

        Args:
            audio_path: Chemin du fichier audio
            speed_factor: Facteur de vitesse (0.9 = 10% plus lent, 1.1 = 10% plus rapide)

        Returns:
            Chemin du fichier modifié (même fichier, écrasé)
        """
        if speed_factor == 1.0:
            return audio_path

        try:
            import librosa
            import soundfile as sf

            loop = asyncio.get_event_loop()

            def stretch_audio():
                # Charger l'audio
                y, sr = librosa.load(audio_path, sr=None)

                # Time-stretch: rate > 1 = plus rapide, rate < 1 = plus lent
                # Pour ralentir de 10%, on utilise rate=0.9
                y_stretched = librosa.effects.time_stretch(y, rate=speed_factor)

                # Sauvegarder (écraser le fichier original)
                sf.write(audio_path, y_stretched, sr)

                return audio_path

            result = await loop.run_in_executor(None, stretch_audio)

            logger.info(
                f"[Synthesizer] 🎚️ Vitesse ajustée: {speed_factor:.2f}x "
                f"({'ralenti' if speed_factor < 1 else 'accéléré'} de {abs(1-speed_factor)*100:.0f}%)"
            )

            return result

        except Exception as e:
            logger.warning(f"[Synthesizer] Erreur ajustement vitesse: {e}")
            return audio_path

# Alias pour compatibilité
TTSResult = UnifiedTTSResult
