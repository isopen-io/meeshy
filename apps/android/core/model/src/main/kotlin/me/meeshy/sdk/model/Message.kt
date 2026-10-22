package me.meeshy.sdk.model

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.nullable
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonNames
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.serialization.TolerantSerializer

/**
 * Le message CITÉ tel que `GET /messages` et `message:new` le servent — miroir de
 * `APIMessageReplyTo` (iOS). La passerelle sert depuis toujours la langue d'origine,
 * les traductions et les champs de protection : sans eux le client ne peut ni descendre
 * le Prisme sur le texte cité ni savoir qu'une réponse à un message à vue unique
 * republierait son texte en clair. Tout est facultatif (fil ancien, écho socket allégé).
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiMessageReplyPreview(
    val id: String,
    val content: String = "",
    val senderDisplayName: String? = null,
    val senderId: String? = null,
    val deletedAt: String? = null,
    @Serializable(with = LossyApiMessageAttachmentListOrNullSerializer::class)
    val attachments: List<ApiMessageAttachment>? = null,
    @Serializable(with = TolerantMessageSenderSerializer::class)
    val sender: ApiMessageSender? = null,
    val originalLanguage: String? = null,
    /** Une traduction malformée est écartée, la citation garde les autres. */
    @Serializable(with = LossyApiTextTranslationListOrNullSerializer::class)
    val translations: List<ApiTextTranslation>? = null,
    @Serializable(with = ProtectionBooleanSerializer::class)
    val isViewOnce: Boolean? = null,
    @Serializable(with = ProtectionBooleanSerializer::class)
    val isBlurred: Boolean? = null,
    @Serializable(with = ProtectionFlagsSerializer::class)
    val effectFlags: Long? = null,
    val expiresAt: String? = null,
    val isEncrypted: Boolean? = null,
    val encryptionMode: String? = null,
    /** L'instantané FIGÉ de la pièce NOMMÉE par la réponse (#6164) ; malformé ⇒ `null`, la citation survit. */
    @Serializable(with = TolerantQuotedAttachmentReferenceSerializer::class)
    val attachmentReplyTo: ApiQuotedAttachmentReference? = null,
    /** Nombre TOTAL de photos et vidéos du message cité (la passerelle n'en sert que quatre). */
    val visualAttachmentCount: Int? = null,
) {
    /** L'utilisateur cité : la personne avant l'identifiant de participant. */
    val authorUserId: String? get() = sender?.resolvedUserId ?: senderId

    val authorAvatarUrl: String? get() = sender?.resolvedAvatar

    /**
     * Le cité ne doit pas republier son texte : vue unique, flouté ou chiffré, par les
     * champs hérités OU le bitfield. L'éphémère n'en fait PAS partie (lisible dans le fil).
     */
    val isProtected: Boolean
        get() = isViewOnce == true || isBlurred == true || isEncrypted == true ||
            ((effectFlags ?: 0L) and AttachmentProtection.MASKING_FLAGS) != 0L
}

/**
 * Ce que `replyTo.attachmentReplyTo` porte, et RIEN d'autre : l'ancre du saut et la
 * NATURE du média (`image` · `video` · `audio` · `location` · `file`).
 */
@Serializable
data class ApiQuotedAttachmentReference(
    val attachmentId: String,
    val kind: String? = null,
)

internal object TolerantQuotedAttachmentReferenceSerializer :
    KSerializer<ApiQuotedAttachmentReference?> by TolerantSerializer(ApiQuotedAttachmentReference.serializer())

/**
 * Frozen snapshot of the post (status/story/reel/post) a message replies to —
 * port of APIPostReplyTarget (MessageModels.swift). Received via the modern
 * `postReplyTo` key (legacy `storyReplyTo`). Survives the post's expiry because
 * it is captured at reply time. A non-null [moodEmoji] marks a mood/status
 * reply (emoji + content render); otherwise it is a story reply (thumbnail +
 * reaction/comment/share counts).
 */
@Serializable
data class ApiPostReplyTarget(
    val id: String,
    val type: String? = null,
    val reactionCount: Int = 0,
    val commentCount: Int = 0,
    val shareCount: Int = 0,
    val createdAt: String? = null,
    val thumbnailUrl: String? = null,
    val previewText: String = "",
    val moodEmoji: String? = null,
)

/** A pre-loaded text translation — port of APITextTranslation (MessageModels.swift). */
@Serializable
data class ApiTextTranslation(
    val id: String? = null,
    val messageId: String? = null,
    val sourceLanguage: String = "",
    override val targetLanguage: String,
    override val translatedContent: String,
    val translationModel: String? = null,
    val confidenceScore: Double? = null,
    val cached: Boolean = false,
    /** `true` quand [translatedContent] est un CRYPTOGRAMME : jamais servi comme texte. `null` ⇒ non chiffré. */
    val isEncrypted: Boolean? = null,
) : LanguageResolver.TranslationLike

