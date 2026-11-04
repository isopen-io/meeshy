package me.meeshy.sdk.model.friend

import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.isoToEpochMillisOrNull

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

/**
 * La présence que la ligne du carnet a SERVIE (`isOnline` + `lastActiveAt`), ou `null` quand elle
 * n'en porte aucune : rien n'est fabriqué, la ligne ne donne alors aucun point. La surface la passe
 * à `rememberPresence`, qui la recoupe avec la carte vivante et la fait décroître avec l'horloge.
 */
fun FriendRequestUser.servedPresence(): UserPresence? = UserPresence.served(isOnline, lastActiveAt)

/**
 * The friend counts shown as a badge on each selectable Contacts filter chip
 * (port of the iOS chip counts). Computed over the roster with the active search
 * query applied, so each count reflects exactly how many friends that chip would
 * reveal right now. [online] and [offline] always partition [all].
 */
data class ContactFilterCounts(
    val all: Int,
    val online: Int,
    val offline: Int,
    val phonebook: Int = 0,
    val affiliates: Int = 0,
) {
    /**
     * The count a filter chip displays. [ContactFilter.Phonebook] and [ContactFilter.Affiliates]
     * count rows the friend roster does not hold (device phonebook, affiliate graph): their
     * numbers are INJECTED by the hub that owns those sources, 0 until it provides them.
     */
    fun forFilter(filter: ContactFilter): Int = when (filter) {
        ContactFilter.Online -> online
        ContactFilter.Offline -> offline
        ContactFilter.All -> all
        ContactFilter.Phonebook -> phonebook
        ContactFilter.Affiliates -> affiliates
    }

    /** The chip suffix « (n) » — hidden at 0, as on iOS. */
    fun badgeFor(filter: ContactFilter): Int? = forFilter(filter).takeIf { it > 0 }

    companion object {
        val Zero = ContactFilterCounts(all = 0, online = 0, offline = 0)
    }
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
     * Assemble the accepted-friend list from ONE `direction=any&status=accepted` listing
     * (`GET /directory/friend-requests`, read by cursor) — the friend graph is exactly the
     * accepted requests, there is no dedicated `/friends` endpoint. Port of the iOS
     * `FriendListAggregator.aggregate`.
     *
     * For each accepted request the counterparty is the party that is **not** the current
     * user, whichever side initiated (the sender when the user received it, the receiver
     * when the user sent it). A row with no such party is skipped, and the current user
     * is excluded defensively so a self-referencing request can never list them as their
     * own contact. Deduplicated by user id — the FIRST occurrence wins — and sorted
     * online-first, then most-recently-active first.
     */
    fun fromAcceptedRequests(
        requests: List<FriendRequest>,
        currentUserId: String,
    ): List<FriendRequestUser> {
        val byId = LinkedHashMap<String, FriendRequestUser>()
        for (request in requests) {
            if (request.status != ACCEPTED) continue
            counterparty(request.sender, request.receiver, currentUserId)?.let { byId.putIfAbsent(it.id, it) }
        }
        return byId.values.sortedWith(onlineFirst)
    }

    /**
     * The pre-cursor assembly from the two directional reads (`received` + `sent`).
     * Kept compilable while its consumers migrate to [fromAcceptedRequests] over a single
     * `direction=any` listing, which also sees the accepted relations the `received`
     * read never returned.
     */
    @Deprecated(
        message = "Read one direction=any listing and use fromAcceptedRequests(requests, currentUserId).",
        replaceWith = ReplaceWith("fromAcceptedRequests(received + sent, currentUserId)"),
    )
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
     * The per-filter friend counts for the chip badges. Each count is the size of
     * the roster that the corresponding [ContactFilter] would reveal under the
     * current search [query] — so `counts(friends, query).online` equals
     * `visible(friends, Online, query).size`. [online] and [offline] partition
     * [all] by construction (Offline is exactly "not online").
     */
    fun counts(
        friends: List<FriendRequestUser>,
        query: String,
        phonebook: Int = 0,
        affiliates: Int = 0,
    ): ContactFilterCounts {
        val matching = visible(friends, ContactFilter.All, query)
        val online = matching.count { it.isOnline == true }
        return ContactFilterCounts(
            all = matching.size,
            online = online,
            offline = matching.size - online,
            phonebook = phonebook.coerceAtLeast(0),
            affiliates = affiliates.coerceAtLeast(0),
        )
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

    /**
     * The roster caption under a row's @handle (iOS `ContactRow`): « En ligne » when the live
     * [state] is online, « Vu … » when a last-activity instant is served, nothing otherwise —
     * a presence the server withheld is never fabricated.
     */
    fun caption(state: me.meeshy.sdk.model.PresenceState?, lastActiveAt: String?, nowMillis: Long): ContactPresenceCaption {
        if (state == me.meeshy.sdk.model.PresenceState.ONLINE) return ContactPresenceCaption.Online
        val at = isoToEpochMillisOrNull(lastActiveAt) ?: return ContactPresenceCaption.None
        return ContactPresenceCaption.LastSeen(me.meeshy.sdk.model.PresenceLabels.lastSeen(at, nowMillis))
    }

    private fun counterparty(
        primary: FriendRequestUser?,
        fallback: FriendRequestUser?,
        currentUserId: String,
    ): FriendRequestUser? {
        primary?.takeIf { it.id != currentUserId }?.let { return it }
        return fallback?.takeIf { it.id != currentUserId }
    }

    /**
     * Online first, then the most recent activity. The activity is compared as an INSTANT
     * (an unparseable or absent stamp sorts last): two ISO strings in different offsets
     * do not order the same as text.
     */
    private val onlineFirst: Comparator<FriendRequestUser> =
        compareByDescending<FriendRequestUser> { it.isOnline == true }
            .thenByDescending { isoToEpochMillisOrNull(it.lastActiveAt) ?: Long.MIN_VALUE }

    private const val ACCEPTED = "accepted"
}

/** What a contact row says about presence under the handle. */
sealed interface ContactPresenceCaption {
    data object Online : ContactPresenceCaption
    data class LastSeen(val since: me.meeshy.sdk.model.PresenceLastSeen) : ContactPresenceCaption
    data object None : ContactPresenceCaption
}
