package me.meeshy.sdk.story

/**
 * A story publish that is still in flight on the durable outbox — the building
 * block the tray turns into an optimistic self-ring.
 *
 * Decoded from a live `PUBLISH_STORY` outbox row by
 * [StoryRepository.pendingPublishes]; an exhausted (rolled-back) row never
 * produces one. Pure data, no Android dependency.
 *
 * @property tempId the outbox row's `pending_<uuid>` target id (stable per publish).
 * @property content the (non-blank) story text the user queued.
 * @property visibility the wire visibility string (`PUBLIC` / `FRIENDS` / …).
 * @property originalLanguage the Prisme-resolved publish language, when known.
 * @property createdAtMillis when the publish was enqueued (drives newest-first order).
 */
public data class PendingStoryPublish(
    val tempId: String,
    val content: String,
    val visibility: String,
    val originalLanguage: String?,
    val createdAtMillis: Long,
)
