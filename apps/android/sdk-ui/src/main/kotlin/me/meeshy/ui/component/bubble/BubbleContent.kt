package me.meeshy.ui.component.bubble

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.BlurRevealLifecycle
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.MessageExitOffer

@Immutable
sealed class DeliveryStatus {
    @Immutable data object Pending : DeliveryStatus()

    /** Pending, but parked in the offline outbox — shows a queue hourglass, not a clock. */
    @Immutable data object QueuedOffline : DeliveryStatus()
    @Immutable data object Sent : DeliveryStatus()
    @Immutable data object Delivered : DeliveryStatus()
    @Immutable data object Read : DeliveryStatus()
    @Immutable data object Failed : DeliveryStatus()
}

@Immutable
data class ReactionEntry(
    val emoji: String,
    val count: Int,
    val includesMe: Boolean = false,
)

@Immutable
public data class BubbleContent(
    val messageId: String,
    val text: String,
    val isOutgoing: Boolean,
    val isTranslated: Boolean,
    val isShowingOriginal: Boolean = false,
    val originalText: String?,
    val languageStrip: List<LanguageChip> = emptyList(),
    val senderName: String?,
    /**
     * Vrai sur la bulle qui porte l'IDENTITÉ de l'auteur dans son pied (avatar, nom, @pseudo) :
     * la DERNIÈRE d'une suite reçue, en groupe seulement (iOS `showIdentityBar =
     * !isDirect && isLastInGroup && !isMe`).
     */
    val showSenderName: Boolean,
    /** Identifiant de participant de l'auteur (`senderId`) : la fiche profil ouverte depuis l'avatar. */
    val senderId: String? = null,
    /** Pseudo de l'auteur, lu « @pseudo » sous son nom dans le pied d'identité. */
    val senderUsername: String? = null,
    /** Photo de l'auteur, telle que servie (résolue par `MeeshyAvatar`). */
    val senderAvatarUrl: String? = null,
    /**
     * Couleur déterministe de l'auteur (`DynamicColorGenerator.colorForName(senderName)`) : elle
     * teinte le fond et le contour de la bulle reçue, et l'avatar de repli (iOS `senderColor`).
     */
    val senderColorHex: String? = null,
    val isEdited: Boolean,
    val isDeleted: Boolean,
    val createdAtIso: String?,
    val deliveryStatus: DeliveryStatus = DeliveryStatus.Sent,
    val reactions: List<ReactionEntry> = emptyList(),
    val replyToId: String? = null,
    val replyToText: String? = null,
    val replyToSenderName: String? = null,
    val replyToDeleted: Boolean = false,
    val replyToMediaKind: ReplyMediaKind = ReplyMediaKind.None,
    val replyToThumbnailUrl: String? = null,
    val storyReply: BubbleStoryReply? = null,
    val isPending: Boolean = false,
    val clientMessageId: String? = null,
    val images: List<BubbleImage> = emptyList(),
    val files: List<BubbleFile> = emptyList(),
    val locations: List<BubbleLocation> = emptyList(),
    val audios: List<BubbleAudio> = emptyList(),
    val emojiOnlyCount: Int = 0,
    val expiresAtIso: String? = null,
    val pinnedAtIso: String? = null,
    val isForwarded: Boolean = false,
    /**
     * The SOURCE conversation's display name when the forward badge should name
     * it (a group forward), else null — the badge then shows the generic
     * "Forwarded" label. Resolved by `ForwardBadgePolicy`. Only meaningful when
     * [isForwarded] is true.
     */
    val forwardedFromName: String? = null,
    val isStarred: Boolean = false,
    val isFirstInGroup: Boolean = true,
    val isLastInGroup: Boolean = true,
    val blurReveal: BubbleBlurRevealSpec? = null,
    /**
     * The visual-treatment effects (glow / pulse / rainbow / one-shot appearance) this
     * bubble renders via `Modifier.messageEffects`. Lifecycle bits are stripped and the
     * value is empty for a deleted tombstone (see
     * [me.meeshy.sdk.model.MessageEffectRenderPlanner.renderEffects]).
     */
    val effects: MessageEffects = MessageEffects(),
    /** True when this message is a view-once ("open once, then burn") message. */
    val isViewOnce: Boolean = false,
    /**
     * True once THIS reader has opened the view-once message (`consumedByMe`). A view-once
     * is consumed per person (iOS #7579): what other members open never burns it for me.
     * Drives the "Seen and deleted" tombstone (see [me.meeshy.sdk.model.BubbleRenderKind]).
     */
    val isViewOnceOpenedByMe: Boolean = false,
    /**
     * True for a conversation notice about itself (someone joined / left, a legacy
     * call/event summary) rather than a turn at talk. Drives the
     * [me.meeshy.sdk.model.BubbleRenderKind.Kind.System] arm — the bubble renders as a
     * centered notice instead of a signed bubble. Set from
     * `ApiMessage.isSystemMessage` (`messageSource == "system"`).
     */
    val isSystem: Boolean = false,
    /** Number of video attachments (read separately from images by the accessibility label). */
    val videoCount: Int = 0,
    val contactCards: List<BubbleContactCard> = emptyList(),
    /** True when the message carries the blurred lifecycle bit: its text is never read aloud. */
    val isBlurred: Boolean = false,
    /** True when the quoted message was written by the current user. */
    val replyToIsMe: Boolean = false,
    /** True when an outgoing message has been in flight long enough to be called slow. */
    val isSlowSend: Boolean = false,
    /** What this message lets out of Meeshy (forward, copy, save, share…) — read by every exit instead of a raw flag. */
    val exitOffer: MessageExitOffer = MessageExitOffer.Unrestricted,
    /**
     * End-to-end encrypted, and this device cannot open it (#13110): the bubble says
     * where it reads — never the gateway's `[Encrypted]` literal, never a piece.
     */
    val isEndToEndSealed: Boolean = false,
)

/**
 * Conceal spec for a blurred / view-once ("tap to reveal") message — port of the
 * inputs iOS `BubbleBlurRevealController` receives. A non-null value means the bubble
 * body is hidden behind a fog + blur until the viewer taps it. [isViewOnce] drives the
 * "view once" affordance (and, later, the server view-count consume);
 * [visibilitySeconds] is how long the content stays revealed before it re-conceals.
 */
@Immutable
public data class BubbleBlurRevealSpec(
    val isViewOnce: Boolean,
    val visibilitySeconds: Double = BlurRevealLifecycle.defaultRevealDurationSeconds,
)
