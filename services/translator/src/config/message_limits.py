"""
Configuration des limites de messages pour le service de traduction
Centralisée pour cohérence avec le gateway et le frontend
"""

import os

class MessageLimits:
    """
    Limites de messages configurables via variables d'environnement
    Aligné avec gateway/src/config/message-limits.ts
    """

    # Limite maximale de caractères pour un message (validé à l'envoi)
    # Aligné avec frontend: 2000 caractères pour USER, 4000 pour MODERATOR+
    MAX_MESSAGE_LENGTH = int(os.getenv('MAX_MESSAGE_LENGTH', '2000'))

    # Seuil pour convertir le texte en pièce jointe textuelle
    MAX_TEXT_ATTACHMENT_THRESHOLD = int(os.getenv('MAX_TEXT_ATTACHMENT_THRESHOLD', '2000'))

    # Limite maximale de caractères pour la traduction
    # Les messages dépassant cette limite ne seront pas envoyés au service de traduction
    # Aligné avec MAX_MESSAGE_LENGTH pour permettre la traduction de tous les messages valides
    MAX_TRANSLATION_LENGTH = int(os.getenv('MAX_TRANSLATION_LENGTH', '10000'))

    # Limite maximale pour les textes longs (legacy)
    MAX_TEXT_LENGTH = int(os.getenv('MAX_TEXT_LENGTH', '10000'))

    # Plafond de durée pour un audio transcrit et traduit (millisecondes)
    # Aucune limite n'existait avant #3668 : un audio arbitrairement long
    # traversait transcription + traduction + TTS sans autre borne que le
    # watchdog TTS (180s, TTS_SYNTH_TIMEOUT_S), qui ne couvre que la synthèse.
    # Aligné sur MAX_ALLOWED_DURATION du recorder web (10 min, HARD LIMIT) —
    # apps/web/components/audio/AudioRecorderCard.tsx — pour ne jamais rejeter
    # un audio qu'un client Meeshy peut légitimement produire.
    MAX_AUDIO_DURATION_MS = int(os.getenv('MAX_AUDIO_DURATION_MS', '600000'))


def validate_message_length(content: str) -> tuple[bool, str | None]:
    """
    Valide la longueur d'un message
    
    Returns:
        tuple[bool, str | None]: (is_valid, error_message)
    """
    if not content or not content.strip():
        return False, "Le message ne peut pas être vide"
    
    if len(content) > MessageLimits.MAX_MESSAGE_LENGTH:
        return False, f"Le message ne peut pas dépasser {MessageLimits.MAX_MESSAGE_LENGTH} caractères ({len(content)} caractères fournis)"
    
    return True, None


def can_translate_message(content: str) -> bool:
    """
    Vérifie si un message peut être traduit (selon sa longueur)
    
    Les messages dépassant MAX_TRANSLATION_LENGTH ne seront pas envoyés 
    au service de traduction pour optimiser les performances.
    
    Returns:
        bool: True si le message peut être traduit, False sinon
    """
    return len(content) <= MessageLimits.MAX_TRANSLATION_LENGTH


def validate_audio_duration(duration_ms: int | None) -> tuple[bool, str | None]:
    """
    Valide la durée d'un audio à transcrire/traduire.

    Un `duration_ms` absent ou nul n'est PAS refusé ici : certains appelants
    legacy n'ont pas encore mesuré la durée au moment de l'envoi
    (`audioDurationMs` défaut à 0 dans zmq_audio_handler). Refuser sur
    l'absence transformerait une métadonnée manquante en refus de service.

    Returns:
        tuple[bool, str | None]: (is_valid, error_message)
    """
    if not duration_ms:
        return True, None

    if duration_ms > MessageLimits.MAX_AUDIO_DURATION_MS:
        max_seconds = MessageLimits.MAX_AUDIO_DURATION_MS // 1000
        got_seconds = duration_ms / 1000
        return False, (
            f"L'audio ne peut pas dépasser {max_seconds} secondes "
            f"({got_seconds:.0f} secondes fournies)"
        )

    return True, None


def should_convert_to_text_attachment(content: str) -> bool:
    """
    Vérifie si un message doit être converti en pièce jointe textuelle
    
    Returns:
        bool: True si le message doit être converti en pièce jointe
    """
    return len(content) > MessageLimits.MAX_TEXT_ATTACHMENT_THRESHOLD