/**
 * L'expéditeur d'un message — miroir de `APIMessageSender` (iOS). Un seul type pour le
 * message, la citation et le transféré.
 */
@Serializable
data class ApiMessageSender(
    val id: String? = null,
    val userId: String? = null,
    val displayName: String? = null,
    val username: String? = null,
    val avatar: String? = null,
    /** `anonymous` · `user` · `bot` — le TYPE tranche, jamais le pseudo. */
    val type: String? = null,
    val firstName: String? = null,
    val lastName: String? = null,
    val user: ApiMessageSenderUser? = null,
    /** Le décor équipé servi avec l'auteur (#10713) : son contour d'avatar relu hors ligne. */
    @Serializable(with = TolerantServedProfileDecorSerializer::class)
    val profileDecor: ServedProfileDecor? = null,
) {
    /** Le nom affiché : surnom, puis nom du compte imbriqué, puis pseudo, puis identifiant. */
    val name: String
        get() = displayName.nonBlank() ?: user?.displayName.nonBlank() ?: username.nonBlank()
            ?: user?.username.nonBlank() ?: id.orEmpty()

    val resolvedAvatar: String? get() = avatar.nonBlank() ?: user?.avatar.nonBlank()

    val resolvedUserId: String? get() = userId ?: user?.id

    /** Visiteur sans compte. Un pseudo `ano_…` ne prouve rien : un compte peut s'appeler ainsi. */
    val isAnonymous: Boolean get() = type == "anonymous"

    /** Fail-closed : seuls `user` et `bot` prouvent un compte ; absent ou inconnu vaut invité. */
    val hasAccount: Boolean get() = type == "user" || type == "bot"

    private fun String?.nonBlank(): String? = this?.takeIf { it.isNotBlank() }
}

/** Ancien nom de l'expéditeur imbriqué d'un transfert — un seul type désormais. */
typealias ApiMessageSenderDetail = ApiMessageSender

/**
 * The SOURCE conversation of a forwarded message, hoisted onto the payload by
 * the gateway (`forwardedFromConversation`) alongside `forwardedFromId`. Carries
 * exactly the fields the gateway selects: `id`, `title`, `identifier`, `type`,
 * `avatar`. Used to name the forward badge — see [ForwardBadgePolicy].
 */
@Serializable
data class ApiForwardedConversation(
    val id: String? = null,
    val title: String? = null,
    val identifier: String? = null,
    val type: String? = null,
    val avatar: String? = null,
)

