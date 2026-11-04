package me.meeshy.core.database.entity

import androidx.room.Entity

/**
 * Une traduction de texte déjà reçue, unique par (message, langue) : l'index unique est la clé primaire. [messageId]
 * est l'identifiant canonique du message (le serveur quand il est connu), [language] est normalisée en minuscules.
 */
@Entity(
    tableName = "message_translations",
    primaryKeys = ["messageId", "language"],
)
public data class MessageTranslationEntity(
    val messageId: String,
    val language: String,
    val content: String,
    val sourceLanguage: String,
    val model: String?,
    val confidence: Double?,
    val updatedAt: Long,
)
