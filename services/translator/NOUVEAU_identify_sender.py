"""
Nouvelle implémentation de identify_sender() avec reconnaissance vocale

À intégrer dans diarization_service.py pour remplacer la version TODO
"""

async def identify_sender(
    self,
    audio_path: str,
    diarization: DiarizationResult,
    sender_voice_profile: Optional[Dict[str, Any]] = None
) -> tuple[DiarizationResult, Dict[str, float]]:
    """
    Identifie l'expéditeur parmi les locuteurs détectés et calcule les scores de similarité.

    Args:
        audio_path: Chemin vers le fichier audio
        diarization: Résultat de la diarisation
        sender_voice_profile: Profil vocal de l'expéditeur (embeddings, caractéristiques)
            Format attendu: {"embedding": np.array(...), "user_id": "..."}

    Returns:
        Tuple (DiarizationResult mis à jour, Dict[speaker_id -> score de similarité])
    """
    from .voice_recognition_service import get_voice_recognition_service

    # ✅ NOUVEAU: Si pas de profil vocal, on ne devine PAS qui est l'utilisateur
    if not sender_voice_profile or 'embedding' not in sender_voice_profile:
        logger.warning(
            "[DIARIZATION] Pas de profil vocal - impossible d'identifier l'expéditeur "
            "(pas de devinette)"
        )
        diarization.sender_identified = False
        diarization.sender_speaker_id = None  # ✅ On ne sait pas

        # Retourner scores nuls (pas de profil = pas de comparaison possible)
        scores = {speaker.speaker_id: None for speaker in diarization.speakers}
        return diarization, scores

    # Préparer les segments pour la reconnaissance vocale
    speaker_segments = []
    for speaker in diarization.speakers:
        # Prendre le segment le plus long de chaque locuteur
        longest_segment = max(speaker.segments, key=lambda s: s.duration_ms)
        speaker_segments.append({
            "sid": speaker.speaker_id,
            "start_ms": longest_segment.start_ms,
            "end_ms": longest_segment.end_ms,
            "duration_ms": longest_segment.duration_ms
        })

    # Utiliser le service de reconnaissance vocale
    voice_service = get_voice_recognition_service()

    # Identifier l'utilisateur parmi les locuteurs
    identified_speaker, similarity_scores = voice_service.identify_user_speaker(
        audio_path=audio_path,
        speaker_segments=speaker_segments,
        user_voice_profile=sender_voice_profile,
        threshold=0.6  # Seuil de confiance minimum
    )

    # Mettre à jour le résultat de diarisation
    if identified_speaker:
        diarization.sender_identified = True
        diarization.sender_speaker_id = identified_speaker
        best_score = similarity_scores.get(identified_speaker, 0.0)

        logger.info(
            f"[DIARIZATION] Expéditeur identifié: {identified_speaker} "
            f"(score de similarité: {best_score:.3f})"
        )
    else:
        # ✅ NOUVEAU: Pas de correspondance forte → on ne devine PAS
        diarization.sender_identified = False
        diarization.sender_speaker_id = None  # ✅ On ne sait pas

        logger.info(
            f"[DIARIZATION] Expéditeur non identifié - aucune correspondance au-dessus du seuil "
            f"(meilleur score: {max(similarity_scores.values()):.3f})"
        )

    # Log des scores pour tous les locuteurs
    logger.info("[DIARIZATION] Scores de similarité vocale:")
    for speaker_id, score in similarity_scores.items():
        logger.info(f"  - {speaker_id}: {score:.3f}")

    return diarization, similarity_scores


# ===========================
# À AJOUTER dans transcription_service.py dans la méthode _apply_diarization
# ===========================

async def _apply_diarization(
    self,
    audio_path: str,
    transcription: TranscriptionResult,
    sender_voice_profile: Optional[Dict[str, Any]] = None
) -> TranscriptionResult:
    """
    Applique la diarisation aux segments transcrits.
    NOUVELLE VERSION avec scores de similarité vocale.

    Args:
        audio_path: Chemin vers le fichier audio
        transcription: Résultat de la transcription
        sender_voice_profile: Profil vocal de l'expéditeur (optionnel)

    Returns:
        TranscriptionResult avec segments enrichis de speaker_id et voice_similarity_score
    """
    try:
        from .diarization_service import get_diarization_service

        logger.info("[TRANSCRIPTION] 🎯 Application de la diarisation...")

        # 1. Détecter les locuteurs
        diarization_service = get_diarization_service()
        diarization = await diarization_service.detect_speakers(audio_path)

        logger.info(
            f"[TRANSCRIPTION] {diarization.speaker_count} locuteur(s) détecté(s) "
            f"(méthode: {diarization.method})"
        )

        # 2. Identifier l'expéditeur et calculer les scores de similarité
        diarization, similarity_scores = await diarization_service.identify_sender(
            audio_path,
            diarization,
            sender_voice_profile
        )

        # 3. Enrichir les segments avec speaker_id et voice_similarity_score
        for segment in transcription.segments:
            # Trouver le locuteur pour ce segment (milieu du segment)
            segment_mid_ms = (segment.start_ms + segment.end_ms) // 2

            # Chercher le locuteur qui parle à ce moment
            for speaker in diarization.speakers:
                for speaker_seg in speaker.segments:
                    if speaker_seg.start_ms <= segment_mid_ms <= speaker_seg.end_ms:
                        segment.speaker_id = speaker.speaker_id

                        # ✅ NOUVEAU: Ajouter le score de similarité vocale
                        segment.voice_similarity_score = similarity_scores.get(
                            speaker.speaker_id,
                            None  # None si pas de profil vocal
                        )
                        break
                if segment.speaker_id:
                    break

        # 4. Mettre à jour les métadonnées de transcription
        transcription.speaker_count = diarization.speaker_count
        transcription.primary_speaker_id = diarization.primary_speaker_id
        transcription.sender_voice_identified = diarization.sender_identified
        transcription.sender_speaker_id = diarization.sender_speaker_id

        # 5. Ajouter l'analyse complète des locuteurs avec scores
        transcription.speaker_analysis = {
            "speakers": [
                {
                    "sid": speaker.speaker_id,
                    "is_primary": speaker.is_primary,
                    "speaking_time_ms": speaker.speaking_time_ms,
                    "speaking_ratio": speaker.speaking_ratio,
                    "voice_similarity_score": similarity_scores.get(speaker.speaker_id, 0.0),  # ✅ NOUVEAU
                    "segments": [
                        {
                            "start_ms": seg.start_ms,
                            "end_ms": seg.end_ms,
                            "duration_ms": seg.duration_ms
                        }
                        for seg in speaker.segments
                    ]
                }
                for speaker in diarization.speakers
            ],
            "total_duration_ms": diarization.total_duration_ms,
            "method": diarization.method
        }

        logger.info(
            f"[TRANSCRIPTION] ✅ Diarisation appliquée - "
            f"{diarization.speaker_count} locuteur(s), "
            f"expéditeur: {diarization.sender_speaker_id} "
            f"(identifié: {diarization.sender_identified})"
        )

        # Log des scores de similarité
        if similarity_scores:
            logger.info("[TRANSCRIPTION] Scores de similarité vocale par segment:")
            for speaker_id, score in similarity_scores.items():
                logger.info(f"  - {speaker_id}: {score:.3f}")

        return transcription

    except Exception as e:
        logger.error(f"[TRANSCRIPTION] Erreur lors de la diarisation: {e}")
        # En cas d'erreur, retourner la transcription sans diarisation
        return transcription