/**
 * Message — miroir de `APIMessage` (iOS). Tout ce que la passerelle sert est gardé ;
 * tout champ nouveau est nullable ou a un défaut, si bien qu'une ancienne ligne de cache
 * Room (JSON sans ces champs) se relit. Les champs PÉRIPHÉRIQUES (expéditeur, citation,
 * transfert, lieu, traductions, pièces, mentions) se décodent par élément : un champ
 * malformé ne coûte que lui-même, jamais le message ni la page qui le porte.
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ApiMessage(
    /** Repli `_id` pour un document MongoDB brut. */
    @JsonNames("_id")
    val id: String,
    val conversationId: String,
    val senderId: String? = null,
    val content: String = "",
    val messageType: String = "text",
    val originalLanguage: String? = null,
    val isEdited: Boolean = false,
    val editedAt: String? = null,
    val deletedAt: String? = null,
    val replyToId: String? = null,
    val storyReplyToId: String? = null,
    @JsonNames("storyReplyTo")
    @Serializable(with = TolerantPostReplyTargetSerializer::class)
    val postReplyTo: ApiPostReplyTarget? = null,
    val createdAt: String? = null,
    @Serializable(with = TolerantMessageSenderSerializer::class)
    val sender: ApiMessageSender? = null,
    @Serializable(with = LossyApiTextTranslationListSerializer::class)
    val translations: List<ApiTextTranslation> = emptyList(),
    val reactionSummary: Map<String, Int>? = null,
    val deliveredCount: Int = 0,
    val readCount: Int = 0,
    val readByAllAt: String? = null,
    @Serializable(with = TolerantReplyPreviewSerializer::class)
    val replyTo: ApiMessageReplyPreview? = null,
    val clientMessageId: String? = null,
    @Serializable(with = LossyApiMessageAttachmentListSerializer::class)
    val attachments: List<ApiMessageAttachment> = emptyList(),
    val pinnedAt: String? = null,
    val pinnedBy: String? = null,
    val forwardedFromId: String? = null,
    val forwardedFromConversationId: String? = null,
    @Serializable(with = TolerantForwardedConversationSerializer::class)
    val forwardedFromConversation: ApiForwardedConversation? = null,
    val effectFlags: Int? = null,
    val isBlurred: Boolean? = null,
    val isViewOnce: Boolean? = null,
    val viewOnceCount: Int = 0,
    val expiresAt: String? = null,
    /**
     * `"user" | "system" | "ads" | "app" | "agent" | "authority"` — port of
     * `messageSource` (MessageModels.swift / `packages/shared/types/message-types.ts`).
     * A system message (e.g. a join/leave notice) is never a turn at talk: it
     * never groups with a neighbour — see `MessageGrouping` (feature/chat).
     */
    val messageSource: String? = null,
    val updatedAt: String? = null,
    /** Le message transféré : sa source, son expéditeur d'origine, ses pièces. */
    @Serializable(with = TolerantForwardedFromSerializer::class)
    val forwardedFrom: ApiForwardedFrom? = null,
    /** Durée d'un éphémère en SECONDES : le décompte part de la réception de chaque lecteur. */
    val ephemeralDuration: Int? = null,
    /** Vue unique déjà ouverte par CE lecteur ; `null` (charge antérieure au contrat) ⇒ non ouvert. */
    val consumedByMe: Boolean? = null,
    /** Lieu partagé, hissé par la passerelle depuis `metadata.location`. */
    @Serializable(with = TolerantSharedPlaceSerializer::class)
    val location: SharedPlace? = null,
    /** Sticker en RACINE ; voir [servedSticker] pour la forme repliée sur `metadata.sticker`. */
    @Serializable(with = WireWorthyStickerSerializer::class)
    val sticker: MessageSticker? = null,
    val isEncrypted: Boolean? = null,
    val encryptionMode: String? = null,
    val reactionCount: Int? = null,
    val currentUserReactions: List<String>? = null,
    val deliveredToAllAt: String? = null,
    val recipientCount: Int? = null,
    @Serializable(with = LossyMentionedUserListOrNullSerializer::class)
    val mentionedUsers: List<MentionedUser>? = null,
    /** Le blob libre `metadata` ; ses familles se lisent par [callSummary], [joinNotice], [arrivalsNotice]. */
    @Serializable(with = TolerantMetadataSerializer::class)
    val metadata: JsonObject? = null,
    @Serializable(with = TolerantSystemEventSerializer::class)
    val systemEvent: MessageSystemEvent? = null,
    /** Liens suivis, au PREMIER niveau (socket) ; voir [servedTrackingLinks] pour le repli sur `metadata`. */
    @Serializable(with = LossyTrackedLinkListOrNullSerializer::class)
    val trackingLinks: List<TrackedLink>? = null,
    /** Le cryptogramme d'un message chiffré de bout en bout ; conservé tel quel, jamais déchiffré ici. */
    @Serializable(with = TolerantEncryptedContentSerializer::class)
    val encryptedContent: String? = null,
) {
    /**
     * Content to display under the Prisme Linguistique: the preferred translation,
     * or the original [content] when no translation targets a preferred language —
     * or when the message is already written in one of the reader's languages that
     * ranks above every available translation ([originalLanguage] competes at its
     * own rank, never as a short-circuit). A translation that is a cryptogram is
     * never served as text.
     */
    fun displayContent(prefs: LanguageResolver.ContentLanguagePreferences): String =
        servedTranslation(prefs)?.translatedContent ?: content

    /** True when the displayed content is a translation rather than the original. */
    fun isTranslated(prefs: LanguageResolver.ContentLanguagePreferences): Boolean =
        servedTranslation(prefs) != null

    private fun servedTranslation(prefs: LanguageResolver.ContentLanguagePreferences): ApiTextTranslation? =
        LanguageResolver.preferredTranslation(
            translations.filter { it.isEncrypted != true },
            prefs,
            originalLanguage,
        )

    /** Le contenu est un cryptogramme : il ne se rend jamais en clair. */
    val isCiphertext: Boolean get() = isEncrypted == true

    /** `consumedByMe` nul est traité comme non ouvert. */
    val isViewOnceOpenedByMe: Boolean get() = consumedByMe == true

    /** Le sticker, en racine d'abord (les deux producteurs le hissent), sinon `metadata.sticker`. */
    val servedSticker: MessageSticker? by lazy { sticker ?: MessageRichMetadata.sticker(metadata) }

    /** Les liens suivis lus au premier niveau ET sous `metadata.trackingLinks`. */
    val servedTrackingLinks: List<TrackedLink>? by lazy {
        trackingLinks?.takeIf { it.isNotEmpty() } ?: MessageRichMetadata.trackingLinks(metadata)
    }

    /** `[url: jeton]` des liens suivis ; vide sans suivi. */
    val trackedLinkMap: Map<String, String> get() = servedTrackingLinks.orEmpty().trackedLinkMap

    val callSummary: CallSummaryMetadata? by lazy { MessageRichMetadata.callSummary(metadata) }

    val joinNotice: JoinNoticeMetadata? by lazy { MessageRichMetadata.joinNotice(metadata) }

    val arrivalsNotice: ArrivalsNoticeMetadata? by lazy { MessageRichMetadata.arrivalsNotice(metadata) }

    /**
     * The resolved visual/lifecycle effects for this message. A positive
     * [effectFlags] bitfield is authoritative; otherwise lifecycle flags are
     * derived from the legacy `isBlurred` / `isViewOnce` / expiry fields — the
     * exact rule iOS `APIMessage.toMessage` applies.
     */
    val effects: MessageEffects
        get() = MessageEffectsResolver.resolve(
            effectFlags = effectFlags,
            isBlurred = isBlurred,
            isViewOnce = isViewOnce,
            hasExpiry = !expiresAt.isNullOrBlank(),
        )

    /**
     * True for a notice the conversation emits about itself (someone joined,
     * someone left) rather than a turn at talk. A join notice carries the
     * arriver as its author, so this mark — not the sender id — is what keeps
     * it out of the newcomer's first bubble group. See `MessageGrouping`
     * (feature/chat) and its two mirrors: `apps/web/utils/message-grouping.ts`,
     * `apps/ios/.../Bubble/MessageDayGrouping.swift`.
     *
     * The comparison is exact, like both mirrors: a casing change on the
     * gateway must move the three platforms together, not pass unnoticed here.
     */
    val isSystemMessage: Boolean
        get() = messageSource == "system"
}

