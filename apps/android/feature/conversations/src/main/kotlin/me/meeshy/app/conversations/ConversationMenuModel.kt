package me.meeshy.app.conversations

import me.meeshy.sdk.model.conversationlist.ConversationRowMenuCapabilities

/** Le retour haptique d'une entrée : lourd pour ce qui retire, moyen pour ce qui change l'état, léger sinon. */
internal enum class ConversationMenuHaptic { LIGHT, MEDIUM, HEAVY }

/** Les cinq sections du menu d'une rangée, dans l'ordre où elles se lisent. */
internal enum class ConversationMenuSection {
    /** Épingler · Silence · Lu : la tête compacte, trois tuiles. */
    HEADER,
    /** Ouvrir la conversation autrement : ses détails, en tête de la liste (#17244). */
    REACH,
    /** Ce qui s'atteint d'un geste : profil, membres, brouillon (#17697, règle 6). */
    ORGANIZE,
    /** « Plus » : le rare, rangé derrière un panneau ; chaque entrée reste atteignable (#17697). */
    MORE,
    /** Ce qui la retire, en dernier. */
    DEPARTURE;

    /** Un trait sépare la section de la précédente, sauf la tête et ce qui la suit. */
    val opensWithDivider: Boolean get() = this != HEADER && this != REACH
}

/**
 * UNE entrée du menu d'une rangée : un verbe, son haptique, son rouge. Une bascule (épingler /
 * désépingler) est deux entrées, chacune dit ce que le geste FERA. Miroir de `ConversationMenuEntry`
 * (`ConversationMenuCatalog.swift`).
 */
internal enum class ConversationMenuEntry(
    val haptic: ConversationMenuHaptic = ConversationMenuHaptic.LIGHT,
    val isDestructive: Boolean = false,
    val opensSubmenu: Boolean = false,
) {
    PIN(ConversationMenuHaptic.MEDIUM),
    UNPIN(ConversationMenuHaptic.MEDIUM),
    MUTE,
    UNMUTE,
    MARK_READ,
    MARK_UNREAD,
    READING_MODE(opensSubmenu = true),
    DETAILS,
    VIEW_PROFILE,
    RENAME,
    MANAGE_MEMBERS,
    FAVORITE(opensSubmenu = true),
    TAGS,
    MOVE(opensSubmenu = true),
    MENTIONS_ONLY,
    ALL_NOTIFICATIONS,
    DISCARD_DRAFT,
    INVITE(ConversationMenuHaptic.MEDIUM),
    LOCK(ConversationMenuHaptic.MEDIUM),
    UNLOCK(ConversationMenuHaptic.MEDIUM),
    ARCHIVE(ConversationMenuHaptic.MEDIUM),
    UNARCHIVE(ConversationMenuHaptic.MEDIUM),
    BLOCK(ConversationMenuHaptic.HEAVY, isDestructive = true),
    UNBLOCK(ConversationMenuHaptic.HEAVY),
    REPORT,
    ADMIN_OPEN,
    LEAVE(ConversationMenuHaptic.HEAVY, isDestructive = true),
    DELETE(ConversationMenuHaptic.HEAVY, isDestructive = true),
    HIDE(ConversationMenuHaptic.HEAVY, isDestructive = true),
    DELETE_FOR_ALL(ConversationMenuHaptic.HEAVY, isDestructive = true),
    MAKE_OBSOLETE(ConversationMenuHaptic.HEAVY, isDestructive = true),
}

/** Une section non vide et ses entrées. */
internal data class ConversationMenuGroup(
    val section: ConversationMenuSection,
    val entries: List<ConversationMenuEntry>,
)

/**
 * Ce que l'hôte de navigation sait ouvrir. Une destination absente retire son entrée : jamais une
 * action morte.
 */
internal data class ConversationMenuDestinations(
    val details: Boolean = false,
    val profile: Boolean = false,
    val manageMembers: Boolean = false,
    val admin: Boolean = false,
)

/** Ce que le catalogue lit : les verdicts de la loi, l'état de la rangée et les destinations. */
internal data class ConversationMenuInput(
    val capabilities: ConversationRowMenuCapabilities,
    val isPinned: Boolean,
    val isMuted: Boolean,
    val mentionsOnly: Boolean,
    val hasUnread: Boolean,
    val hasDraft: Boolean,
    val isLocked: Boolean,
    val isArchived: Boolean,
    /** `null` : pas un direct à pair connu, donc personne à bloquer. */
    val isPeerBlocked: Boolean?,
    val isCreator: Boolean,
    val destinations: ConversationMenuDestinations = ConversationMenuDestinations(),
    /** Le lot des modes de lecture remplit l'emplacement ; sans lui, rien n'est proposé. */
    val offersReadingModes: Boolean = false,
)

