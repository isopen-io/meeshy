package me.meeshy.core.database.entity

import androidx.room.Entity

/**
 * Une tentative d'envoi d'un message sortant. Clé (localId, attemptNumber) : le numéro est monotone par message et
 * l'écriture ne peut pas doubler une tentative. Le journal est conservé après l'accusé du serveur.
 */
@Entity(
    tableName = "send_attempts",
    primaryKeys = ["localId", "attemptNumber"],
)
public data class SendAttemptEntity(
    val localId: String,
    val attemptNumber: Int,
    val transport: String,
    val startedAt: Long,
    val finishedAt: Long?,
    val outcome: String,
    val errorMessage: String?,
)
