"""
Service pour combler les trous de transcription en extrayant et transcrivant les zones manquantes
"""
import logging
import os
import uuid
from typing import List, Tuple
from pydub import AudioSegment

logger = logging.getLogger(__name__)


async def fill_transcription_gaps(
    audio_path: str,
    gaps: List[dict],
    diarization_speakers: List,
    transcribe_func
) -> List:
    """
    Comble les trous de transcription en extrayant et transcrivant les zones manquantes

    Args:
        audio_path: Chemin vers l'audio complet
        gaps: Liste des trous détectés [{start, end, duration}, ...]
        diarization_speakers: Speakers de diarization
        transcribe_func: Fonction async pour transcrire (transcription_service._transcribe_whisper)

    Returns:
        Liste des nouveaux segments transcrits
    """
    if not gaps:
        return []

    logger.info(f"[GAP_FILLER] 🔧 Traitement de {len(gaps)} trou(s) de transcription")

    new_segments = []

    try:
        # Charger l'audio complet
        audio = AudioSegment.from_file(audio_path)

        for gap_idx, gap in enumerate(gaps):
            start_ms = gap['start']
            end_ms = gap['end']
            duration = gap['duration']

            logger.info(f"[GAP_FILLER] 🎯 Trou {gap_idx+1}: [{start_ms}ms - {end_ms}ms] ({duration}ms)")

            # Extraire cette zone
            gap_audio = audio[start_ms:end_ms]

            # Amplifier pour mieux entendre (+12dB)
            gap_audio = gap_audio + 12
            logger.info(f"[GAP_FILLER]   ✅ Audio amplifié de +12dB")

            # Sauver temporairement
            temp_path = f"/tmp/gap_{gap_idx}_{uuid.uuid4().hex}.wav"
            gap_audio.export(temp_path, format="wav")

            try:
                # Transcrire JUSTE cette zone
                logger.info(f"[GAP_FILLER]   🎤 Transcription du trou...")
                result = await transcribe_func(temp_path, return_timestamps=True)

                if result and result.segments:
                    # Ajuster les timestamps vers l'audio original
                    for seg in result.segments:
                        # Timestamps dans l'extrait → timestamps dans l'audio complet
                        seg.start_ms = start_ms + seg.start_ms
                        seg.end_ms = start_ms + seg.end_ms

                        # Trouver quel speaker parle dans cette zone
                        seg_mid = (seg.start_ms + seg.end_ms) // 2
                        for speaker in diarization_speakers:
                            for speaker_seg in speaker.segments:
                                if speaker_seg.start_ms <= seg_mid <= speaker_seg.end_ms:
                                    seg.speaker_id = speaker.speaker_id
                                    seg.voice_similarity_score = speaker.voice_similarity_score
                                    break
                            if seg.speaker_id:
                                break

                        new_segments.append(seg)
                        logger.info(
                            f"[GAP_FILLER]     ✅ '{seg.text}' [{seg.start_ms}-{seg.end_ms}ms] "
                            f"→ {seg.speaker_id or 'UNASSIGNED'}"
                        )

                    logger.info(f"[GAP_FILLER]   ✅ {len(result.segments)} segment(s) récupéré(s)")
                else:
                    logger.warning(f"[GAP_FILLER]   ⚠️ Aucun segment transcrit pour ce trou")

            finally:
                # Nettoyer
                if os.path.exists(temp_path):
                    os.remove(temp_path)

        logger.info(f"[GAP_FILLER] ✅ Total : {len(new_segments)} nouveau(x) segment(s)")
        return new_segments

    except Exception as e:
        logger.error(f"[GAP_FILLER] ❌ Erreur : {e}", exc_info=True)
        return []
