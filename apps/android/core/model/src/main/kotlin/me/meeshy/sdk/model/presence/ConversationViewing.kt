package me.meeshy.sdk.model.presence

import kotlinx.serialization.Serializable

/**
 * « Est dans la conversation » (#8892, #9061, #9065), côté RÉCEPTION : qui a l'écran de quelle
 * conversation ouvert, tel que le serveur l'annonce par `viewing:start` / `viewing:stop` /
 * `viewing:activity` / `viewing:snapshot`. Miroir de `ConversationViewers.swift`.
 *
 * Hors de toute présence (`isOnline`, `lastActiveAt`) : la visibilité est décidée par la
 * passerelle ; le client ne prolonge ni ne fabrique rien.
 */

/** Ce qu'un avatar dit d'une personne dans UNE conversation. */
public enum class ConversationHere {
    ABSENT,
    HERE,
    ACTIVE,
    FOCUSED;

    public val isHere: Boolean get() = this != ABSENT
    public val isActive: Boolean get() = this == ACTIVE || this == FOCUSED
    public val isFocused: Boolean get() = this == FOCUSED
}

/** `viewing:start` / `viewing:stop` / `viewing:activity` reçus (`ViewingEvent`, presence.ts). */
@Serializable
public data class ViewingChange(
    val userId: String,
    val conversationId: String,
    val focus: Boolean = false,
)

/** `viewing:snapshot` : la liste COMPLÈTE des pairs déjà là. */
@Serializable
public data class ViewingSnapshot(
    val conversationId: String,
    val userIds: List<String> = emptyList(),
)

public sealed interface ViewingEvent {
    public data class Arrived(val change: ViewingChange) : ViewingEvent
    public data class Left(val change: ViewingChange) : ViewingEvent
    public data class Snapshot(val snapshot: ViewingSnapshot) : ViewingEvent
    public data class Active(val change: ViewingChange) : ViewingEvent

    /** Une nouvelle session socket : le serveur a oublié l'ancienne. */
    public data object SessionStarted : ViewingEvent
}

public data class ConversationHereRoster(
    val here: Set<String> = emptySet(),
    val active: Set<String> = emptySet(),
    val focused: Set<String> = emptySet(),
) {
    public operator fun get(userId: String): ConversationHere = when {
        userId !in here -> ConversationHere.ABSENT
        userId in focused -> ConversationHere.FOCUSED
        userId in active -> ConversationHere.ACTIVE
        else -> ConversationHere.HERE
    }
}

public data class ConversationViewers(
    val usersByConversation: Map<String, Set<String>> = emptyMap(),
    val activeByConversation: Map<String, Set<String>> = emptyMap(),
    val focusedByConversation: Map<String, Set<String>> = emptyMap(),
) {
    public fun usersIn(conversationId: String): Set<String> = usersByConversation[conversationId].orEmpty()

    public fun here(userId: String, conversationId: String): ConversationHere = roster(conversationId)[userId]

    public fun roster(conversationId: String): ConversationHereRoster = ConversationHereRoster(
        here = usersIn(conversationId),
        active = activeByConversation[conversationId].orEmpty(),
        focused = focusedByConversation[conversationId].orEmpty(),
    )

    public fun applying(event: ViewingEvent): ConversationViewers = when (event) {
        is ViewingEvent.Arrived -> replacing(
            event.change.conversationId,
            usersIn(event.change.conversationId) + event.change.userId,
        )
        is ViewingEvent.Left -> replacing(
            event.change.conversationId,
            usersIn(event.change.conversationId) - event.change.userId,
        ).resting(event.change.userId, event.change.conversationId)
        is ViewingEvent.Snapshot -> replacing(event.snapshot.conversationId, event.snapshot.userIds.toSet())
        is ViewingEvent.Active -> stirring(event.change.userId, event.change.conversationId, event.change.focus)
        ViewingEvent.SessionStarted -> ConversationViewers()
    }

    /** Chaque activité dit si elle vient d'un plein écran : une activité sans `focus` y met fin. */
    public fun stirring(userId: String, conversationId: String, focus: Boolean = false): ConversationViewers {
        val focused = roster(conversationId).focused
        return copy(
            activeByConversation = activeByConversation.with(conversationId, roster(conversationId).active + userId),
            focusedByConversation = focusedByConversation.with(conversationId, if (focus) focused + userId else focused - userId),
        )
    }

    public fun resting(userId: String, conversationId: String): ConversationViewers {
        val roster = roster(conversationId)
        return copy(
            activeByConversation = activeByConversation.with(conversationId, roster.active - userId),
            focusedByConversation = focusedByConversation.with(conversationId, roster.focused - userId),
        )
    }

    private fun replacing(conversationId: String, users: Set<String>): ConversationViewers =
        copy(usersByConversation = usersByConversation.with(conversationId, users))

    private fun Map<String, Set<String>>.with(conversationId: String, set: Set<String>): Map<String, Set<String>> =
        if (set.isEmpty()) this - conversationId else this + (conversationId to set)
}
