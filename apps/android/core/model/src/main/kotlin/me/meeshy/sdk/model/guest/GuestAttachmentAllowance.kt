package me.meeshy.sdk.model.guest

/** Les familles de pieces jointes qu'un lien d'invite peut ouvrir (iOS `GuestAttachmentKind`, `GUEST_ATTACHMENT_KIND_EXTENSIONS`). */
enum class GuestAttachmentKind(val wire: String, val fileExtensions: List<String>) {
    TEXT("text", listOf("txt")),
    AUDIO("audio", listOf("mp3", "m4a", "mp4", "aac", "ogg", "oga", "opus", "webm", "weba", "wav")),
    IMAGE("image", listOf("jpg", "jpeg", "png", "gif", "webp")),
    PDF("pdf", listOf("pdf")),
    ;

    companion object {
        /** Le plafond de World Wide : ce qu'un invite y joint au plus, quoi que disent les termes de son lien. */
        val WORLD_GUEST_CEILING: List<GuestAttachmentKind> = listOf(TEXT, AUDIO)

        private val IMAGE_MIME = setOf("image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp")

        /** La famille que DECLARE un nom de fichier — jamais une preuve. */
        fun ofFileName(fileName: String): GuestAttachmentKind? {
            val extension = fileName.substringAfterLast('.', "").lowercase().takeIf { it.isNotEmpty() } ?: return null
            return entries.firstOrNull { extension in it.fileExtensions }
        }

        /** La famille que DECLARE un type MIME. */
        fun ofMimeType(mimeType: String?): GuestAttachmentKind? {
            val base = mimeType?.substringBefore(';')?.trim()?.lowercase() ?: return null
            return when {
                base == "text/plain" -> TEXT
                base.startsWith("audio/") -> AUDIO
                base in IMAGE_MIME -> IMAGE
                base == "application/pdf" -> PDF
                else -> null
            }
        }

        /** Lecture TOLERANTE des termes servis : `null` reste `null` (aucune restriction), une famille inconnue est ignoree. */
        fun knownKinds(raw: List<String>?): List<GuestAttachmentKind>? = raw?.let { served -> entries.filter { it.wire in served } }
    }
}

/** Le refus d'une piece jointe d'invite (`GUEST_ATTACHMENT_REFUSAL_CODES`) : 403 famille fermee, 413 piece trop lourde. */
data class GuestAttachmentRefusal(val reason: Reason, val serverMessage: String? = null) {
    enum class Reason(val code: String) {
        KIND_NOT_ALLOWED("GUEST_ATTACHMENT_KIND_NOT_ALLOWED"),
        TOO_LARGE("GUEST_ATTACHMENT_TOO_LARGE"),
    }
}

/**
 * Les familles qu'un invite peut joindre dans SA session — `kinds == null` quand le lien ne restreint rien (les droits
 * `canSend*` s'appliquent alors comme avant), une liste quand elle fait foi (iOS `GuestAttachmentAllowance`).
 */
data class GuestAttachmentAllowance(val kinds: List<GuestAttachmentKind>?) {
    val isRestricted: Boolean get() = kinds != null

    fun allows(kind: GuestAttachmentKind): Boolean = kinds?.contains(kind) ?: true

    /** Photothèque, appareil photo, stickers : ce qui produit une IMAGE. */
    val offersVisualMedia: Boolean get() = allows(GuestAttachmentKind.IMAGE)

    /** Le micro du composeur produit de l'audio. */
    val offersVoiceRecording: Boolean get() = allows(GuestAttachmentKind.AUDIO)

    /** Le selecteur de fichiers s'ouvre des qu'une famille au moins est ouverte. */
    val offersFiles: Boolean get() = kinds?.isNotEmpty() ?: true

    /** Une fiche de contact ou un lieu ne sont dans aucune famille : un lien restreint ne les offre pas. */
    val offersContactsAndPlaces: Boolean get() = !isRestricted

    /** Des termes ABSENTS prennent le plafond — jamais « tout » —, des termes plus larges y sont resserres. */
    fun cappedBy(ceiling: List<GuestAttachmentKind>): GuestAttachmentAllowance =
        GuestAttachmentAllowance((kinds ?: ceiling).filter { it in ceiling })

    sealed interface Verdict {
        /** Admis ; la famille declaree par le nom, quand elle est connue. */
        data class Accepted(val kind: GuestAttachmentKind?) : Verdict
        data class Refused(val reason: GuestAttachmentRefusal.Reason) : Verdict
    }

    /** Le verdict sur un fichier CHOISI, avant tout envoi : la famille par l'extension, puis la borne de taille. */
    fun verdict(fileName: String, byteCount: Long): Verdict {
        val declared = GuestAttachmentKind.ofFileName(fileName)
        val open = kinds ?: return Verdict.Accepted(declared)
        if (declared == null || declared !in open) return Verdict.Refused(GuestAttachmentRefusal.Reason.KIND_NOT_ALLOWED)
        if (byteCount > MAX_BYTES) return Verdict.Refused(GuestAttachmentRefusal.Reason.TOO_LARGE)
        return Verdict.Accepted(declared)
    }

    companion object {
        val UNRESTRICTED = GuestAttachmentAllowance(null)

        /** Aucune famille ouverte : aucune porte de piece, de lieu ni de sticker. */
        val CLOSED = GuestAttachmentAllowance(emptyList())

        /** `GUEST_ATTACHMENT_MAX_BYTES` — le serveur lit le fichier ENTIER pour le juger. */
        const val MAX_BYTES: Long = 25L * 1024 * 1024
    }
}

/** Ce qu'une selection de fichiers devient pour un invite restreint : les admis partent, le premier refuse est EXPLIQUE. */
data class GuestAttachmentScreening(val acceptedIndices: List<Int>, val refusals: List<Refusal>) {
    data class Candidate(val name: String, val byteCount: Long)
    data class Refusal(val fileName: String, val reason: GuestAttachmentRefusal.Reason)

    companion object {
        fun of(candidates: List<Candidate>, allowance: GuestAttachmentAllowance): GuestAttachmentScreening {
            val verdicts = candidates.map { allowance.verdict(it.name, it.byteCount) }
            return GuestAttachmentScreening(
                acceptedIndices = verdicts.indices.filter { verdicts[it] is GuestAttachmentAllowance.Verdict.Accepted },
                refusals = verdicts.indices.mapNotNull { index ->
                    (verdicts[index] as? GuestAttachmentAllowance.Verdict.Refused)?.let { Refusal(candidates[index].name, it.reason) }
                },
            )
        }
    }
}
