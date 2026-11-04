package me.meeshy.app.conversations

import me.meeshy.sdk.model.ConversationCreationEncryption
import me.meeshy.sdk.model.CreateConversationRequest
import me.meeshy.sdk.model.CreationEncryptionMode
import me.meeshy.sdk.model.CreationEncryptionOffer
import me.meeshy.sdk.model.DIRECT_CONVERSATION_TYPE
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.directConversationRequest
import me.meeshy.sdk.net.api.UserSearchResult

/**
 * One selectable user row in the "new conversation" picker.
 *
 * Pure UI projection of [UserSearchResult] — no Android types — so the
 * selection/creation rules can be unit-tested on the JVM.
 */
data class SelectableUser(
    val id: String,
    val displayName: String,
    val username: String,
    val avatarUrl: String?,
    val isOnline: Boolean,
    val lastActiveAt: String? = null,
    val isSelected: Boolean = false,
    /** Blocked by me: the row says « Blocked », dims, and cannot be picked (iOS `isBlocked`). */
    val isBlocked: Boolean = false,
) {
    /** La présence que la ligne a servie, recoupée par la carte vivante ; rien servi = aucun point. */
    val servedPresence: UserPresence?
        get() = UserPresence.served(isOnline, lastActiveAt)
}

/** What the selection draws: nothing yet, a direct, or a group (iOS `NewConversationShape`). */
enum class NewConversationShape { NONE, DIRECT, GROUP }

/**
 * Stateless rules behind the new-conversation flow (port of the iOS
 * `NewConversationViewModel` create logic). Kept pure so the debounce/search
 * ViewModel and the Compose screen never re-derive the type/title contract.
 */
object NewConversationLogic {
    const val TYPE_DIRECT: String = DIRECT_CONVERSATION_TYPE
    const val TYPE_GROUP: String = "group"

    /** A query shorter than this is not searched: the picker shows the contacts instead. */
    const val MIN_QUERY_LENGTH: Int = 2

    /**
     * The shape the sheet draws (iOS `NewConversationShape.resolve`): « Nouveau groupe » touched, or two
     * peers and more, make a group — even of myself alone (#14646); a single peer is a direct; nobody, nothing yet.
     */
    fun shape(selectedCount: Int, groupRequested: Boolean): NewConversationShape = when {
        groupRequested || selectedCount > 1 -> NewConversationShape.GROUP
        selectedCount == 1 -> NewConversationShape.DIRECT
        else -> NewConversationShape.NONE
    }

    /** The type that leaves with the request: only a direct shape is a direct. */
    fun conversationType(selectedCount: Int, groupRequested: Boolean = false): String =
        if (shape(selectedCount, groupRequested) == NewConversationShape.DIRECT) TYPE_DIRECT else TYPE_GROUP

    /** A direct is created at once; every group needs its title (iOS `NewConversationShape.canCreate`). */
    fun canCreate(selectedCount: Int, groupRequested: Boolean, rawTitle: String): Boolean =
        when (shape(selectedCount, groupRequested)) {
            NewConversationShape.NONE -> false
            NewConversationShape.DIRECT -> true
            NewConversationShape.GROUP -> rawTitle.isNotBlank()
        }

    /** Group conversations carry a user-typed title; direct chats derive theirs. */
    fun resolvedTitle(rawTitle: String, selectedCount: Int, groupRequested: Boolean = false): String? =
        rawTitle.trim().takeIf { it.isNotEmpty() && conversationType(selectedCount, groupRequested) == TYPE_GROUP }

    /**
     * Ce téléphone chiffre et lit le texte d'un tête-à-tête de bout en bout (libsignal, #14591) : l'écran de création
     * le propose aux rôles qui peuvent le choisir, comme iOS. Un groupe le montre toujours « bientôt ».
     */
    const val END_TO_END_SUPPORTED: Boolean = true

    /** Ce que la section Chiffrement propose pour [selectedCount] personnes choisies (`creationEncryptionOffer`). */
    fun encryptionOffer(platformRole: String?, selectedCount: Int, groupRequested: Boolean = false): CreationEncryptionOffer =
        ConversationCreationEncryption.offer(platformRole, conversationType(selectedCount, groupRequested), END_TO_END_SUPPORTED)

