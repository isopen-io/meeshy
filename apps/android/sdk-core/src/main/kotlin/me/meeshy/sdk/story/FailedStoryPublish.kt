package me.meeshy.sdk.story

/**
 * A story publish that has **exhausted** its outbox retries — the building block
 * the tray turns into a "failed to post, tap to retry" affordance.
 *
 * Decoded from an `EXHAUSTED` `PUBLISH_STORY` outbox row by
 * [StoryRepository.failedPublishes]. It carries the [cmid] so a retry/discard can
 * target the exact row, and the [tempId] so the tray can tell a *failed* publish
 * apart from a *delivered* one (both vanish from the live pending queue, but only a
 * delivery should trigger a hand-off refresh). Pure data, no Android dependency.
 *
 * @property cmid the outbox primary key — the retry/discard target.
 * @property tempId the row's `pending_<uuid>` target id (matches the optimistic ring).
 * @property content the (non-blank) story text the user tried to publish.
 * @property visibility the wire visibility string (`PUBLIC` / `FRIENDS` / …).
 * @property originalLanguage the Prisme-resolved publish language, when known.
 * @property createdAtMillis when the publish was first enqueued.
 * @property failedAtMillis when the row last updated to `EXHAUSTED` (newest-first order).
 */
public data class FailedStoryPublish(
    val cmid: String,
    val tempId: String,
    val content: String,
    val visibility: String,
    val originalLanguage: String?,
    val createdAtMillis: Long,
    val failedAtMillis: Long,
)
