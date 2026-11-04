package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Un événement de comptage (vue, impression, ouverture, durée) en attente d'envoi, miroir de `ImpressionBatcher` iOS.
 *
 * Une ligne par événement, jamais un tableau réécrit en bloc. [eventId] est la clé : enfiler deux fois le même événement
 * n'en garde qu'un. [queueKey] (`source[.surface]`) sépare les files, [owner] le compte propriétaire (un événement ne
 * part jamais sous un autre compte). [payload] est le JSON conservé tel quel ; [kind] vaut view, impression, open, dwell
 * ou dwell-start.
 */
@Entity(
    tableName = "pending_counting_events",
    indices = [Index(value = ["owner", "queueKey", "createdAt"])],
)
public data class PendingCountingEventEntity(
    @PrimaryKey val eventId: String,
    val owner: String,
    val queueKey: String,
    val kind: String,
    val payload: String,
    val createdAt: Long,
)