    /**
     * Le mode qui partira : celui que l'utilisateur a touché s'il reste DISPONIBLE dans l'offre
     * (un tête-à-tête devenu groupe retire le bout en bout), sinon le défaut de l'offre.
     */
    fun resolvedEncryptionMode(offer: CreationEncryptionOffer, picked: CreationEncryptionMode?): CreationEncryptionMode =
        picked?.takeIf { mode -> offer.choices.any { it.mode == mode && it.available } } ?: offer.defaultMode

    /**
     * The creation request for the picker's selection. A single peer is a DIRECT, built by the
     * very [directConversationRequest] that the story/mood reply and a profile's Message button
     * create through (`ConversationRepository.directConversationWith`, #11615) — so no two
     * entry points can ever describe a direct differently; any group shape (the switch, or two peers and more) is a group.
     * Seul cet écran choisit un mode de chiffrement : il part avec la demande, les autres
     * chemins n'en envoient aucun (la passerelle pose Serveur).
     */
    fun request(
        participantIds: List<String>,
        rawTitle: String,
        groupRequested: Boolean,
        encryptionMode: CreationEncryptionMode,
    ): CreateConversationRequest =
        (
            participantIds.singleOrNull()?.takeUnless { groupRequested }?.let(::directConversationRequest)
                ?: CreateConversationRequest(
                    type = conversationType(participantIds.size, groupRequested),
                    title = resolvedTitle(rawTitle, participantIds.size, groupRequested),
                    participantIds = participantIds,
                )
            ).copy(encryptionMode = encryptionMode.wire)

    fun displayName(result: UserSearchResult): String =
        result.displayName?.takeIf { it.isNotBlank() } ?: result.username

    /**
     * Project search results into selectable rows, flagging already-picked users. A user
     * served twice (offset pages shifting between two requests) keeps one row — the list
     * is keyed by id, a repeated key crashes Compose — and the signed-in user is never
     * offered (parity iOS `NewConversationViewModel`: `filter { $0.id != currentUserId }`).
     */
    fun rows(
        results: List<UserSearchResult>,
        selectedIds: Set<String>,
        signedInUserId: String? = null,
    ): List<SelectableUser> = results
        .distinctBy { it.id }
        .filterNot { it.id == signedInUserId }
        .map { result ->
            SelectableUser(
                id = result.id,
                displayName = displayName(result),
                username = result.username,
                avatarUrl = result.avatar,
                isOnline = result.isOnline == true,
                lastActiveAt = result.lastActiveAt,
                isSelected = result.id in selectedIds,
            )
        }

    /**
     * The « Your contacts » rows the picker opens on (iOS `NewConversationView.contactsSection`):
     * the accepted friends, in the roster's order, the signed-in user never offered.
     */
    fun contactRows(
        friends: List<FriendRequestUser>,
        selectedIds: Set<String>,
        signedInUserId: String? = null,
    ): List<SelectableUser> = friends
        .distinctBy { it.id }
        .filterNot { it.id == signedInUserId }
        .map { friend ->
            SelectableUser(
                id = friend.id,
                displayName = friend.displayName?.takeIf { it.isNotBlank() }
                    ?: listOfNotNull(friend.firstName, friend.lastName).joinToString(" ").takeIf { it.isNotBlank() }
                    ?: friend.username,
                username = friend.username,
                avatarUrl = friend.avatar,
                isOnline = friend.isOnline == true,
                lastActiveAt = friend.lastActiveAt,
                isSelected = friend.id in selectedIds,
            )
        }

    /** Marks the rows of [blockedIds] blocked — and unpicked, since a blocked user is never offered. */
    fun withBlocked(rows: List<SelectableUser>, blockedIds: Set<String>): List<SelectableUser> =
        rows.map { row ->
            val blocked = row.id in blockedIds
            row.copy(isBlocked = blocked, isSelected = row.isSelected && !blocked)
        }

    /**
     * The label a screen reader hears for a row (iOS `userRowAccessibilityLabel`): name, @username, then the status
     * the colour alone would carry — « Blocked », else « online » — so nothing rides on the dot or the dimming.
     */
    fun rowAccessibilityLabel(user: SelectableUser, isOnlineNow: Boolean, blockedLabel: String, onlineLabel: String): String =
        buildList {
            add(user.displayName)
            add("@${user.username}")
            if (user.isBlocked) add(blockedLabel) else if (isOnlineNow) add(onlineLabel)
        }.joinToString(", ")

    /** A row can be picked unless I blocked its user. */
    fun isSelectable(user: SelectableUser): Boolean = !user.isBlocked
}
