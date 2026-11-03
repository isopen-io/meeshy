package me.meeshy.sdk.model

/**
 * Le dernier échec d'écriture d'un brouillon (iOS `PersistFailure`). [draftWasEverWritten] distingue un brouillon JAMAIS
 * écrit (rien à reprendre : l'auteur doit être prévenu) d'un brouillon dont seule la dernière sauvegarde a manqué (la
 * version précédente tient encore).
 */
public data class StoryDraftPersistFailure(
    val operation: String,
    val message: String,
    val occurredAtMillis: Long,
    val draftWasEverWritten: Boolean,
)
