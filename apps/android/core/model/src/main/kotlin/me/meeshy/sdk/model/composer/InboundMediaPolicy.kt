package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.media.ImageSourceFormat

enum class InboundMediaKind { IMAGE, VIDEO }

enum class InboundMediaRefusal { SOURCE_NOT_ALLOWED, EMPTY, TOO_LARGE, UNRECOGNIZED, DECLARED_TYPE_DISAGREES }

/** Ce que la politique dit d'un fichier reçu : le type qu'il EST (lu dans ses octets), ou la raison du refus. */
sealed interface InboundMediaVerdict {
    data class Admitted(val kind: InboundMediaKind, val mimeType: String, val extension: String) : InboundMediaVerdict
    data class Refused(val reason: InboundMediaRefusal) : InboundMediaVerdict
}

/**
 * **Ce qu'un média reçu d'une autre app a le droit d'être** (#13527) — partage entrant, collage : du contenu NON FIABLE.
 *
 * - La SOURCE : un `content://` d'une autre app, jamais un `file://` (le chemin d'un fichier se lit avec NOS droits : un
 *   `file:///data/data/me.meeshy.app/…` fait lire à Meeshy ses propres secrets), ni une URI de nos propres fournisseurs
 *   (un intent forgé ferait relire par Meeshy, avec ses droits, ce qu'il a lui-même exposé), ni un `android.resource`.
 * - Le TYPE : lu dans les OCTETS. Le type déclaré par l'expéditeur n'est qu'un indice ; il ne sert qu'à refuser un
 *   désaccord (un « image/png » qui est une vidéo), jamais à admettre. Un format inconnu est refusé (fail-closed) : ni SVG (script), ni HTML,
 *   ni archive — ni l'AVIF, que le retrait des métadonnées ne saurait pas réécrire : mieux vaut le refuser ici qu'à la publication.
 * - La TAILLE : bornée au plafond d'envoi, vérifiée sur ce qui a été LU, pas sur ce que l'expéditeur annonce.
 */
object InboundMediaPolicy {
    const val MAX_BYTES: Long = ComposerAttachmentLimits.MAX_UPLOAD_BYTES

    /** Les octets de tête suffisants pour reconnaître chaque format admis. */
    const val HEADER_BYTES: Int = 64

    private const val CONTENT_SCHEME = "content"

    /**
     * [ownNamespace] est l'identifiant de l'application : ses fournisseurs (`<id>.fileprovider`, `<id>.androidx-startup`…) en portent
     * le préfixe ; [providerIsOurs] couvre ceux qu'une bibliothèque déclare sous un autre nom (résolu par le gestionnaire de paquets).
     *
     * [grantRecorded] : le système a INSCRIT une autorisation par URI au nom de Meeshy (`Context.checkUriPermission(uri, myPid, myUid,
     * READ)`, qui ne voit QUE les autorisations explicites, jamais les permissions de Meeshy). Le drapeau
     * `FLAG_GRANT_READ_URI_PERMISSION` de l'intent ne prouve rien : l'expéditeur le pose lui-même, et quand le destinataire détient
     * déjà l'accès au fournisseur, le système n'inscrit rien et ne vérifie pas l'expéditeur. Pour un fournisseur que Meeshy lit avec
     * SES propres permissions d'exécution ([RECEIVER_RIGHTS_AUTHORITIES] : contacts, journal d'appels, SMS, agenda…), seule une
     * autorisation inscrite admet l'URI — sinon une app sans accès ferait lire et publier par Meeshy ce qu'elle ne peut pas lire.
     *
     * `media` reste admis sans autorisation inscrite : la Galerie le partage, et quand Meeshy détient l'accès aux photos le système
     * n'inscrit rien, si bien qu'un refus couperait le partage depuis la Galerie. Le risque résiduel (une app sans accès fait ouvrir
     * par Meeshy une photo de l'utilisateur) ne donne rien à cette app : la photo reste chez l'utilisateur, qui la voit et décide.
     */
    fun admitsSource(scheme: String?, authority: String?, ownNamespace: String, grantRecorded: Boolean, providerIsOurs: Boolean = false): Boolean {
        if (providerIsOurs) return false
        if (!CONTENT_SCHEME.equals(scheme?.trim(), ignoreCase = true)) return false
        val host = authority?.substringAfterLast('@')?.trim()?.lowercase().orEmpty()
        val own = ownNamespace.trim().lowercase()
        if (host.isEmpty() || own.isEmpty() || host == own || host.startsWith("$own.")) return false
        return grantRecorded || host !in RECEIVER_RIGHTS_AUTHORITIES
    }

