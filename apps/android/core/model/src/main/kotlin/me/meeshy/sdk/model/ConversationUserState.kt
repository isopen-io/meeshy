package me.meeshy.sdk.model

import kotlinx.serialization.json.JsonObject

/**
 * L'état PAR UTILISATEUR d'une conversation — port de `ConversationUserState`
 * (`packages/MeeshySDK/.../Models/ConversationUserState.swift`).
 *
 * Réunit en une valeur cohérente ce que la passerelle sert sous `UserConversationPreferences`,
 * les drapeaux locaux à l'appareil (verrou, brouillon) et les métadonnées de synchro qui
 * servent à arbitrer l'optimiste contre les diffusions socket. Les instants sont des chaînes
 * ISO 8601, comme partout sur la charge Android.
 */
data class ConversationUserState(
    val unreadCount: Int = 0,
    val lastReadAt: String? = null,
    val lastDeliveredAt: String? = null,
    /** Le curseur SERVEUR (distinct de [lastReadAt], l'horloge de l'ACTION de lecture). */
    val lastReadMessageId: String? = null,
    /** Clé chronologique du curseur, rang 1 de la loi du premier non lu. */
    val lastReadMessageCreatedAt: String? = null,
    val isPinned: Boolean = false,
    val isMuted: Boolean = false,
    val mentionsOnly: Boolean = false,
    val isArchived: Boolean = false,
    val deletedForUserAt: String? = null,
    val clearHistoryBefore: String? = null,
    val customName: String? = null,
    val reaction: String? = null,
    /** Fond et accent PERSONNELS de la conversation ; `null` = signature + accent calculé. */
    val appearance: JsonObject? = null,
    val tags: List<String> = emptyList(),
    val sectionId: String? = null,
    val orderInCategory: Int? = null,
    val isLocked: Boolean = false,
    val hasDraft: Boolean = false,
    val draftPreview: String? = null,
    /** Version monotone émise par la passerelle à chaque écriture de préférences. */
    val version: Int = 0,
    val lastSyncedAt: String? = null,
    /** Nombre d'entrées de file pour cette conversation ; > 0 = écriture en vol ou en attente. */
    val pendingMutationCount: Int = 0,
) {
    val hasUnreadIndicator: Boolean get() = unreadCount > 0
    val hasPendingSync: Boolean get() = pendingMutationCount > 0
    val isVisible: Boolean get() = deletedForUserAt == null && !isArchived

    /**
     * Greffe la moitié PRÉFÉRENCES de `this` sur [incoming], dont la moitié LECTURE
     * (compteur, `lastRead*`, `lastDeliveredAt`) est conservée : `version` ne versionne que les
     * préférences, préserver l'état local EN BLOC figerait aussi le compteur.
     */
    fun preferencesGrafted(onto: ConversationUserState): ConversationUserState = onto.copy(
        isPinned = isPinned,
        isMuted = isMuted,
        mentionsOnly = mentionsOnly,
        isArchived = isArchived,
        deletedForUserAt = deletedForUserAt,
        clearHistoryBefore = clearHistoryBefore,
        customName = customName,
        reaction = reaction,
        appearance = appearance,
        tags = tags,
        sectionId = sectionId,
        orderInCategory = orderInCategory,
        isLocked = isLocked,
        hasDraft = hasDraft,
        draftPreview = draftPreview,
        version = version,
        lastSyncedAt = lastSyncedAt,
        pendingMutationCount = pendingMutationCount,
    )

    companion object {
        val defaults: ConversationUserState = ConversationUserState()
    }
}

/**
 * Projette la ligne servie ([ApiConversation]) et les drapeaux locaux sur un [ConversationUserState].
 * Un brouillon n'est « significatif » que selon [isMeaningful] (texte non blanc ou réponse armée) ;
 * son aperçu est le texte rogné, jamais fabriqué.
 */
fun ApiConversation.toUserState(
    draft: ConversationDraft? = null,
    isLocked: Boolean = false,
    pendingMutationCount: Int = 0,
    lastSyncedAt: String? = null,
): ConversationUserState {
    val prefs = resolvedPreferences
    val meaningful = draft?.takeIf { it.isMeaningful }
    return ConversationUserState(
        unreadCount = unreadCount,
        lastReadAt = lastReadAt,
        lastDeliveredAt = lastDeliveredAt,
        lastReadMessageId = lastReadMessageId,
        lastReadMessageCreatedAt = lastReadMessageCreatedAt,
        isPinned = prefs?.isPinned ?: false,
        isMuted = prefs?.isMuted ?: false,
        mentionsOnly = prefs?.mentionsOnly ?: false,
        isArchived = prefs?.isArchived ?: false,
        deletedForUserAt = prefs?.deletedForUserAt,
        clearHistoryBefore = prefs?.clearHistoryBefore,
        customName = prefs?.customName,
        reaction = prefs?.reaction,
        tags = prefs?.tags ?: tags,
        sectionId = prefs?.categoryId,
        orderInCategory = prefs?.orderInCategory,
        isLocked = isLocked,
        hasDraft = meaningful != null,
        draftPreview = meaningful?.text?.trim()?.takeIf { it.isNotEmpty() },
        version = prefs?.version ?: 0,
        lastSyncedAt = lastSyncedAt,
        pendingMutationCount = pendingMutationCount,
    )
}
