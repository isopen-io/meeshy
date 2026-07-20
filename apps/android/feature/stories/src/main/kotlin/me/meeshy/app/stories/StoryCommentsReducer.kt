package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryComment
import me.meeshy.sdk.model.StoryCommentStatus

/**
 * Pure reconciliation for the story comments overlay. The list renders
 * chronologically (oldest first, newest at the bottom — chat order); optimistic
 * rows that are not yet acknowledged keep their insertion order at the tail so a
 * background refresh never drops an unsent comment.
 *
 * This is the "when/how to reconcile" product rule, so it lives in `:feature:stories`,
 * not the SDK. Every transition is a pure function over the immutable list.
 */
object StoryCommentsReducer {

    /**
     * Folds a freshly loaded server page into the current list: server comments
     * (deduped by id, oldest-first) form the acknowledged section, while optimistic
     * rows still in flight (Pending/Failed and not yet present on the server) are
     * kept at the tail.
     */
    fun merged(current: List<StoryComment>, loaded: List<StoryComment>): List<StoryComment> {
        val serverById = loaded.associateBy { it.id }
        val sorted = serverById.values.sortedWith(byCreatedAt)
        val pendingTail = current.filter {
            it.status != StoryCommentStatus.Sent && it.id !in serverById
        }
        return sorted + pendingTail
    }

    /** Appends an optimistic comment to the tail. */
    fun posting(current: List<StoryComment>, optimistic: StoryComment): List<StoryComment> =
        current + optimistic

    /**
     * Reconciles a server ACK: the optimistic row carrying [clientId] becomes the
     * acknowledged [server] comment. If the realtime echo already delivered that
     * server comment (same id), the optimistic duplicate is removed instead. An ACK
     * for an unknown client id is appended only when its id is not already present.
     */
    fun confirmed(
        current: List<StoryComment>,
        clientId: String,
        server: StoryComment,
    ): List<StoryComment> {
        val echoAlreadyPresent = current.any { it.id == server.id && it.clientId == null }
        if (echoAlreadyPresent) {
            return current.filterNot { it.clientId == clientId }
        }
        val index = current.indexOfFirst { it.clientId == clientId }
        if (index < 0) {
            return if (current.any { it.id == server.id }) current else current + server
        }
        return current.toMutableList().apply { set(index, server) }
    }

    /** Marks the optimistic row carrying [clientId] as failed; inert when unknown. */
    fun failed(current: List<StoryComment>, clientId: String): List<StoryComment> =
        current.map {
            if (it.clientId == clientId) it.copy(status = StoryCommentStatus.Failed) else it
        }

    /** Appends a realtime [incoming] comment, deduped by id (inert if already shown). */
    fun received(current: List<StoryComment>, incoming: StoryComment): List<StoryComment> =
        if (current.any { it.id == incoming.id }) current else current + incoming

    private val byCreatedAt: Comparator<StoryComment> =
        compareBy({ it.createdAt == null }, { it.createdAt })
}