@Serializable
data class SendMessageRequest(
    val content: String,
    val originalLanguage: String,
    val messageType: String = "text",
    val replyToId: String? = null,
    // Wire twin of `ApiMessage.storyReplyToId` above — the RECEIVE side already
    // carried it; the SEND side never did, so no client could ever construct a
    // request the gateway's `storyReplyToId` (SendMessageBodySchema) accepts.
    val storyReplyToId: String? = null,
    val clientMessageId: String,
    val attachmentIds: List<String>? = null,
    val forwardedFromId: String? = null,
    val forwardedFromConversationId: String? = null,
    val effectFlags: Int? = null,
    val isBlurred: Boolean? = null,
    val isViewOnce: Boolean? = null,
    val ephemeralDuration: Int? = null,
    val expiresAt: String? = null,
    val maxViewOnceCount: Int? = null,
)

internal object TolerantPostReplyTargetSerializer :
    KSerializer<ApiPostReplyTarget?> by TolerantSerializer(ApiPostReplyTarget.serializer())

internal object TolerantReplyPreviewSerializer :
    KSerializer<ApiMessageReplyPreview?> by TolerantSerializer(ApiMessageReplyPreview.serializer())

internal object TolerantForwardedConversationSerializer :
    KSerializer<ApiForwardedConversation?> by TolerantSerializer(ApiForwardedConversation.serializer())

internal object TolerantForwardedFromSerializer :
    KSerializer<ApiForwardedFrom?> by TolerantSerializer(ApiForwardedFrom.serializer())

internal object TolerantSharedPlaceSerializer :
    KSerializer<SharedPlace?> by TolerantSerializer(SharedPlace.serializer())

internal object TolerantMetadataSerializer :
    KSerializer<JsonObject?> by TolerantSerializer(JsonObject.serializer())


/** Le cryptogramme est une chaîne ; tout autre type vaut absent, sans coûter le message. */
internal object TolerantEncryptedContentSerializer : KSerializer<String?> {
    override val descriptor: SerialDescriptor = JsonElement.serializer().descriptor.nullable

    override fun deserialize(decoder: Decoder): String? {
        val raw = (decoder as? JsonDecoder)?.decodeJsonElement() ?: return decoder.decodeString()
        return (raw as? JsonPrimitive)?.takeIf { it.isString }?.content
    }

    override fun serialize(encoder: Encoder, value: String?) {
        if (value == null) encoder.encodeNull() else encoder.encodeString(value)
    }
}

internal object TolerantServedProfileDecorSerializer :
    KSerializer<ServedProfileDecor?> by TolerantSerializer(ServedProfileDecor.serializer())
