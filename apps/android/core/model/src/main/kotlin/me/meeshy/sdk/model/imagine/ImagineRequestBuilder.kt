package me.meeshy.sdk.model.imagine

import me.meeshy.sdk.lang.PrismTranslation
import me.meeshy.sdk.lang.PrismTranslationResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiMessageReplyPreview
import me.meeshy.sdk.model.AttachmentProtectionVerdict
import me.meeshy.sdk.model.ContentExitLaw
import me.meeshy.sdk.model.MessageExit
import me.meeshy.sdk.model.exitOffer
import me.meeshy.sdk.model.holdsBlur
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.model.protectionVerdict
import me.meeshy.sdk.model.quotesProtectedContent

/**
 * **La demande de l'atelier « Imagine », faite d'un message** — miroir de `MessageCardSubject.of` et de
 * `MessageCardExportRequest` (iOS).
 *
 * - LE TEXTE est celui que le lecteur a sous les yeux : la descente UNIQUE du Prisme ([PrismTranslationResolver], la
 *   langue d'origine concourt à son rang), sinon l'original — jamais `translations.first()`.
 * - LA PISTE D'UN SON est élue par la langue du texte SERVI : son fichier, sa durée et sa transcription voyagent
 *   ensemble ; une piste servie sans texte ne montre rien, jamais le texte de l'original.
 * - LA GARDE : un message supprimé, un avis système, un chiffré illisible, un contenu protégé ou qui disparaît (la loi
 *   de sortie, y compris une flamme vivante) ou qui CITE un contenu protégé ne s'image pas. Une pièce floutée ou à vue
 *   unique rend le message entier inexportable ; une pièce chiffrée ne se peint pas.
 */
object ImagineRequestBuilder {

    fun refusal(
        message: ApiMessage,
        nowMillis: Long,
        quotedMessage: ApiMessage? = null,
        conversationIsEncrypted: Boolean = false,
    ): ImagineRefusal? {
        if (message.deletedAt != null) return ImagineRefusal.DELETED
        if (message.isSystemMessage) return ImagineRefusal.NOTICE
        if (message.isEndToEndSealed) return ImagineRefusal.SEALED
        if (holdsProtectedContent(message, nowMillis, conversationIsEncrypted)) return ImagineRefusal.PROTECTED
        if (quotesProtected(message, quotedMessage)) return ImagineRefusal.QUOTES_PROTECTED
        if (text(message.content) == null && paintableMedia(message).isEmpty()) return ImagineRefusal.EMPTY
        return null
    }

    fun isExportable(message: ApiMessage, nowMillis: Long, quotedMessage: ApiMessage? = null, conversationIsEncrypted: Boolean = false): Boolean =
        refusal(message, nowMillis, quotedMessage, conversationIsEncrypted) == null

    /** Le contenu PROPRE du message part-il en image — sans juger ce qu'il cite ? */
    internal fun holdsProtectedContent(message: ApiMessage, nowMillis: Long, conversationIsEncrypted: Boolean = false): Boolean {
        val offer = message.exitOffer(conversationIsEncrypted)
        if (!offer.law.exportable || offer.holdsBlur || message.holdsBlur) return true
        if (message.isViewOnceOpenedByMe || message.isViewOnce == true || message.isBlurred == true) return true
        if (message.attachments.any { it.protectionVerdict == AttachmentProtectionVerdict.Masked }) return true
        val expiry = message.expiresAt?.let { isoToEpochMillisOrNull(it) }
        return expiry != null && expiry <= nowMillis
    }

    /** Le message cité RÉEL, quand l'appelant l'a en mémoire, fait foi sur la citation. */
    private fun quotesProtected(message: ApiMessage, quotedMessage: ApiMessage?): Boolean {
        val reference = message.replyTo
        if (reference != null && quotedMessage != null && quotedMessage.id == reference.id) {
            if (message.postReplyTo != null || reference.deletedAt != null) return false
            val law = quotedMessage.exitOffer()
            return law.law.nature != ContentExitLaw.Nature.ORDINARY || law.holdsBlur || law.isEncrypted ||
                quotedMessage.attachments.any { it.protectionVerdict == AttachmentProtectionVerdict.Masked }
        }
        return message.quotesProtectedContent
    }

    /** Les pièces qu'une carte peut peindre — photo, vidéo, son, dans l'ordre du message. */
    fun paintableMedia(message: ApiMessage, audioLanguages: Map<String, String> = emptyMap()): List<ImagineMedia> =
        paintableMedia(message.attachments, audioLanguages, stickerMessage = message.servedSticker != null)

