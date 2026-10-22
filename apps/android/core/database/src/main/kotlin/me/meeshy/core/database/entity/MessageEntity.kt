package me.meeshy.core.database.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * A cached message of a conversation (ARCHITECTURE.md §4, §6; ADR-004).
 *
 * `payload` stays the whole serialized `ApiMessage` — every block the gateway serves (reply,
 * forward, call summary, system notice, sticker, place, tracked links, sender, ring) round-trips
 * through it. The other columns exist for what SQL must see without decoding it, or for what the
 * server does not know and a REST refresh must therefore never erase.
 *
 * Queryable columns, derived from the payload on every write (retention, FTS, pins, ephemerals):
 * [serverId], [senderId], [messageType], [deletedAt], [expiresAt], [pinnedAt], [isEncrypted],
 * [contentText], [deliveredCount], [readCount], [recipientCount].
 *
 * Local columns, owned by this device and carried over a REST refresh: [retryCount],
 * [lastError], [viewOnceOpenedAt], [changeVersion].
 *
 * @property id server id, or the optimistic `cid_<uuid>` until the send is acked.
 * @property seq the per-conversation server sequence number (ADR-021) — the
 *   intended sort key; `null` until the gateway exposes it, so the list
 *   currently falls back to [createdAt] ordering.
 * @property payload the serialized `ApiMessage`.
 * @property sendState `null` for server-acked rows; `SENDING` / `FAILED` for
 *   optimistic local rows whose `id` is still the outbox `cmid`.
 * @property serverId the gateway id; `null` while the row is still optimistic.
 * @property contentText the plain text the local search may index; `null` for an encrypted or
 *   text-less message — never a ciphertext.
 * @property encryptedPayload the E2EE ciphertext, kept verbatim; the clear text is never written.
 * @property viewOnceOpenedAt the instant THIS reader opened a view-once message; permanent.
 * @property changeVersion bumped by every write the UI must notice; memoizes the row mapper.
 * @property columnsBackfilled `0` for a row written before the columns existed, until
 *   the Kotlin backfill derives them from the payload.
 */
@Entity(
    tableName = "messages",
    indices = [
        Index("conversationId"),
        Index("serverId"),
        Index("expiresAt"),
        Index("pinnedAt"),
    ],
)
public data class MessageEntity(
    @PrimaryKey val id: String,
    val conversationId: String,
    val seq: Long?,
    val payload: String,
    val createdAt: Long,
    val cachedAt: Long,
    val sendState: String? = null,
    val serverId: String? = null,
    val senderId: String? = null,
    @ColumnInfo(defaultValue = "'text'") val messageType: String = "text",
    val deletedAt: Long? = null,
    val expiresAt: Long? = null,
    val pinnedAt: Long? = null,
    @ColumnInfo(defaultValue = "0") val isEncrypted: Boolean = false,
    val encryptionMode: String? = null,
    val encryptedPayload: String? = null,
    val contentText: String? = null,
    @ColumnInfo(defaultValue = "0") val deliveredCount: Int = 0,
    @ColumnInfo(defaultValue = "0") val readCount: Int = 0,
    @ColumnInfo(defaultValue = "0") val recipientCount: Int = 0,
    @ColumnInfo(defaultValue = "0") val retryCount: Int = 0,
    val lastError: String? = null,
    val viewOnceOpenedAt: Long? = null,
    @ColumnInfo(defaultValue = "0") val changeVersion: Long = 0L,
    @ColumnInfo(defaultValue = "0") val columnsBackfilled: Boolean = false,
) {
    /** The same row after a write the UI must notice. */
    public fun bumped(): MessageEntity = copy(changeVersion = changeVersion + 1)

    /** The same row seen again from the server: derived columns replaced, local columns kept. */
    public fun carryingLocalColumnsOf(previous: MessageEntity?): MessageEntity =
        if (previous == null) {
            this
        } else {
            copy(
                retryCount = previous.retryCount,
                lastError = previous.lastError,
                viewOnceOpenedAt = previous.viewOnceOpenedAt ?: viewOnceOpenedAt,
                changeVersion = previous.changeVersion + 1,
            )
        }
}
