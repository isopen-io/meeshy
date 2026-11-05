package me.meeshy.ui.component.bubble

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.ForwardAttribution
import me.meeshy.sdk.model.JoinNoticePresentation
import me.meeshy.sdk.model.BubbleAttachmentLayout
import me.meeshy.sdk.model.CallSummaryMetadata
import me.meeshy.sdk.model.ProtectionDescriptor
import me.meeshy.sdk.model.BlurRevealLifecycle
import me.meeshy.sdk.model.BubbleStickerSpec
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.MessageSourceKind
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.MessageExitOffer
import me.meeshy.sdk.model.profile.ProfileSheetUser

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
    /** Identifiant de participant de l'auteur (`senderId`). */
    val senderId: String? = null,
    /** La fiche de l'auteur ouverte depuis l'avatar du pied d'identité (iOS `ProfileSheetUser.from(message)`). */
    val senderProfile: ProfileSheetUser? = null,
    /** La conversation du message : « ici » (`viewing:*`) ne vaut que pour elle. */
    val viewingConversationId: String? = null,
    /** Pseudo de l'auteur, lu « @pseudo » sous son nom dans le pied d'identité. */
    val senderUsername: String? = null,
    /** Photo de l'auteur, telle que servie (résolue par `MeeshyAvatar`). */
    val senderAvatarUrl: String? = null,
    /**
     * Couleur déterministe de l'auteur (`DynamicColorGenerator.colorForName(senderName)`) : elle
     * teinte le fond et le contour de la bulle reçue, et l'avatar de repli (iOS `senderColor`).
     */
    val senderColorHex: String? = null,
    /** L'auteur est un invité SANS compte (type `anonymous`, jamais le pseudo) : son avatar est un fantôme. */
    val senderIsAnonymous: Boolean = false,
    /** L'auteur a un compte qui l'engage ; fail-closed : un type absent ou inconnu vaut invité. */
    val senderHasAccount: Boolean = true,
    /** Le contour d'avatar équipé de l'auteur, servi avec le message (#10713). */
    val senderRing: ServedProfileDecorItem? = null,
    /** `pseudo → nom d'affichage` des personnes mentionnées, tels que la passerelle les sert avec le message. */
    val servedMentionNames: Map<String, String> = emptyMap(),
    /** D'où vient le message (utilisateur, système, annonce, application, agent, autorité). */
    val sourceKind: MessageSourceKind = MessageSourceKind.User,
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
     * Who the forward badge may name, decided by `ForwardBadgePolicy` (three outcomes, no
     * implicit fallback): the source group, the person of a one-to-one, or nobody. Only
     * meaningful when [isForwarded] is true.
     */
    val forwardAttribution: ForwardAttribution = ForwardAttribution.Anonymous,
    val isStarred: Boolean = false,
    /** Le DERNIER message reçu du fil : lui seul porte le smiley d'ajout de réaction (iOS). */
    val isLastReceivedMessage: Boolean = false,
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
    /** #13995 — la flamme-œil : le message disparaît chez le lecteur quand il l'a vu puis a quitté. */
    val isAfterRead: Boolean = false,
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
    /**
     * Pour un avis d'arrivée (`metadata.kind == "member-joined"`) : la présentation décidée par
     * [JoinNoticePresentation] (nom, @handle, badge « sans compte », règles du lien). Null pour
     * tout autre message ; [text] reste alors le repli à rendre.
     */
    val joinNotice: JoinNoticePresentation? = null,
    /** Vrai pour la ligne d'arrivées groupées : elle propose « dis-leur salut » ([BubbleCallbacks.onSayHi]). */
    val isArrivalsNotice: Boolean = false,
    /** Number of video attachments (read separately from images by the accessibility label). */
    val videoCount: Int = 0,
    val contactCards: List<BubbleContactCard> = emptyList(),
    /** True when the message carries the blurred lifecycle bit: its text is never read aloud. */
    val isBlurred: Boolean = false,
    /** True when the quoted message was written by the current user. */
    val replyToIsMe: Boolean = false,
    /** La fiche de l'auteur cité (tap sur son nom dans la citation) ; `null` : soi, supprimé ou sans compte. */
    val replyToAuthor: me.meeshy.sdk.model.profile.ProfileSheetUser? = null,
    /**
     * Le vocal CITÉ, jouable depuis la citation (iOS `ConversationViewModel+QuotedAudio`), avec sa piste servie par le Prisme.
     * Jamais posé pour un cité protégé (vue unique, flouté, chiffré), éphémère ou supprimé : rien de lui ne voyage.
     */
    val replyToAudio: BubbleAudio? = null,
    /** True when an outgoing message has been in flight long enough to be called slow. */
    val isSlowSend: Boolean = false,
    /** True when a failed send was refused because a file's location cannot be removed (#13550): told, and removed on tap. */
    val isLocationRefused: Boolean = false,
    /** True when a failed send lost its media on the device (#13554): told, and removed on tap so the author picks it again. */
    val isMediaLost: Boolean = false,
    /** True when a failed send was refused because this participant may not attach that kind of piece yet (#16053): told, retried by hand. */
    val isAttachmentRightRefused: Boolean = false,
    /** What this message lets out of Meeshy (forward, copy, save, share…) — read by every exit instead of a raw flag. */
    val exitOffer: MessageExitOffer = MessageExitOffer.Unrestricted,
    /**
     * End-to-end encrypted, and this device cannot open it (#13110): the bubble says
     * where it reads — never the gateway's `[Encrypted]` literal, never a piece.
     */
    val isEndToEndSealed: Boolean = false,
    /**
     * End-to-end encrypted and opened on THIS device (#14591): its text shows, read from the device's vault, but it never
     * leaves as clear — no forward, as on iOS (the server has no plaintext of it).
     */
    val isEndToEndOpened: Boolean = false,
    /**
     * The server already reads this row — written in clear (or server-encrypted) before end-to-end was turned on (#13804):
     * deleting it for everyone keeps its clear route, as the gateway judges the erasure on the row. Closed by default.
     */
    val isReadByServer: Boolean = false,
    /**
     * Les pièces d'un message scellé (#13493) : une rangée « chiffrée » par pièce, sans nom ni adresse — la bulle ne
     * dit pas ce qu'elle ne peut pas lire, mais ne se présente jamais comme un document téléchargeable.
     */
    val sealedPieceIds: List<String> = emptyList(),
    /**
     * Shown, this message holds the send of its thread (#13099): end-to-end encrypted, or
     * encrypted with no mode or an unknown one — `EndToEndRegimeMemory.messageHoldsSend`.
     */
    val holdsEndToEndSend: Boolean = false,
    /**
     * Le sticker que la bulle REDESSINE (#14345, iOS `BubbleSticker`) : film de Mee, Instant, gabarit, emoji, ou le PNG
     * joint en repli. Non nul, la bulle se rend sans fond, comme un emoji libre ; la pièce reste dans [images] pour les
     * autres lecteurs (réponse, galerie, export). Nul pour tout autre message, supprimé ou scellé.
     */
    val sticker: BubbleStickerSpec? = null,
    /** Les vidéos jointes, lues par la grille visuelle (iOS `visualGrid`) ; vide scellé, supprimé ou chiffré. */
    val videos: List<BubbleVideo> = emptyList(),
    /** Comment les pièces se rangent dans la bulle (grille visuelle, audio, non média, mélange) ; `None` sans pièce. */
    val attachmentLayout: BubbleAttachmentLayout = BubbleAttachmentLayout.None,
    /** Ce que le message déclare de sa protection (éphémère, vue unique, flou, chiffré). */
    val protection: ProtectionDescriptor = ProtectionDescriptor.Unprotected,
    /**
     * Vue unique pas encore ouverte par CE lecteur (iOS `viewOnceSealed`) : la bulle ne porte NI texte, NI légende, NI
     * pièce — rien n'atteint TalkBack, la copie ou la file de téléchargement. Décidé par lecteur, jamais par le compteur.
     */
    val isViewOnceSealed: Boolean = false,
    /** Le résumé d'un appel (message système d'appel), décodé de `metadata` ; nul pour tout autre message. */
    val callSummary: CallSummaryMetadata? = null,
    /** L'appel a été lancé par CE lecteur (initiateur = utilisateur courant) : la notice dit sortant. */
    val callIsOutgoing: Boolean = false,
    /** Le consentement vocal manque : un audio du message propose de l'activer (avis discret sous le lecteur). */
    val voiceConsentMissing: Boolean = false,
    /** Une édition part au serveur : le pied montre des flèches qui tournent à la place du crayon. */
    val isEditSaving: Boolean = false,
    /** La dernière modification est celle d'un modérateur : le pied le dit en mots. */
    val editedByModerator: Boolean = false,
    /** La langue primaire du Prisme du lecteur pour ce message (ou l'origine) : le drapeau qui y ramène le texte. */
    val primaryLanguageCode: String? = null,
    /** `langue -> texte` des traductions que le pied propose en panneau secondaire ; vide sans drapeau. */
    val secondaryTexts: Map<String, String> = emptyMap(),
    /** La langue dont le panneau secondaire est OUVERT sous le texte ; posée par la rangée, nulle par défaut. */
    val openSecondaryCode: String? = null,
    /** Les langues dont une traduction est demandée : leur drapeau attend. Posé par la rangée. */
    val translatingCodes: Set<String> = emptySet(),
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