    internal fun paintableMedia(
        attachments: List<ApiMessageAttachment>,
        audioLanguages: Map<String, String> = emptyMap(),
        stickerMessage: Boolean = false,
    ): List<ImagineMedia> = attachments.mapNotNull { attachment ->
        if (attachment.isEncrypted == true || attachment.protectionVerdict == AttachmentProtectionVerdict.Masked) return@mapNotNull null
        val kind = kindOf(attachment.mimeType) ?: return@mapNotNull null
        val file = text(attachment.fileUrl) ?: text(attachment.thumbnailUrl) ?: return@mapNotNull null
        val declared = declaredAspect(attachment.width, attachment.height)
        val served = if (kind == ImagineMediaKind.AUDIO) servedTrack(attachment, audioLanguages[attachment.id]) else null
        val ownTranscript = attachment.transcription?.let { text(it.text) ?: text(it.transcribedText) }
        ImagineMedia(
            id = attachment.id.ifEmpty { file },
            kind = kind,
            fileUrl = served?.let { text(it.url) } ?: file,
            posterUrl = if (kind == ImagineMediaKind.AUDIO) null else attachment.thumbnailUrl,
            aspect = declared ?: 1.0,
            aspectKnown = declared != null,
            durationSeconds = (served?.durationMs ?: attachment.duration)?.let { it / 1000.0 }?.takeIf { it > 0 },
            name = if (kind == ImagineMediaKind.AUDIO) text(attachment.originalName) else null,
            transcript = if (kind != ImagineMediaKind.AUDIO) null else if (served != null) text(served.transcription) else ownTranscript,
            isSticker = kind == ImagineMediaKind.IMAGE &&
                ImagineSticker.isSticker(attachment.mimeType, attachment.originalName ?: attachment.fileName, attachment.width, attachment.height, stickerMessage),
        )
    }

    private fun servedTrack(attachment: ApiMessageAttachment, language: String?) =
        language?.lowercase()?.let { code ->
            attachment.translations?.entries
                ?.firstOrNull { it.key.lowercase() == code && text(it.value.url) != null }?.value
        }

    /** Les langues où la réponse EXISTE : son original d'abord, puis chaque traduction servie, sans doublon. */
    fun languages(message: ApiMessage): List<String> {
        val original = text(message.originalLanguage)?.lowercase() ?: return emptyList()
        val served = message.translations.filter { it.isEncrypted != true && text(it.translatedContent) != null }
            .map { it.targetLanguage.lowercase() }.sorted()
        return (listOf(original) + served).distinct()
    }

    /** Ce que le lecteur lit : la traduction servie par le Prisme, sinon l'original (`null` ⇒ original). */
    fun servedTranslation(message: ApiMessage, prism: List<String>): PrismTranslation? =
        PrismTranslationResolver.resolve(
            originalLanguage = message.originalLanguage,
            translations = message.translations.filter { it.isEncrypted != true }
                .associate { it.targetLanguage to it.translatedContent },
            preferredLanguages = prism,
        )

    /**
     * Le sujet d'un message. [language] : la langue d'export choisie — `null` : la carte montre ce que le lecteur lit.
     * [audioLanguages] : la piste SERVIE de chaque son, par pièce — absente, elle suit la langue du texte servi.
     */
    fun subject(
        message: ApiMessage,
        viewer: ImagineViewer,
        prism: List<String>,
        nowMillis: Long,
        language: String? = null,
        quotedMessage: ApiMessage? = null,
        audioLanguages: Map<String, String> = emptyMap(),
        conversationIsEncrypted: Boolean = false,
    ): ImagineSubject? {
        if (!isExportable(message, nowMillis, quotedMessage, conversationIsEncrypted)) return null
        val served = if (language == null) servedTranslation(message, prism) else null
        val chosen = chosenText(message, language, served)
        val servedLanguage = language?.lowercase()?.takeUnless { it == message.originalLanguage?.lowercase() } ?: served?.language?.lowercase()
        val tracks = servedLanguage?.let { code -> message.attachments.associate { it.id to code } }.orEmpty() + audioLanguages
        val media = paintableMedia(message, tracks)
        val body = text(chosen)
        if (body == null && media.isEmpty()) return null
        val isViewer = isViewer(message.senderId ?: message.sender?.resolvedUserId, viewer)
        val reply = ImaginePart(
            author = author(isViewer, listOf(senderName(message), senderUsername(message)), viewer),
            text = body.orEmpty(),
            handle = if (isViewer) viewer.username ?: senderUsername(message) else senderUsername(message),
        )
        val replyAuthor = ImagineMediaAuthor(reply.author, reply.handle)
        val quote = message.replyTo?.takeIf { message.postReplyTo == null && message.storyReplyToId == null }
        val quotedAuthor = quote?.let { quotedMediaAuthor(it, quotedMessage, viewer) }
        val quotedMedia = quote?.let { quotedMedia(it, quotedMessage, tracks, nowMillis) }.orEmpty()
            .filter { quoted -> media.none { it.id == quoted.id } }
        return ImagineSubject(
            quoted = quote?.let { quotePart(it, quotedMessage, viewer, prism, nowMillis) },
            reply = reply,
            sentAtMillis = message.createdAt?.let { isoToEpochMillisOrNull(it) } ?: nowMillis,
            media = media.map { it.by(replyAuthor) } + quotedMedia.map { it.by(quotedAuthor) },
        )
    }

