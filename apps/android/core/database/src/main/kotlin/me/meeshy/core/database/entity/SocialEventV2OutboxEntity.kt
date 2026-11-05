package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.Index

/**
 * Un événement social v2 en attente d'envoi (miroir de `SocialEventsV2Reporter` iOS). [payload] est le JSON conservé tel
 * quel, [owner] le compte propriétaire, [createdAt] ordonne la file et date la purge (72 h). La clé est ([owner], [eventId]) :
 * le même identifiant enfilé par un autre compte n'écrase jamais la ligne du premier.
 */
@Entity(
    tableName = "social_events_v2_outbox",
    primaryKeys = ["owner", "eventId"],
    indices = [Index(value = ["owner", "createdAt"])],
)
public data class SocialEventV2OutboxEntity(
    val eventId: String,
    val owner: String,
    val payload: String,
    val createdAt: Long,
)
