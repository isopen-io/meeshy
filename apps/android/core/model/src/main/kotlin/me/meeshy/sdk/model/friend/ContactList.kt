package me.meeshy.sdk.model.friend

import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestUser

/**
 * The filter a Contacts-list surface applies over the friend list. Port of the
 * iOS `ContactFilter` (`ContactsShared.swift`). [Phonebook] and [Affiliates]
 * are carried for parity but pass the list through unchanged today — their data
 * sources (device phonebook, affiliate graph) are not wired yet.
 */
enum class ContactFilter {
    All,
    Online,
    Offline,
    Phonebook,
    Affiliates,
}

/**
 * The best human-readable name for a friend: an explicit display name, else the
 * first/last name joined, else the username. Pure SSOT so every surface (list
 * cell, search matching, avatar seed) resolves the same label. Port of the iOS
 * `FriendRequestUser.name` computed property. Returns "" only when the record
 * genuinely carries no name at all — the UI decides any placeholder.
 */
val FriendRequestUser.resolvedName: String
    get() {
        displayName?.takeIf { it.isNotBlank() }?.let { return it }
        val full = listOfNotNull(firstName, lastName).joinToString(" ").trim()
        if (full.isNotBlank()) return full
        return username
    }

/** Result of reconciling the shown friend list against the live friendship cache. */
data class ContactReconcile(
    /** The shown list with anyone no longer a friend removed. */
    val friends: List<FriendRequestUser>,
    /** True when the cache knows a friend the list doesn't have a record for yet. */
    val needsRefetch: Boolean,
)

/**
 * Pure derivation SSOT for the Contacts (all-friends) list — port of the iOS
 * `ContactsListViewModel` derivation. Framework-agnostic and total so the
 * assembly, filtering and cache-reconciliation branches are unit-tested without
 * the ViewModel, the repository or the cache.
 */
object ContactList {

    /**
     * Assemble the accepted-friend list from the current user's received and
     * sent friend requests (the app has no dedicated `/friends` endpoint — the
     * friend graph is exactly the accepted requests, exactly like iOS).
     *
     * For each accepted request the counterparty is the party that is **not**
     * the current user (sender for received, receiver for sent, falling back to
     * the other side for malformed rows). Deduplicated by user id (first record
     * wins) and sorted online-first, then most-recently-active first.
     */
    fun fromAcceptedRequests(
        received: List<FriendRequest>,
        sent: List<FriendRequest>,
        currentUserId: String,
    ): List<FriendRequestUser> {
        val byId = LinkedHashMap<String, FriendRequestUser>()

        for (request in received) {
            if (request.status != ACCEPTED) continue
            counterparty(request.sender, request.receiver, currentUserId)?.let { byId.putIfAbsent(it.id, it) }
        }
        for (request in sent) {
            if (request.status != ACCEPTED) continue
            counterparty(request.receiver, request.sender, currentUserId)?.let { byId.putIfAbsent(it.id, it) }
        }

        return byId.values.sortedWith(onlineFirst)
    }

    /**
     * Apply a [ContactFilter] and a search query to an assembled friend list.
     * [Online]/[Offline] partition on presence; the query matches (case-insensitive,
     * trimmed) against the username or the [resolvedName]; a blank query matches all.
     */
    fun visible(
        friends: List<FriendRequestUser>,
        filter: ContactFilter,
        query: String,
    ): List<FriendRequestUser> {
        val byFilter = when (filter) {
            ContactFilter.Online -> friends.filter { it.isOnline == true }
            ContactFilter.Offline -> friends.filter { it.isOnline != true }
            ContactFilter.All, ContactFilter.Phonebook, ContactFilter.Affiliates -> friends
        }
        val needle = query.trim().lowercase()
        if (needle.isEmpty()) return byFilter
        return byFilter.filter {
            it.username.lowercase().contains(needle) || it.resolvedName.lowercase().contains(needle)
        }
    }

    /**
     * Reconcile a shown friend list against the authoritative in-memory friend
     * id set (the `FriendshipCache`). Removals are applied locally (drop anyone
     * the cache no longer lists); additions the list has no user record for flag
     * a silent refetch. Port of the iOS `reconcileWithCache`.
     */
    fun reconcile(
        current: List<FriendRequestUser>,
        cacheFriendIds: Set<String>,
    ): ContactReconcile {
        val kept = current.filter { cacheFriendIds.contains(it.id) }
        val currentIds = current.mapTo(mutableSetOf()) { it.id }
        val additions = cacheFriendIds.any { it !in currentIds }
        return ContactReconcile(friends = kept, needsRefetch = additions)
    }

    private fun counterparty(
        primary: FriendRequestUser?,
        fallback: FriendRequestUser?,
        currentUserId: String,
    ): FriendRequestUser? {
        primary?.takeIf { it.id != currentUserId }?.let { return it }
        return fallback?.takeIf { it.id != currentUserId }
    }

    private val onlineFirst: Comparator<FriendRequestUser> =
        compareByDescending<FriendRequestUser> { it.isOnline == true }
            .thenByDescending { it.lastActiveAt ?: "" }

    private const val ACCEPTED = "accepted"
}