    private fun chosenText(message: ApiMessage, language: String?, served: PrismTranslation?): String {
        if (language == null) return served?.text ?: message.content
        if (language.lowercase() == message.originalLanguage?.lowercase()) return message.content
        return message.translations.firstOrNull { it.isEncrypted != true && it.targetLanguage.lowercase() == language.lowercase() }
            ?.translatedContent?.takeIf { text(it) != null } ?: message.content
    }

    /** La demande de l'atelier : une carte par langue offerte, `null` quand le message ne s'image pas. */
    fun request(
        message: ApiMessage,
        viewer: ImagineViewer,
        prism: List<String>,
        nowMillis: Long,
        handle: String?,
        conversationTitle: String?,
        accentColor: String,
        quotedMessage: ApiMessage? = null,
        audioLanguages: Map<String, String> = emptyMap(),
        conversationIsEncrypted: Boolean = false,
        quick: Boolean = false,
    ): ImagineRequest? {
        val subject = subject(message, viewer, prism, nowMillis, null, quotedMessage, audioLanguages, conversationIsEncrypted) ?: return null
        val cards = languages(message).mapNotNull { code ->
            subject(message, viewer, prism, nowMillis, code, quotedMessage, audioLanguages, conversationIsEncrypted)
                ?.let { ImagineLanguageCard(code, it) }
        }
        return ImagineRequest(subject, cards, handle, conversationTitle, accentColor, quick)
    }

    // ── La citation ──

    private fun quotePart(reference: ApiMessageReplyPreview, real: ApiMessage?, viewer: ImagineViewer, prism: List<String>, nowMillis: Long): ImaginePart? {
        if (!quotedMayLeave(reference, nowMillis)) return null
        val quotedText = quotedText(reference, prism) ?: return null
        val isViewer = isViewer(reference.authorUserId, viewer) || (real != null && isViewer(real.senderId, viewer))
        return ImaginePart(
            author = author(isViewer, listOf(reference.senderDisplayName, reference.sender?.name?.takeIf { it != reference.sender?.id }), viewer),
            text = quotedText,
            handle = if (isViewer) viewer.username else null,
        )
    }

    private fun quotedText(reference: ApiMessageReplyPreview, prism: List<String>): String? {
        val served = reference.translations?.filter { it.isEncrypted != true }
            ?.associate { it.targetLanguage to it.translatedContent }
            ?.let { PrismTranslationResolver.resolve(reference.originalLanguage, it, prism) }
        return text(served?.text) ?: text(reference.content)
    }

    private fun quotedMayLeave(reference: ApiMessageReplyPreview, nowMillis: Long): Boolean {
        if (reference.deletedAt != null || reference.isProtected) return false
        val expiry = reference.expiresAt?.let { isoToEpochMillisOrNull(it) }
        return expiry == null || expiry > nowMillis
    }

    /** Répondre à une photo par du texte, c'est répondre À la photo : la carte la peint, après les médias de la réponse. */
    private fun quotedMedia(
        reference: ApiMessageReplyPreview,
        real: ApiMessage?,
        audioLanguages: Map<String, String>,
        nowMillis: Long,
    ): List<ImagineMedia> {
        if (!quotedMayLeave(reference, nowMillis)) return emptyList()
        if (reference.attachments.orEmpty().any { it.protectionVerdict == AttachmentProtectionVerdict.Masked }) return emptyList()
        if (real != null && real.id == reference.id) {
            return if (real.deletedAt == null && !holdsProtectedContent(real, nowMillis)) paintableMedia(real, audioLanguages) else emptyList()
        }
        return paintableMedia(reference.attachments.orEmpty(), audioLanguages)
    }