    private val RECEIVER_RIGHTS_AUTHORITIES = setOf(
        "com.android.contacts", "contacts", "call_log", "call_log_shadow", "sms", "mms", "mms-sms", "icc",
        "com.android.calendar", "calendar", "user_dictionary", "com.android.voicemail", "com.android.blockednumber",
    )

    fun judge(header: ByteArray, totalBytes: Long, declaredMime: String?): InboundMediaVerdict {
        if (totalBytes <= 0L) return InboundMediaVerdict.Refused(InboundMediaRefusal.EMPTY)
        if (totalBytes > MAX_BYTES) return InboundMediaVerdict.Refused(InboundMediaRefusal.TOO_LARGE)
        val identity = identify(header) ?: return InboundMediaVerdict.Refused(InboundMediaRefusal.UNRECOGNIZED)
        if (!declaredAgrees(declaredMime, identity.kind)) return InboundMediaVerdict.Refused(InboundMediaRefusal.DECLARED_TYPE_DISAGREES)
        return InboundMediaVerdict.Admitted(identity.kind, identity.mimeType, identity.extension)
    }

    private data class Identity(val kind: InboundMediaKind, val mimeType: String, val extension: String)

    private fun identify(header: ByteArray): Identity? {
        if (header.size >= 4 && header.startsWith(0x1A, 0x45, 0xDF, 0xA3)) return Identity(InboundMediaKind.VIDEO, "video/webm", "webm")
        if (header.size >= FTYP_END && header.at(4, 0x66, 0x74, 0x79, 0x70)) return brand(header)
        if (header.size < FTYP_END) return null
        return when (ImageSourceFormat.sniff(header)) {
            ImageSourceFormat.JPEG -> Identity(InboundMediaKind.IMAGE, "image/jpeg", "jpg")
            ImageSourceFormat.PNG -> Identity(InboundMediaKind.IMAGE, "image/png", "png")
            ImageSourceFormat.GIF -> Identity(InboundMediaKind.IMAGE, "image/gif", "gif")
            ImageSourceFormat.WEBP -> Identity(InboundMediaKind.IMAGE, "image/webp", "webp")
            ImageSourceFormat.HEIC, ImageSourceFormat.UNKNOWN -> null
        }
    }

    /** Les marques de la boîte `ftyp` : la principale, puis les compatibles. Un AVIF est souvent `mif1` AVEC `avif` compatible. */
    private fun brand(header: ByteArray): Identity? {
        val major = String(header, 8, 4, Charsets.ISO_8859_1)
        val size = (header.take(4).fold(0L) { acc, byte -> (acc shl 8) or (byte.toLong() and 0xFF) }).coerceIn(FTYP_END.toLong(), header.size.toLong()).toInt()
        val compatible = (16 until size - 3 step 4).map { String(header, it, 4, Charsets.ISO_8859_1) }
        if ((compatible + major).any { it in UNREWRITABLE_BRANDS }) return null
        return brandIdentity(major)
    }

    private fun brandIdentity(major: String): Identity? = when {
        major in IMAGE_BRANDS -> Identity(InboundMediaKind.IMAGE, "image/heic", "heic")
        major == "qt  " -> Identity(InboundMediaKind.VIDEO, "video/quicktime", "mov")
        major.startsWith("3g") -> Identity(InboundMediaKind.VIDEO, "video/3gpp", "3gp")
        major in VIDEO_BRANDS -> Identity(InboundMediaKind.VIDEO, "video/mp4", "mp4")
        else -> null
    }

    private fun declaredAgrees(declared: String?, kind: InboundMediaKind): Boolean {
        val top = declared?.trim()?.lowercase()?.substringBefore('/').orEmpty()
        return when {
            top.isEmpty() || top == "*" || declared?.trim()?.lowercase() == "application/octet-stream" -> true
            top == "image" -> kind == InboundMediaKind.IMAGE
            top == "video" -> kind == InboundMediaKind.VIDEO
            else -> false
        }
    }

    private fun ByteArray.at(offset: Int, vararg expected: Int) = expected.indices.all { this[offset + it].toInt() and 0xFF == expected[it] }
    private fun ByteArray.startsWith(vararg expected: Int) = at(0, *expected)

    private const val FTYP_END = 12
    private val UNREWRITABLE_BRANDS = setOf("avif", "avis")
    private val IMAGE_BRANDS = setOf("heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1")
    private val VIDEO_BRANDS = setOf("isom", "iso2", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "M4V ", "M4VH", "M4VP", "dash", "MSNV", "f4v ")
}
