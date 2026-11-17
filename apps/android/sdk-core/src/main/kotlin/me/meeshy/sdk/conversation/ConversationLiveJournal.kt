package me.meeshy.sdk.conversation

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.conversationlist.ConversationLiveFacet

/**
 * #18926 — the live writes on list rows, FACET BY FACET, recorded while a REST sweep of the list flies: its page, built
 * before them, lands over everything except what they moved ([me.meeshy.sdk.model.conversationlist.ConversationLiveFacets]).
 *
 * A writer records INSIDE its Room transaction, and the sweep reads the journal inside its own: SQLite serializes them, so a
 * live write either lands before the sweep's read (recorded, kept) or after the sweep's write (applied on top of it) —
 * never lost between the two. Nothing is recorded while no sweep flies.
 */
@Singleton
class ConversationLiveJournal @Inject constructor() {
    private val lock = Any()
    private var flights: Map<Long, Map<String, Set<ConversationLiveFacet>>> = emptyMap()
    private var opened = 0L

    /** A sweep starts: what is written live from now on is journaled for it. */
    fun open(): Long = synchronized(lock) {
        opened += 1
        flights = flights + (opened to emptyMap())
        opened
    }

    fun record(conversationId: String, facets: Set<ConversationLiveFacet>) {
        if (facets.isEmpty()) return
        synchronized(lock) {
            if (flights.isEmpty()) return
            flights = flights.mapValues { (_, moved) -> moved + (conversationId to (moved[conversationId].orEmpty() + facets)) }
        }
    }

    /** What was written live, per conversation, since [flight] opened. */
    fun moved(flight: Long): Map<String, Set<ConversationLiveFacet>> = synchronized(lock) { flights[flight].orEmpty() }

    fun close(flight: Long) {
        synchronized(lock) { flights = flights - flight }
    }
}
