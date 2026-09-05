package me.meeshy.sdk.notification

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiNotification

/**
 * Wire shapes + pure predicates for the notification-SYNC family of Socket.IO events —
 * `notification:read`, `notification:read-bulk`, `notification:deleted`,
 * `notification:deleted-bulk`, `notification:counts` (`SERVER_EVENTS`,
 * `packages/shared/types/socketio-events.ts`). `notification:new` is out of scope here — it
 * already has its own wire type ([ApiNotification] itself, decoded straight off the socket
 * payload) and its own listener in `MessageSocketManager`.
 *
 * Kept LOCAL to sdk-core (not `core/model`'s `SocketEvents.kt`, where every other socket wire
 * type lives) — these five are consumed exclusively by [MessageSocketManager] and
 * [NotificationRepository], the same two files this slice owns, and every field name below is
 * copied from the gateway's actual emit call (`NotificationService.ts`), not from a REST
 * response shape.
 */

/** `{ notificationId }` — `NOTIFICATION_READ` / `NOTIFICATION_DELETED` (`NotificationService.ts`). */
@Serializable
data class NotificationReadSocketEvent(val notificationId: String)

@Serializable
data class NotificationDeletedSocketEvent(val notificationId: String)

/**
 * Flat Kotlin mirror of the discriminated union `NotificationReadBulkScope`
 * (`packages/shared/types/notification.ts`). kotlinx.serialization decodes it without a custom
 * polymorphic serializer because the three members never collide on a field name — `kind`
 * alone routes [notificationMatchesReadBulkScope] to the right member below. A `kind` this
 * client does not recognize (a server ahead of it) decodes fine; the predicate is what fails
 * CLOSED on it, matching the shared TS contract's "matches nothing" fallback.
 */
@Serializable
data class NotificationReadBulkScope(
    val kind: String,
    val contextKey: String? = null,
    val contextValue: String? = null,
    val types: List<String>? = null,
)

@Serializable
data class NotificationReadBulkSocketEvent(val scope: NotificationReadBulkScope)

/** Single member today (`{ kind: 'read' }`) — mirrors `NotificationDeletedBulkScope` (shared). */
@Serializable
data class NotificationDeletedBulkScope(val kind: String)

@Serializable
data class NotificationDeletedBulkSocketEvent(val scope: NotificationDeletedBulkScope)

/** `{ unread, total }` — `NOTIFICATION_COUNTS`, the server-authoritative resync (`emitCountsUpdate`). */
@Serializable
data class NotificationCountsSocketEvent(val unread: Int, val total: Int)

/**
 * Kotlin mirror of `notificationMatchesReadBulkScope`
 * (`packages/shared/utils/notification-read-bulk.ts`) — the SAME predicate the gateway just
 * applied in its `updateMany`/`$runCommandRaw` bulk-read path, replayed here against the
 * client's cache since that path returns no ids to enumerate. Two web/iOS/Android caches
 * marking different rows for the "same" bulk action is exactly what a second local
 * reimplementation would risk, so this is a line-for-line port, not a reinvention.
 *
 * An unrecognized `kind` matches NOTHING: under-marking leaves a stale unread row that the
 * `notification:counts` emitted right after (and the next refetch) correct on their own;
 * over-marking would hide a row still unread server-side, with nothing left to un-hide it.
 */
fun notificationMatchesReadBulkScope(scope: NotificationReadBulkScope, notification: ApiNotification): Boolean =
    when (scope.kind) {
        "all" -> true
        "context" -> when (scope.contextKey) {
            "conversationId" -> notification.context?.conversationId == scope.contextValue
            "postId" -> notification.context?.postId == scope.contextValue
            "friendRequestId" -> notification.context?.friendRequestId == scope.contextValue
            else -> false
        }
        "types" -> scope.types?.contains(notification.type) == true
        else -> false
    }

/**
 * Kotlin mirror of `notificationMatchesDeletedBulkScope` (same shared file). The purge scope
 * interrogates the READ state, never the type or context — the gateway's only purge shape today
 * is "every already-read row" (`deleteMany({ userId, isRead: true })`).
 */
fun notificationMatchesDeletedBulkScope(scope: NotificationDeletedBulkScope, notification: ApiNotification): Boolean =
    when (scope.kind) {
        "read" -> notification.state.isRead
        else -> false
    }
