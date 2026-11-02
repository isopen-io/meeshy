package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * The bridge between an optimistic row and its server twin: [localId] is the `cid_<uuid minuscule>`
 * the send was filed under, [serverId] the id the gateway answered with. A socket echo that races
 * ahead of the REST ack resolves through this table instead of inserting a second row.
 */
@Entity(
    tableName = "pending_ids",
    indices = [Index("serverId")],
)
public data class PendingIdEntity(
    @PrimaryKey val localId: String,
    val serverId: String,
    val conversationId: String,
    val reconciledAt: Long?,
)
