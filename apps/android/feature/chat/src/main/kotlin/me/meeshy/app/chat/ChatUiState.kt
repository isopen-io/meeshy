package me.meeshy.app.chat

import me.meeshy.sdk.composer.ComposerAffordances
import me.meeshy.sdk.composer.ComposerAttachmentPolicy
import me.meeshy.sdk.composer.SlowModePolicy
import me.meeshy.sdk.composer.SlowModeState
import me.meeshy.sdk.mention.MentionAutocompleteState
import me.meeshy.sdk.model.ActiveLiveLocation
import me.meeshy.sdk.model.ComposerLanguage
import me.meeshy.sdk.model.ComposerLanguageState
import me.meeshy.sdk.model.EmojiCatalog
import me.meeshy.sdk.model.LiveLocationEventFold
import me.meeshy.sdk.model.LiveLocationSessions
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.ParticipantPermissions
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.SentimentAnalyzer
import me.meeshy.sdk.model.SentimentLevel
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.UserStatusEvent
import me.meeshy.sdk.model.call.ActiveCallSession
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.MessageLanguageExplorer

/**
 * The conversation screen's single immutable state, exposed by [ChatViewModel.state].
 *
 * Frozen shape: no lot adds a field here. A feature that needs state of its own ships a
 * [ChatController] holding its own `StateFlow` (contributed through the `@IntoSet`
 * multibinding of [ChatControllerModule]); the screen collects it next to this one.
 * [ChatUiStateDefaultsTest] pins the stored fields and their defaults.
 */
