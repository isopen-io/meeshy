package me.meeshy.sdk.model.mediahub

import java.text.Normalizer
import java.util.Locale
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.AttachmentProtection
import me.meeshy.sdk.model.AttachmentProtectionVerdict
import me.meeshy.sdk.model.ImageVariantPicker
import me.meeshy.sdk.model.MeeshyImageVariant
import me.meeshy.sdk.model.deeplink.ConversationLinkTarget
import me.meeshy.sdk.model.isEndToEndBlob
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/** Une pièce telle que l'écran la rend : seulement des métadonnées, les octets ne se téléchargent qu'à l'ouverture. */
data class MediaHubAttachment(
    val id: String,
    val url: String,
    val thumbnailUrl: String?,
    val name: String,
    val mimeType: String?,
    val sizeBytes: Long?,
    val durationMs: Int?,
    val isVideo: Boolean,
    /** Un fichier chiffré de bout en bout : le serveur le liste, il ne peut pas le montrer. */
    val isEncrypted: Boolean,
    val alt: String?,
    val width: Int? = null,
    val variants: List<MeeshyImageVariant> = emptyList(),
) {
    /**
     * L'URL de vignette à charger pour une tuile de [targetWidthPx] pixels : la PLUS PETITE variante suffisante
     * (#12469), sinon la vignette serveur, sinon l'original d'une image. `null` pour un fichier chiffré (le serveur
     * ne sert que des octets illisibles) et pour une vidéo sans vignette (rien d'autre à montrer qu'un lecteur).
     */
    fun tileUrl(targetWidthPx: Int): String? {
        if (isEncrypted) return null
        if (isVideo) return thumbnailUrl
        val fallback = thumbnailUrl ?: url
        return ImageVariantPicker.bestImageUrl(variants, fallback, width, targetWidthPx)
    }

    /** Les adresses telles que la passerelle les sert (clé, chemin) rendues chargeables par [resolve] — le site unique du SDK. */
    fun resolvingMedia(resolve: (String) -> String): MediaHubAttachment = copy(
        url = resolve(url),
        thumbnailUrl = thumbnailUrl?.let(resolve),
        variants = variants.map { it.copy(url = resolve(it.url)) },
    )
}

sealed interface MediaHubPayload {
    data class Attachment(val attachment: MediaHubAttachment) : MediaHubPayload
    data class Link(val url: String, val host: String) : MediaHubPayload
    data class Place(val latitude: Double, val longitude: Double, val name: String?) : MediaHubPayload
}

/** Un élément d'un segment — ce qu'une cellule rend. [id] est `messageId:clé`, stable d'une page à l'autre. */
data class MediaHubItem(
    val id: String,
    val kind: ConversationMediaKind,
    val messageId: String,
    val sentAtIso: String?,
    val sentAtMillis: Long,
    val senderName: String,
    val payload: MediaHubPayload,
) {
    val attachment: MediaHubAttachment? get() = (payload as? MediaHubPayload.Attachment)?.attachment

    /** L'élément dont les adresses de pièce passent par [resolve] ; un lien ou un lieu reste tel quel. */
    fun resolvingMedia(resolve: (String) -> String): MediaHubItem {
        val piece = attachment ?: return this
        return copy(payload = MediaHubPayload.Attachment(piece.resolvingMedia(resolve)))
    }
}

/**
 * L'écran « Médias, liens et documents », genre par genre — miroir de `ConversationMediaHubRules` (iOS).
 * La passerelle sert des MESSAGES ; l'écran montre des ÉLÉMENTS. Fonctions PURES : pages réseau, index en mémoire et
 * recherche locale hors ligne passent par elles — un seul tri, une seule exclusion.
 */
object ConversationMediaHubRules {

    private val URL_PATTERN = Regex("""(?i)\b(?:https?://|meeshy://)[^\s<>"]+""")
    private val TRAILING_PUNCTUATION = charArrayOf('.', ',', ';', ':', '!', '?', ')', ']', '}', '\'')

    /**
     * Un porteur a-t-il sa place dans l'écran ? Mêmes exclusions que la galerie : supprimé, échu, masqué « pour
     * moi », et tout ce qui est à vue unique ou flouté (le fil le cache, la liste ne le montre pas en clair).
     */
    fun admits(message: ApiMessage, nowMillis: Long, isHidden: (String) -> Boolean): Boolean {
        if (message.deletedAt != null || message.isViewOnce == true || isHidden(message.id)) return false
        val expiresAt = message.expiresAt?.let(::isoToEpochMillisOrNull)
        return expiresAt == null || expiresAt > nowMillis
    }

    fun items(
        carriers: List<ApiMessage>,
        kind: ConversationMediaKind,
        nowMillis: Long,
        webOrigin: String,
        isHidden: (String) -> Boolean = { false },
    ): List<MediaHubItem> =
        carriers
            .filter { admits(it, nowMillis, isHidden) }
            .sortedWith(NEWEST_FIRST)
            .flatMap { items(it, kind, webOrigin) }

    fun items(message: ApiMessage, kind: ConversationMediaKind, webOrigin: String): List<MediaHubItem> =
        when (kind) {
            ConversationMediaKind.VISUAL, ConversationMediaKind.AUDIO,
            ConversationMediaKind.DOCUMENT, ConversationMediaKind.CONTACT -> attachmentItems(message, kind)
            ConversationMediaKind.LINK, ConversationMediaKind.CONVERSATION -> linkItems(message, kind, webOrigin)
            ConversationMediaKind.LOCATION -> placeItems(message)
        }

