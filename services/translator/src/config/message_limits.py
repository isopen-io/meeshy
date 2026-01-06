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


def should_convert_to_text_attachment(content: str) -> bool:
    """
    Vérifie si un message doit être converti en pièce jointe textuelle
    
    Returns:
        bool: True si le message doit être converti en pièce jointe
    """
    return len(content) > MessageLimits.MAX_TEXT_ATTACHMENT_THRESHOLD
