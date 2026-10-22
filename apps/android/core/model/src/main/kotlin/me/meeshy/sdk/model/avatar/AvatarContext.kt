package me.meeshy.sdk.model.avatar

/**
 * La loi des contextes d'avatar : UNE table pour la taille, l'anneau, l'humeur, les ombres et les
 * animations de chaque surface. Miroir de `AvatarContext` (MeeshyAvatar.swift) ; les tailles sont en
 * dp (== pt iOS), les rayons d'ombre aussi.
 *
 * Aucun appelant ne redéclare une taille ou un drapeau d'animation : il nomme son contexte.
 */
public sealed class AvatarContext {

    // Stories
    public data object StoryTray : AvatarContext()
    public data object StoryTrayCompact : AvatarContext()
    public data object StoryViewer : AvatarContext()
    public data object StoryViewerRow : AvatarContext()

    // Fil
    public data object FeedComposer : AvatarContext()
    public data object PostAuthor : AvatarContext()
    public data object PostComment : AvatarContext()
    public data object PostReaction : AvatarContext()

    // Messages
    public data object MessageBubble : AvatarContext()
    public data object TypingIndicator : AvatarContext()

    // Conversation
    public data object ConversationList : AvatarContext()
    public data object ConversationHeaderCollapsed : AvatarContext()
    public data object ConversationHeaderExpanded : AvatarContext()
    public data object ConversationHeaderStacked : AvatarContext()
    public data object RecentParticipant : AvatarContext()

    // Profil
    public data object ProfileBanner : AvatarContext()
    public data object ProfileEdit : AvatarContext()
    public data object ProfileSheet : AvatarContext()

    // Listes et notifications
    public data object UserListItem : AvatarContext()
    public data object Notification : AvatarContext()

    /** Taille libre, pour les surfaces qui n'ont pas (encore) de contexte nommé. */
    public data class Custom(val dp: Float) : AvatarContext()

    /** Diamètre du disque, en dp. */
    public val size: Float
        get() = when (this) {
            StoryTray -> 88f
            // 44 -> 36 : dans la barre repliée, un anneau de 44 plus son halo rognait le bas du sticker.
            StoryTrayCompact -> 36f
            StoryViewer, StoryViewerRow, ConversationHeaderCollapsed, ConversationHeaderExpanded,
            PostAuthor, UserListItem, Notification -> 44f
            ConversationList -> 52f
            MessageBubble -> 32f
            FeedComposer -> 36f
            PostComment, ConversationHeaderStacked -> 28f
            TypingIndicator -> 24f
            PostReaction, RecentParticipant -> 20f
            ProfileBanner -> 90f
            ProfileEdit, ProfileSheet -> 80f
            is Custom -> dp
        }

    public val showsStoryRing: Boolean
        get() = when (this) {
            StoryViewer, StoryViewerRow, PostComment, PostReaction, TypingIndicator, ProfileEdit -> false
            else -> true
        }

    public val showsMoodBadge: Boolean
        get() = when (this) {
            StoryViewer, PostComment, PostReaction, TypingIndicator, ProfileEdit, UserListItem, Notification -> false
            else -> true
        }

    public val isTappable: Boolean
        get() = when (this) {
            PostReaction, TypingIndicator -> false
            else -> true
        }

    /** Le point de présence pulse par défaut dans ces contextes (si l'appelant ne dit rien). */
    public val defaultPulse: Boolean
        get() = when (this) {
            MessageBubble, ConversationHeaderCollapsed, ConversationHeaderExpanded,
            ProfileBanner, ProfileSheet, is Custom -> true
            else -> false
        }

    /**
     * L'anneau de story non lue tourne en continu. Faux dans les contextes de liste et de fil, où
     * trente avatars visibles rendraient le défilement saccadé : le dégradé reste statique.
     */
    public val animatesStoryRing: Boolean
        get() = when (this) {
            StoryTray, StoryTrayCompact, StoryViewer, FeedComposer, PostAuthor,
            ProfileBanner, ProfileSheet, ProfileEdit, ConversationHeaderExpanded -> true
            else -> false
        }

    /**
     * La pastille d'humeur « respire ». JAMAIS en liste ni en en-tête de conversation : un ressort
     * infini par rangée pendant tout le défilement n'informe de rien.
     */
    public val animatesMoodBadge: Boolean
        get() = when (this) {
            StoryTray, StoryTrayCompact, FeedComposer, PostAuthor, ProfileBanner, ProfileSheet -> true
            else -> false
        }

    public val shadowRadius: Float
        get() = when (this) {
            // Une ombre sur un cercle force une passe hors écran PAR RANGÉE : zéro dans les listes.
            PostReaction, TypingIndicator, RecentParticipant, ConversationList -> 0f
            PostComment -> 2f
            MessageBubble, StoryViewer, StoryViewerRow, FeedComposer, UserListItem, Notification,
            ConversationHeaderStacked -> 4f
            ProfileBanner -> 12f
            else -> 8f
        }

    public val shadowY: Float
        get() = when (this) {
            PostReaction, TypingIndicator, RecentParticipant, ConversationList -> 0f
            PostComment -> 1f
            MessageBubble, ConversationHeaderStacked -> 2f
            else -> 4f
        }

    public val ringSize: Float get() = size + 6f

    public val initialFont: Float get() = size * 0.38f

    public val ringWidth: Float
        get() = when (this) {
            StoryTray -> 0.7f
            StoryTrayCompact -> 1.5f
            else -> if (size <= 32f) 1.5f else 2.5f
        }

    /** Diamètre de la pastille d'humeur : 0,42 x l'avatar, 32 fixe dans le plateau de stories. */
    public val badgeSize: Float
        get() = when (this) {
            StoryTray -> 32f
            else -> size * 0.42f
        }

    /** Diamètre du point « en ligne » dans ce contexte. */
    public val onlineDotSize: Float get() = AvatarPresenceDot.Presence(me.meeshy.sdk.model.PresenceState.ONLINE).diameter(size)

    public companion object {
        /** Les 20 contextes nommés, dans l'ordre de la table iOS ([Custom] exclu). */
        public val named: List<AvatarContext>
            get() = listOf(
            StoryTray, StoryTrayCompact, StoryViewer, StoryViewerRow,
            FeedComposer, PostAuthor, PostComment, PostReaction,
            MessageBubble, TypingIndicator,
            ConversationList, ConversationHeaderCollapsed, ConversationHeaderExpanded,
            ConversationHeaderStacked, RecentParticipant,
            ProfileBanner, ProfileEdit, ProfileSheet,
            UserListItem, Notification,
        )
    }
}

/** Le pair a-t-il l'écran de CETTE conversation ouvert, et que fait-il ? Miroir de `ConversationHere`. */
public enum class ConversationHere {
    ABSENT,
    HERE,

    /** Il regarde, écoute ou agit en ce moment. */
    ACTIVE,

    /** Il regarde un élément en plein écran. */
    FOCUSED,
    ;

    public val isHere: Boolean get() = this != ABSENT
    public val isActive: Boolean get() = this == ACTIVE || this == FOCUSED
    public val isFocused: Boolean get() = this == FOCUSED
}