data class ChatUiState(
    /** This conversation's id — lets header actions (e.g. the admin settings sheet)
     * bind a sibling ViewModel without re-reading the nav argument. */
    val conversationId: String = "",
    val messages: List<BubbleContent> = emptyList(),
    /** L'appel encore actif serveur-side pour CETTE conversation (probe REST
     * active-call) — alimente la pill « Rejoindre » du header (parité iOS
     * b69509366 / bulle call-live web) après un crash/relaunch mid-call. Null
     * quand aucun appel n'est en cours ou que la sonde échoue. */
    val activeCall: ActiveCallSession? = null,
    val draft: String = "",
    val draftRevision: Int = 0,
    val isSyncing: Boolean = false,
    val showSkeleton: Boolean = false,
    val errorMessage: String? = null,
    val typingParticipants: List<TypingParticipant> = emptyList(),
    val conversationTitle: String? = null,
    val memberCount: Int = 0,
    val isGroup: Boolean = false,
    val accentColorHex: String? = null,
    val actionMessageId: String? = null,
    val emojiPickerMessageId: String? = null,
    val quickReactions: List<String> = EmojiCatalog.defaultQuickReactions,
    val editingMessageId: String? = null,
    val replyingToMessageId: String? = null,
    val ownReactions: Map<String, Set<String>> = emptyMap(),
    val isLoadingOlder: Boolean = false,
    val hasMoreOlder: Boolean = true,
    val imageViewer: ConversationGallery? = null,
    val scrollToMessageId: String? = null,
    /** The first unread message's id — the "new messages" boundary, latched once
     * from the initial unread count captured before the conversation is marked
     * read (null = nothing unread on open). */
    val firstUnreadMessageId: String? = null,
    /** Flips true the moment the unread-boundary latch settles — whether it found
     * a boundary or not. The one-shot open scroll waits for this so it never fires
     * against an unresolved (possibly empty) window. */
    val unreadBoundaryResolved: Boolean = false,
    /** The conversation's encryption posture (e.g. `"e2ee"`), or `null` when the
     * conversation is not encrypted. Drives the top-of-history E2EE notice. */
    val encryptionMode: String? = null,
    val search: ChatSearchState = ChatSearchState(),
    val mention: MentionAutocompleteState = MentionAutocompleteState(),
    val mentionDisplayNames: Map<String, String> = emptyMap(),
    val reactionDetails: ReactionDetailsUiState? = null,
    val isPinnedSheetOpen: Boolean = false,
    val replyThreadParentId: String? = null,
    val forward: ForwardUiState? = null,
    val explorerMessageId: String? = null,
    val translatingLanguages: Set<String> = emptySet(),
    val languageExplorer: MessageLanguageExplorer? = null,
    /** The open report-a-message sheet, or `null` when it is closed. Drives [ReportMessageForm]. */
    val reportForm: ReportMessageForm? = null,
    /** The composer's armed message effects — the selection the effects picker edits
     * and [ChatViewModel.send] stamps onto the outgoing message. Empty = a plain send. */
    val pendingEffects: MessageEffects = MessageEffects(),
    /** Whether the effects-picker bottom sheet is presented. */
    val isEffectsPickerOpen: Boolean = false,
    /** A large paste captured into a clipboard-content attachment, previewed above the
     * composer until sent or removed. Null when no paste has been captured. */
    val clipboardContent: ClipboardContent? = null,
    /** Live-location sessions broadcast by conversation participants, folded from the
     * `location:live-*` socket events (see [LiveLocationEventFold]). Drives the badges
     * surfaced above the message list. */
    val liveLocations: LiveLocationSessions = LiveLocationSessions.EMPTY,
    /** The viewer's hardened send permissions for THIS conversation, or `null` for a
     * registered member (the full posture). Populated from the anonymous guest
     * session's [ParticipantPermissions] when the viewer joined via a share link;
     * a normal member never carries a stored anonymous session, so it stays null. */
    val composerPermissions: ParticipantPermissions? = null,
    /** The conversation's slow-mode interval in seconds, or `null`/`0` when off.
     * Carried from the loaded conversation; feeds [slowModeState]. */
    val slowModeSeconds: Int? = null,
    /** Whether the viewer's conversation role (moderator+) bypasses slow mode.
     * Computed once per conversation load via [SlowModePolicy.isExemptRole]. */
    val slowModeExempt: Boolean = false,
    /** When the viewer last sent a message in this conversation (epoch millis),
     * or `null` if not this session. Advances the slow-mode cooldown. */
    val lastSelfSentAtMillis: Long? = null,
    /** The other participant's userId in a direct conversation (`null` for a group,
     * or before the conversation has loaded) — the key [headerPresence] resolves
     * against [presenceByUserId]. Port of iOS `ConversationView.headerPresenceState`'s
     * `conversation?.participantUserId` guard. */
    val directPeerUserId: String? = null,
    /** Live `user:status`/`presence:snapshot` frames, keyed by userId — mirrors
     * `ConversationListUiState.presenceByUserId`. */
    val presenceByUserId: Map<String, UserStatusEvent> = emptyMap(),
    /** Mirrors the same `networkConditionMonitor` reading already threaded into
     * `toBubbles` (the per-message hourglass) — feeds the scroll-to-bottom control's
     * offline indicator ([ScrollControlContent.of]'s `isOffline`), port of iOS
     * `ConversationScrollControlsView.isOffline`. */
    val isOffline: Boolean = false,
    /** The composer's live source-language state — the "smart context zone" pill.
     * Follows on-device detection as the viewer types, freezes at the 10-word lock,
     * and honours a manual pick from the language picker ([ComposerLanguageState]). */
    val composerLanguage: ComposerLanguageState = ComposerLanguageState(),
    /** The fallback language the composer pill shows before any detection — the
     * viewer's resolved content language, seeded once the session loads. Only the
     * DISPLAY fallback; [ChatViewModel.send] resolves it authoritatively per user. */
    val composerLanguageSeed: String = ComposerLanguage.DEFAULT,
    /** The in-flight/last "open"/"share" of a FILE attachment (tap → download → open),
     * driven by [ChatViewModel.onFileAttachmentOpen] / [ChatViewModel.onFileAttachmentShare].
     * `null` when nothing is downloading and nothing needs surfacing. */
    val fileDownload: FileAttachmentDownloadUiState? = null,
) {
    val canSend: Boolean get() = draft.isNotBlank() || clipboardContent != null

    /** The composer's live slow-mode posture at [nowMillis] — whether the send
     * action is allowed and, if not, how many seconds remain. Pure derivation over
     * [SlowModePolicy]; the Compose screen ticks [nowMillis] to animate the
     * countdown, the ViewModel reads it to gate [ChatViewModel.send]. */
    fun slowModeState(nowMillis: Long): SlowModeState =
        SlowModePolicy.evaluate(
            slowModeSeconds = slowModeSeconds,
            lastSelfSentAtMillis = lastSelfSentAtMillis,
            nowMillis = nowMillis,
            isExempt = slowModeExempt,
        )

    /** The concrete affordances the composer may offer, derived from
     * [composerPermissions] via the pure [ComposerAttachmentPolicy]. A registered
     * member (null permissions) gets every affordance; a share-link guest is gated
     * to the capabilities the join hardened. */
    val composerAffordances: ComposerAffordances
        get() = ComposerAttachmentPolicy.affordances(composerPermissions)
    val isEditing: Boolean get() = editingMessageId != null

    /** Whether the end-to-end-encryption notice sits at the top of the list — the
     * conversation is encrypted, the reader has reached the start of history
     * ([hasMoreOlder] false), and the cold-start skeleton ([showSkeleton]) is down.
     * Pure derivation over [EncryptionDisclaimer]. */
    val showEncryptionDisclaimer: Boolean
        get() = EncryptionDisclaimer.shouldShow(
            encryptionMode = encryptionMode,
            hasOlderMessages = hasMoreOlder,
            isLoadingInitial = showSkeleton,
        )

    /** The live-location sessions to render as badges, in registry order. The badge
     * self-terminates on expiry, so the raw session list is safe to surface directly. */
    val liveLocationBadges: List<ActiveLiveLocation> get() = liveLocations.sessions.values.toList()

    /** True when at least one effect is armed — drives the composer's active-effects accent. */
    val hasPendingEffects: Boolean get() = pendingEffects.hasAnyEffect

    /** The composer's live sentiment glyph, derived from the current [draft] via the
     * pure [SentimentAnalyzer] (parity iOS `TextAnalyzer`/`SmartContextZone`, the
     * dictionary scorer). Null when the composer is empty — no glyph is shown for a
     * blank field; a non-blank draft with no sentiment words resolves to
     * [SentimentLevel.NEUTRAL]. */
    val composerSentiment: SentimentLevel?
        get() = draft.takeIf { it.isNotBlank() }
            ?.let { SentimentLevel.from(SentimentAnalyzer.score(it)) }

    /** The language code the composer pill shows — the live detection/override
     * resolved against [composerLanguageSeed]. Drives the pill glyph and the picker's
     * current selection; the same value (resolved per-user) stamps `originalLanguage`. */
    val composerLanguageCode: String
        get() = composerLanguage.display(composerLanguageSeed)

    /** Every currently-pinned message, newest-pin first — drives the pinned-messages sheet. */
    val pinnedMessages: List<PinnedMessageRow> get() = PinnedMessagesList.of(messages.map { it.toPinnable() })

    /** The pinned-message banner surfaced above the list, or null when nothing is pinned. */
    val pinnedBanner: PinnedBanner? get() = PinnedMessages.of(messages.map { it.toPinnable() })

    /**
     * The focused reply-thread overlay for [replyThreadParentId], derived live from the
     * loaded messages (a new reply appears in an open overlay). Null when closed, or when
     * the parent has drained to no live reply / paged out. See [ReplyThreadOverlay].
     */
    val replyThreadOverlay: ReplyThreadOverlayModel? get() =
        replyThreadParentId?.let { ReplyThreadOverlay.of(it, messages.map { m -> m.toThreadMessage() }) }

    /**
     * The chat header's live presence dot, or `null` for a group conversation or before any
     * presence data has arrived for the peer — mirrors
     * `ConversationListUiState.presenceStateFor`. Port of iOS
     * `ConversationView.headerPresenceState`; unlike iOS the Android header has no avatar to
     * dot, so this drives a small standalone indicator instead (see `ChatScreen`).
     */
    fun headerPresence(nowEpochMillis: Long): PresenceState? {
        val id = directPeerUserId ?: return null
        val event = presenceByUserId[id] ?: return null
        return UserPresence(isOnline = event.isOnline, lastActiveAt = event.lastActiveAt).state(nowEpochMillis)
    }
}

