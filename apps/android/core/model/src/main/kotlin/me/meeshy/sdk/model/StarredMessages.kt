package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * The kind of attachment a starred message carries, kept beside the text preview
 * so a starred-messages list can badge a media-only message (parity with iOS
 * `StarredMessageSnapshot.attachmentKind`). `null` = a plain text message.
 */
@Serializable
enum class StarredAttachmentKind {
    IMAGE,
    FILE,
}

/**
 * A frozen snapshot of a starred (bookmarked) message — port of iOS
 * `StarredMessageSnapshot`. Starring is **local-only** (the gateway has no
 * message-star endpoint), so this is everything a starred-messages list needs to
 * render a row and navigate back to its conversation without re-fetching:
 * the conversation identity + accent, the sender, a text preview, an optional
 * attachment badge, and the two timestamps.
 *
 * [starredAtMillis] is stamped by the caller's clock at star time (epoch millis)
 * so ordering is a pure numeric compare — no instant parsing. [sentAtIso] is the
 * source message's `createdAt` (display only).
 */
@Serializable
data class StarredMessage(
    val messageId: String,
    val conversationId: String,
    val conversationName: String? = null,
    val conversationAccentColor: String? = null,
    val senderName: String? = null,
    val contentPreview: String = "",
    val attachmentKind: StarredAttachmentKind? = null,
    val starredAtMillis: Long = 0L,
    val sentAtIso: String? = null,
)

/**
 * Immutable set of starred-message snapshots — the pure SSOT for star membership
 * and ordering, kept fully JVM-testable while the store below owns only bytes
 * (mirrors [LocallyHiddenMessages] / [me.meeshy.sdk.model.ConversationDraft]).
 *
 * Every mutator returns the **same instance** when nothing changes, so the
 * persistence layer can skip a redundant write on a referential check
 * (mirrors iOS's `guard inserted else return`).
 */
data class StarredMessages(val items: List<StarredMessage> = emptyList()) {

    /** Fast membership lookup, computed once per instance (not part of equality). */
    val ids: Set<String> = items.mapTo(LinkedHashSet(items.size)) { it.messageId }

    fun isStarred(messageId: String): Boolean = messageId in ids

    /** The snapshots newest-star first (stable ties keep insertion order). */
    val sortedByStarredAtDesc: List<StarredMessage>
        get() = items.sortedByDescending { it.starredAtMillis }

    /**
     * Star [snapshot]. Idempotent per `messageId` — re-starring keeps the first
     * snapshot untouched — and inert for a blank id; both return `this`.
     */
    fun star(snapshot: StarredMessage): StarredMessages =
        if (snapshot.messageId.isBlank() || snapshot.messageId in ids) this
        else StarredMessages(items + snapshot)

    /** Unstar [messageId]. Inert (returns `this`) when it is not starred. */
    fun unstar(messageId: String): StarredMessages =
        if (messageId !in ids) this
        else StarredMessages(items.filterNot { it.messageId == messageId })

    /** Toggle [snapshot]: unstar if already starred (by id), else star it. */
    fun toggle(snapshot: StarredMessage): StarredMessages =
        if (snapshot.messageId in ids) unstar(snapshot.messageId) else star(snapshot)

    /**
     * Drop every snapshot belonging to [conversationId] — used when a whole
     * conversation is cleared/left so its stars don't dangle. Inert when none
     * match.
     */
    fun removeConversation(conversationId: String): StarredMessages =
        if (items.none { it.conversationId == conversationId }) this
        else StarredMessages(items.filterNot { it.conversationId == conversationId })
}