    /** Une pièce porteuse d'un lieu n'est dans aucun segment de pièces : son type MIME ferait sinon un « document ». */
    fun kindOf(attachment: ApiMessageAttachment): ConversationMediaKind? =
        if (attachment.latitude != null && attachment.longitude != null) null
        else ConversationMediaKind.ofMime(attachment.mimeType)

    /** Les adresses d'un texte (web et `meeshy://`), dédoublonnées, dans l'ordre. */
    fun urlsIn(text: String): List<String> =
        URL_PATTERN.findAll(text).map { it.value.trimEnd(*TRAILING_PUNCTUATION) }.filter { it.length > 8 }.distinct().toList()

    /** Contenu ou nom d'origine d'une pièce, sans casse ni accents — la recherche locale, hors ligne comprise. */
    fun matches(message: ApiMessage, query: String): Boolean {
        val term = fold(query.trim())
        if (term.isEmpty()) return true
        if (fold(message.content).contains(term)) return true
        return message.attachments.any { !isMaskedPiece(it) && fold(it.originalName ?: it.fileName ?: "").contains(term) }
    }

    val NEWEST_FIRST: Comparator<ApiMessage> = Comparator { lhs, rhs ->
        val l = millis(lhs)
        val r = millis(rhs)
        if (l == r) rhs.id.compareTo(lhs.id) else r.compareTo(l)
    }

    /** UNIT des porteurs à un index sans jamais écraser (la galerie écrit le même index visuel). */
    fun union(existing: List<ApiMessage>, incoming: List<ApiMessage>): List<ApiMessage> {
        val byId = LinkedHashMap<String, ApiMessage>()
        existing.forEach { byId[it.id] = it }
        incoming.forEach { byId[it.id] = it }
        return byId.values.sortedWith(NEWEST_FIRST)
    }

    private fun attachmentItems(message: ApiMessage, kind: ConversationMediaKind): List<MediaHubItem> =
        message.attachments
            .filter { !isMaskedPiece(it) && kindOf(it) == kind }
            .mapNotNull { piece ->
                val url = piece.fileUrl ?: return@mapNotNull null
                item(message, kind, piece.id, MediaHubPayload.Attachment(piece.toHubAttachment(url)))
            }

    private fun linkItems(message: ApiMessage, kind: ConversationMediaKind, webOrigin: String): List<MediaHubItem> =
        urlsIn(message.content).mapNotNull { url ->
            val isConversation = ConversationLinkTarget.target(url, webOrigin) != null
            val isWeb = url.startsWith("http://", ignoreCase = true) || url.startsWith("https://", ignoreCase = true)
            when {
                kind == ConversationMediaKind.CONVERSATION && !isConversation -> null
                kind == ConversationMediaKind.LINK && !isWeb -> null
                else -> item(message, kind, url, MediaHubPayload.Link(url, hostOf(url)))
            }
        }

    private fun placeItems(message: ApiMessage): List<MediaHubItem> {
        val shared = message.location
        val place = if (shared != null) {
            MediaHubPayload.Place(shared.latitude, shared.longitude, shared.name)
        } else {
            message.attachments.firstNotNullOfOrNull { piece ->
                val lat = piece.latitude ?: return@firstNotNullOfOrNull null
                val lon = piece.longitude ?: return@firstNotNullOfOrNull null
                MediaHubPayload.Place(lat, lon, (piece.originalName ?: "").ifBlank { null })
            }
        } ?: return emptyList()
        return listOf(item(message, ConversationMediaKind.LOCATION, "place", place))
    }

    private fun item(message: ApiMessage, kind: ConversationMediaKind, key: String, payload: MediaHubPayload) =
        MediaHubItem(
            id = "${message.id}:$key",
            kind = kind,
            messageId = message.id,
            sentAtIso = message.createdAt,
            sentAtMillis = millis(message),
            senderName = senderNameOf(message),
            payload = payload,
        )

    private fun isMaskedPiece(piece: ApiMessageAttachment): Boolean =
        AttachmentProtection.verdict(piece.isViewOnce, piece.isBlurred, piece.effectFlags) == AttachmentProtectionVerdict.Masked

    private fun ApiMessageAttachment.toHubAttachment(url: String) = MediaHubAttachment(
        id = id,
        url = url,
        thumbnailUrl = thumbnailUrl,
        name = originalName ?: fileName ?: "",
        mimeType = mimeType,
        sizeBytes = fileSize?.toLong(),
        durationMs = duration,
        isVideo = (mimeType ?: "").startsWith("video/", ignoreCase = true),
        isEncrypted = isEncrypted == true || isEndToEndBlob,
        alt = alt,
        width = width,
        variants = imageVariants.orEmpty(),
    )

    private fun senderNameOf(message: ApiMessage): String {
        val sender = message.sender ?: return ""
        return (sender.displayName ?: sender.user?.displayName ?: sender.username ?: sender.user?.username ?: "").trim()
    }

    private fun millis(message: ApiMessage): Long = message.createdAt?.let(::isoToEpochMillisOrNull) ?: 0L

    private fun hostOf(url: String): String {
        val afterScheme = url.substringAfter("://", url)
        return afterScheme.substringBefore('/').substringBefore('?').substringBefore('#').lowercase(Locale.ROOT)
    }

    private fun fold(text: String): String =
        Normalizer.normalize(text, Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "").lowercase(Locale.ROOT)
}