    private fun quotedMediaAuthor(reference: ApiMessageReplyPreview, real: ApiMessage?, viewer: ImagineViewer): ImagineMediaAuthor {
        val actual = real?.takeIf { it.id == reference.id }
        val isViewer = isViewer(reference.authorUserId, viewer) || (actual != null && isViewer(actual.senderId, viewer))
        val names = listOf(reference.senderDisplayName) + listOfNotNull(actual?.let(::senderName), actual?.let(::senderUsername))
        return ImagineMediaAuthor(
            name = author(isViewer, names, viewer),
            handle = if (isViewer) viewer.username ?: actual?.let(::senderUsername) else actual?.let(::senderUsername),
            isQuoted = true,
        )
    }

    // ── Les noms ──

    internal fun isViewer(senderId: String?, viewer: ImagineViewer): Boolean =
        !viewer.id.isNullOrEmpty() && senderId == viewer.id

    internal fun author(isViewer: Boolean, names: List<String?>, viewer: ImagineViewer): String {
        val candidates = if (isViewer) listOf(viewer.displayName) + names else names
        return candidates.firstNotNullOfOrNull { text(it) } ?: ANONYMOUS_AUTHOR
    }

    internal fun senderName(message: ApiMessage): String? =
        text(message.sender?.displayName) ?: text(message.sender?.user?.displayName)

    internal fun senderUsername(message: ApiMessage): String? =
        text(message.sender?.username) ?: text(message.sender?.user?.username)

    internal fun text(value: String?): String? = value?.takeIf { it.isNotBlank() }

    private fun kindOf(mimeType: String?): ImagineMediaKind? = when {
        mimeType == null -> null
        mimeType.startsWith("image/", ignoreCase = true) -> ImagineMediaKind.IMAGE
        mimeType.startsWith("video/", ignoreCase = true) -> ImagineMediaKind.VIDEO
        mimeType.startsWith("audio/", ignoreCase = true) -> ImagineMediaKind.AUDIO
        else -> null
    }

    private fun declaredAspect(width: Int?, height: Int?): Double? =
        if (width != null && height != null && width > 0 && height > 0) width.toDouble() / height else null

    const val ANONYMOUS_AUTHOR = "Meeshy"

    /** Le nom du fichier : lisible dans une galerie, sans rien du contenu. */
    fun fileName(epochMillis: Long, zoneOffsetSeconds: Int, output: ImagineOutput = ImagineOutput.IMAGE): String {
        val stamp = java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")
            .format(java.time.Instant.ofEpochMilli(epochMillis).atOffset(java.time.ZoneOffset.ofTotalSeconds(zoneOffsetSeconds)))
        return "meeshy-$stamp.${output.fileExtension}"
    }

    /** `MessageExit.IMAGINE` offre-t-il encore ce message ? Même question que le menu, une seule loi. */
    fun offered(message: ApiMessage, conversationIsEncrypted: Boolean = false): Boolean =
        message.exitOffer(conversationIsEncrypted).offers(MessageExit.IMAGINE)
}

/** Les stickers : un découpage à fond transparent, jamais recadré ni arrondi (`MessageCardSticker`, iOS). */
object ImagineSticker {
    const val MAX_SIDE = 512
    private val ALPHA_MIME = setOf("image/png", "image/webp", "image/apng")

    private fun mime(mimeType: String?, fileName: String?): String? {
        mimeType?.takeIf { it.isNotBlank() }?.let { return it.lowercase() }
        val name = fileName?.takeIf { it.isNotBlank() }?.substringBefore('?') ?: return null
        return when (name.substringAfterLast('.', "").lowercase()) {
            "png" -> "image/png"
            "webp" -> "image/webp"
            "apng" -> "image/apng"
            "jpg", "jpeg" -> "image/jpeg"
            "gif" -> "image/gif"
            "heic", "heif" -> "image/heic"
            else -> null
        }
    }

    fun isSticker(mimeType: String?, fileName: String?, width: Int?, height: Int?, flagged: Boolean = false): Boolean {
        val resolved = mime(mimeType, fileName) ?: return false
        if (resolved !in ALPHA_MIME) return false
        if (flagged) return true
        if (width == null || height == null || width <= 0 || height <= 0) return false
        return maxOf(width, height) <= MAX_SIDE
    }
}
