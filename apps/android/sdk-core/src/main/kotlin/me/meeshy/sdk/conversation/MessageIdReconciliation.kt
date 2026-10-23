package me.meeshy.sdk.conversation

import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.core.database.entity.PendingIdEntity
import me.meeshy.sdk.model.ClientIdFormat

/**
 * The link between an optimistic bubble and its server twin, and the one way to find a row by an
 * id that may be either of them (miroir de `PendingIdRecord` et de `MessagePersistenceActor+Reads`).
 *
 * The socket echo of a send can beat the REST ack, and an event can name the local `cid_` after
 * the row has been rekeyed to the server id. Both must land on the SAME row: [locate] searches in
 * three levels — the `pending_ids` bridge, the primary key, the `serverId` column — so a late
 * event never spawns a second bubble.
 */
internal object MessageIdReconciliation {

    /** Records `localId → serverId` once the gateway acked; ignores ids that are not a `cid_<uuid>`. */
    suspend fun recordAck(
        database: MeeshyDatabase,
        localId: String,
        serverId: String,
        conversationId: String,
        nowMillis: Long,
    ) {
        if (localId == serverId || !ClientIdFormat.isValidCid(localId)) return
        database.pendingIdDao().upsert(PendingIdEntity(localId, serverId, conversationId, nowMillis))
    }

    /** The row [id] designates, whichever of its two ids it is; `null` when no row matches. */
    suspend fun locate(database: MeeshyDatabase, id: String): MessageEntity? {
        val messages = database.messageDao()
        val pending = database.pendingIdDao()
        pending.byLocalId(id)?.let { bridge -> messages.find(bridge.serverId)?.let { return it } }
        messages.find(id)?.let { return it }
        return messages.findByServerId(id)
    }
}
