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
 *   désaccord (un « image/png » qui est une vidéo), jamais à admettre. Un format qu'on ne reconnaît pas est refusé
 *   (fail-closed) : ni SVG (script), ni HTML, ni archive.
 * - La TAILLE : bornée au plafond d'envoi, vérifiée sur ce qui a été LU, pas sur ce que l'expéditeur annonce.
 */
object InboundMediaPolicy {
    const val MAX_BYTES: Long = ComposerAttachmentLimits.MAX_UPLOAD_BYTES

    /** Les octets de tête suffisants pour reconnaître chaque format admis. */
    const val HEADER_BYTES: Int = 32

    private const val CONTENT_SCHEME = "content"

    /** [ownNamespace] est l'identifiant de l'application : ses fournisseurs (`<id>.fileprovider`, `<id>.androidx-startup`…) en portent le préfixe. */
    fun admitsSource(scheme: String?, authority: String?, ownNamespace: String): Boolean {
        if (!CONTENT_SCHEME.equals(scheme?.trim(), ignoreCase = true)) return false
        val host = authority?.substringAfterLast('@')?.trim()?.lowercase().orEmpty()
        val own = ownNamespace.trim().lowercase()
        return host.isNotEmpty() && own.isNotEmpty() && host != own && !host.startsWith("$own.")
    }

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
        if (header.size >= FTYP_END && header.at(4, 0x66, 0x74, 0x79, 0x70)) return brand(String(header, 8, 4, Charsets.ISO_8859_1))
        if (header.size < FTYP_END) return null
        return when (ImageSourceFormat.sniff(header)) {
            ImageSourceFormat.JPEG -> Identity(InboundMediaKind.IMAGE, "image/jpeg", "jpg")
            ImageSourceFormat.PNG -> Identity(InboundMediaKind.IMAGE, "image/png", "png")
            ImageSourceFormat.GIF -> Identity(InboundMediaKind.IMAGE, "image/gif", "gif")
            ImageSourceFormat.WEBP -> Identity(InboundMediaKind.IMAGE, "image/webp", "webp")
            ImageSourceFormat.HEIC, ImageSourceFormat.UNKNOWN -> null
        }
    }

    private fun brand(major: String): Identity? = when {
        major in IMAGE_BRANDS -> Identity(InboundMediaKind.IMAGE, if (major.startsWith("avi")) "image/avif" else "image/heic", if (major.startsWith("avi")) "avif" else "heic")
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
    private val IMAGE_BRANDS = setOf("heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "avif", "avis")
    private val VIDEO_BRANDS = setOf("isom", "iso2", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "M4V ", "M4VH", "M4VP", "dash", "MSNV", "f4v ")
}