/**
 * State of the forward-picker sheet. `null` in [ChatUiState.forward] means the
 * sheet is closed. [sendingConversationId] gates the picker to one in-flight
 * forward at a time (parity with iOS, which disables every row while sending);
 * [sentConversationIds] keeps a checkmark on rows already forwarded to so the
 * user can forward one message to several conversations in one sitting.
 */
data class ForwardUiState(
    val sourceMessageId: String,
    val query: String = "",
    val targets: List<ForwardTarget> = emptyList(),
    val sendingConversationId: String? = null,
    val sentConversationIds: Set<String> = emptySet(),
)

internal fun BubbleContent.toPinnable(): PinnableMessage = object : PinnableMessage {
    override val id: String = messageId
    override val pinnedAtIso: String? = this@toPinnable.pinnedAtIso
    override val isDeleted: Boolean = this@toPinnable.isDeleted
    override val isOutgoing: Boolean = this@toPinnable.isOutgoing
    override val senderName: String? = this@toPinnable.senderName
    override val text: String = this@toPinnable.text
    override val hasImage: Boolean = images.isNotEmpty()
    override val hasFile: Boolean = files.isNotEmpty()
}

internal fun BubbleContent.toThreadMessage(): ThreadMessage = object : ThreadMessage {
    override val id: String = messageId
    override val replyToId: String? = this@toThreadMessage.replyToId
    override val isDeleted: Boolean = this@toThreadMessage.isDeleted
    override val isOutgoing: Boolean = this@toThreadMessage.isOutgoing
    override val senderName: String? = this@toThreadMessage.senderName
    override val text: String = this@toThreadMessage.text
    override val hasImage: Boolean = images.isNotEmpty()
    override val hasFile: Boolean = files.isNotEmpty()
}
