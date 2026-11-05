package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.Index

/**
 * Un événement de comptage (vue, impression, ouverture, durée) en attente d'envoi, miroir de `ImpressionBatcher` iOS.
 *
 * Une ligne par événement, jamais un tableau réécrit en bloc. La clé est ([owner], [eventId]) : enfiler deux fois le même
 * événement pour un compte n'en garde qu'un, et le même identifiant enfilé par un autre compte n'écrase jamais la ligne du
 * premier. [queueKey] (`source[.surface]`) sépare les files, [owner] le compte propriétaire (un événement ne part jamais
 * sous un autre compte). [payload] est le JSON conservé tel quel ; [kind] vaut view, impression, open, dwell
 * ou dwell-start.
 */
@Entity(
    tableName = "pending_counting_events",
    primaryKeys = ["owner", "eventId"],
    indices = [Index(value = ["owner", "queueKey", "createdAt"])],
)
public data class PendingCountingEventEntity(
    val eventId: String,
    val owner: String,
    val queueKey: String,
    val kind: String,
    val payload: String,
    val createdAt: Long,
)