/**
 * LE menu d'une rangée, calculé une fois depuis [ConversationRowMenuCapabilities] : le composable
 * ne porte aucune condition, il parcourt [groups] dans l'ordre. Miroir de `ConversationMenuCatalog.make`.
 */
internal data class ConversationMenuModel(
    val header: List<ConversationMenuEntry>,
    val reach: List<ConversationMenuEntry>,
    val organize: List<ConversationMenuEntry>,
    val more: List<ConversationMenuEntry>,
    val departure: List<ConversationMenuEntry>,
) {
    val groups: List<ConversationMenuGroup>
        get() = listOf(
            ConversationMenuGroup(ConversationMenuSection.HEADER, header),
            ConversationMenuGroup(ConversationMenuSection.REACH, reach),
            ConversationMenuGroup(ConversationMenuSection.ORGANIZE, organize),
            ConversationMenuGroup(ConversationMenuSection.MORE, more),
            ConversationMenuGroup(ConversationMenuSection.DEPARTURE, departure),
        ).filter { it.entries.isNotEmpty() }

    val entries: List<ConversationMenuEntry> get() = groups.flatMap { it.entries }

    /** Le menu sans sa rangée de tête : ce que l'appui long révèle sous [ConversationQuickActions] (#17244). */
    fun withoutQuickActions(): ConversationMenuModel = copy(header = emptyList())

    companion object {
        fun make(input: ConversationMenuInput): ConversationMenuModel {
            val law = input.capabilities
            val dest = input.destinations
            return ConversationMenuModel(
                header = listOf(
                    if (input.isPinned) ConversationMenuEntry.UNPIN else ConversationMenuEntry.PIN,
                    if (input.isMuted) ConversationMenuEntry.UNMUTE else ConversationMenuEntry.MUTE,
                    if (input.hasUnread) ConversationMenuEntry.MARK_READ else ConversationMenuEntry.MARK_UNREAD,
                ),
                reach = offered(
                    ConversationMenuEntry.DETAILS to dest.details,
                ),
                organize = offered(
                    ConversationMenuEntry.VIEW_PROFILE to dest.profile,
                    ConversationMenuEntry.MANAGE_MEMBERS to (dest.manageMembers && law.offersManageMembers(input.isLocked)),
                    ConversationMenuEntry.DISCARD_DRAFT to input.hasDraft,
                ),
                more = offered(
                    ConversationMenuEntry.READING_MODE to input.offersReadingModes,
                    ConversationMenuEntry.RENAME to law.rename,
                    ConversationMenuEntry.FAVORITE to true,
                    ConversationMenuEntry.TAGS to true,
                    ConversationMenuEntry.MOVE to true,
                    (if (input.mentionsOnly) ConversationMenuEntry.ALL_NOTIFICATIONS else ConversationMenuEntry.MENTIONS_ONLY) to !input.isMuted,
                    ConversationMenuEntry.INVITE to law.invite,
                    (if (input.isLocked) ConversationMenuEntry.UNLOCK else ConversationMenuEntry.LOCK) to true,
                    (if (input.isArchived) ConversationMenuEntry.UNARCHIVE else ConversationMenuEntry.ARCHIVE) to
                        law.canToggleArchive,
                    (if (input.isPeerBlocked == true) ConversationMenuEntry.UNBLOCK else ConversationMenuEntry.BLOCK) to
                        (input.isPeerBlocked != null),
                    ConversationMenuEntry.REPORT to law.report,
                    ConversationMenuEntry.ADMIN_OPEN to (law.adminOpen && dest.admin),
                ),
                departure = offered(
                    ConversationMenuEntry.LEAVE to law.leave,
                    ConversationMenuEntry.DELETE to (law.removal == ConversationRowMenuCapabilities.Removal.DELETE),
                    ConversationMenuEntry.HIDE to (law.removal == ConversationRowMenuCapabilities.Removal.HIDE),
                    ConversationMenuEntry.DELETE_FOR_ALL to (input.isCreator && law.deleteForAll),
                    ConversationMenuEntry.MAKE_OBSOLETE to law.obsolete,
                ),
            )
        }

        private fun offered(vararg candidates: Pair<ConversationMenuEntry, Boolean>): List<ConversationMenuEntry> =
            candidates.filter { it.second }.map { it.first }
    }
}
