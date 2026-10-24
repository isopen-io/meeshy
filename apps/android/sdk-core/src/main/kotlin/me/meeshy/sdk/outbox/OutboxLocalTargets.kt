package me.meeshy.sdk.outbox

import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.model.ObjectIdGuard

/**
 * The ObjectId boundary of the outbox (#11609; iOS `ObjectID`, #4044).
 *
 * A local id (`cid_<uuid>`, `cmid_<uuid>`, `pending_<uuid>`) names something the server does not
 * know yet. Sent to a route that expects a document key it does not 404 — Prisma **throws**
 * (`P2023`, "Malformed ObjectID"), the gateway answers 500, and the row is retried five times
 * then exhausted for good: a like on a story still queued for publication would die that way.
 *
 * So a row whose [OutboxEntity.targetId] is a local id, and whose kind puts that id in a route,
 * is **held**: it stays `PENDING` with its attempt budget intact and is not offered to the
 * drainer ([OutboxRepository.deliverable]) until [OutboxRepository.resolveLocalId] swaps the
 * local id for the server's. Held rows still count as owed ([OutboxRepository.hasDeliverable])
 * and still coalesce.
 */
public object OutboxLocalTargets {

    /**
     * The kinds whose `targetId` is a server resource key placed in the request path (or body) —
     * the only ones a local id can poison.
     *
     * Deliberately absent:
     * - `SEND_MESSAGE` — its `targetId` is the conversation, which this client never mints
     *   locally; the message's OWN local id is the row key (`cid_`), carried in the body as
     *   `clientMessageId`, and that is exactly what the gateway is meant to receive;
     * - `PUBLISH_STORY` — its `pending_<uuid>` target is only a coalescing/optimism handle, the
     *   route (`POST /posts`) never reads it;
     * - `UPLOAD_MEDIA`, `UPDATE_PROFILE`, `UPDATE_SETTINGS`, `UPDATE_PRIVACY_SETTINGS` — their
     *   routes address the caller (the profile and preference endpoints), not the target.
     *
     * Held by NAME so a kind added later (end of the enum) and a row written by a newer build
     * that this build does not know both default to "not held" — the pre-existing behaviour.
     */
    private val routeAddressedKinds: Set<String> = setOf(
        OutboxKind.EDIT_MESSAGE,
        OutboxKind.DELETE_MESSAGE,
        OutboxKind.ADD_REACTION,
        OutboxKind.REMOVE_REACTION,
        OutboxKind.READ_RECEIPT,
        OutboxKind.MARK_UNREAD,
        OutboxKind.UPDATE_CONVERSATION_PREFS,
        OutboxKind.PIN_MESSAGE,
        OutboxKind.UNPIN_MESSAGE,
        OutboxKind.LIKE_POST,
        OutboxKind.UNLIKE_POST,
        OutboxKind.BOOKMARK_POST,
        OutboxKind.UNBOOKMARK_POST,
        OutboxKind.BLOCK_USER,
        OutboxKind.UNBLOCK_USER,
        OutboxKind.SEND_FRIEND_REQUEST,
        OutboxKind.RESPOND_FRIEND_REQUEST,
    ).map { it.name }.toSet()

    /** Whether [kind] sends its row's `targetId` to the server as a resource key. */
    public fun isRouteAddressed(kind: OutboxKind): Boolean = kind.name in routeAddressedKinds

    /** `true` when [row] must wait: route-addressed AND still pointing at a local id. */
    public fun isHeld(row: OutboxEntity): Boolean =
        row.kind in routeAddressedKinds && ObjectIdGuard.isLocalId(row.targetId)
}
