package me.meeshy.sdk.model

import java.util.Locale
import me.meeshy.sdk.model.translation.DeviceTranslationEligibility

/**
 * LE TYPE DE CONTENU D'UN MESSAGE (#11205, #11209) — miroir exact de `messageContentKind`
 * (`packages/shared/utils/message-content-kind.ts`, qui fait foi) et de `MessageContentKind.swift`,
 * dérivé en UN site : ce que le message EST ; ce qu'un lecteur en FAIT est [MessageActionPolicy].
 * Ordre de lecture : supprimé, système (dont l'appel), formes de la métadonnée (sticker, lieu —
 * écrit en `text` par le serveur, #7590 —, sondage), pièces jointes, texte.
 */
enum class MessageContentKind(val wireValue: String) {
    TEXT("text"),
    LINK("link"),
    IMAGE("image"),
    VIDEO("video"),
    AUDIO("audio"),
    FILE("file"),
    LOCATION("location"),
    CONTACT("contact"),
    POLL("poll"),
    STICKER("sticker"),
    CALL("call"),
    SYSTEM("system"),
    DELETED("deleted"),
    MULTI("multi"),
    ;

    /** Les drapeaux protégés et d'état, lus sur le message ET ses pièces. */
    data class Flags(
        val viewOnce: Boolean,
        val blurred: Boolean,
        /** Le serveur ne lit pas le clair (`sharedTranslationServerReadsMessage`, régime inconnu ⇒ chiffré). */
        val encrypted: Boolean,
        val ephemeral: Boolean,
        /** Identifiant client `cid_…` : le serveur ne connaît pas encore ce message. */
        val optimistic: Boolean,
        val failed: Boolean,
        val captureNotice: Boolean,
    )

    data class Shape(val kind: MessageContentKind, val flags: Flags)

    /** Ce que la loi lit d'une pièce jointe. */
    data class Piece(
        val mimeType: String? = null,
        val originalName: String? = null,
        val fileName: String? = null,
        val isViewOnce: Boolean? = null,
        val isBlurred: Boolean? = null,
        val effectFlags: Long? = null,
    )

    /** Ce que la loi lit de `Message.metadata` : sa clé `kind` et les formes qu'elle PORTE (clé présente, non nulle). */
    data class Metadata(
        val kind: String? = null,
        val carriesSticker: Boolean = false,
        val carriesLocation: Boolean = false,
        val carriesPoll: Boolean = false,
    ) {
        companion object {
            val Empty: Metadata = Metadata()
        }
    }

    /** Ce que la loi lit d'un message. Tout est facultatif : un champ absent ne déclare rien. */
    data class Subject(
        val id: String,
        val content: String? = null,
        val messageType: String? = null,
        /** Sa seule PRÉSENCE fait un message supprimé. */
        val deletedAt: String? = null,
        val isViewOnce: Boolean? = null,
        val isBlurred: Boolean? = null,
        val isEncrypted: Boolean? = null,
        val encryptionMode: String? = null,
        val effectFlags: Long? = null,
        /** Sa seule PRÉSENCE déclare un éphémère ; lue comme instant, c'est l'heure où il cesse d'être vivant. */
        val expiresAt: String? = null,
        val ephemeralDuration: Double? = null,
        val metadata: Metadata = Metadata.Empty,
        val attachments: List<Piece?>? = null,
        /** L'envoi a échoué — posé par le client qui l'a tenté. */
        val failed: Boolean? = null,
    ) {
        val pieces: List<Piece> get() = attachments.orEmpty().filterNotNull()

        /** L'instant d'expiration lisible, ou `null`. */
        val expiresAtMillis: Long? get() = isoToEpochMillisOrNull(expiresAt)

        /** Ce que la loi de sortie lit de ce message. */
        val contentExitSubject: ContentExitLaw.Subject
            get() = ContentExitLaw.Subject(
                isViewOnce = isViewOnce,
                isBlurred = isBlurred,
                effectFlags = effectFlags,
                ephemeralDuration = ephemeralDuration,
                hasExpiry = expiresAtMillis != null,
                attachments = attachments?.map { piece ->
                    piece?.let {
                        ContentExitLaw.Piece(isViewOnce = it.isViewOnce, isBlurred = it.isBlurred, effectFlags = it.effectFlags)
                    }
                },
            )
    }

    companion object {
        /** `CAPTURE_NOTICE_KIND` (`packages/shared/utils/capture-notice.ts`). */
        const val CAPTURE_NOTICE_KIND: String = "content-capture"

        private val CALL_KINDS: Set<String> = setOf("call", "call-live")

        /** `(?<![@\w])https?:\/\/\S`, `\w` au sens ASCII de JavaScript. */
        private val WEB_ADDRESS = Regex("(?<![@A-Za-z0-9_])https?://\\S", RegexOption.IGNORE_CASE)

        private val CONTACT_CARD_ALIASES: Set<String> = setOf("text/vcard", "text/x-vcard", "text/directory", "text/x-vcf")
        private val GENERIC_MIME_TYPES: Set<String> = setOf("", "application/octet-stream", "text/plain", "application/vcard")

        private const val EPHEMERAL_BITS: Long = MessageEffectFlags.EPHEMERAL or MessageEffectFlags.EPHEMERAL_AFTER_READ

        fun shapeOf(subject: Subject): Shape = Shape(kindOf(subject), flagsOf(subject))

        private fun kindOf(subject: Subject): MessageContentKind {
            val metadata = subject.metadata
            if (subject.deletedAt != null) return DELETED
            if (subject.messageType == "system") return if (metadata.kind in CALL_KINDS) CALL else SYSTEM
            if (subject.messageType == "sticker" || metadata.carriesSticker) return STICKER
            if (subject.messageType == "location" || metadata.carriesLocation) return LOCATION
            if (metadata.carriesPoll) return POLL
            val pieces = subject.pieces
            if (pieces.size > 1) return MULTI
            val only = pieces.firstOrNull()
            if (only != null) return pieceKind(only)
            return if (WEB_ADDRESS.containsMatchIn(subject.content ?: "")) LINK else TEXT
        }

        private fun pieceKind(piece: Piece): MessageContentKind {
            if (isContactCard(piece.mimeType ?: "", piece.originalName ?: piece.fileName)) return CONTACT
            val mime = (piece.mimeType ?: "").lowercase(Locale.ROOT)
            return when {
                mime.startsWith("image/") -> IMAGE
                mime.startsWith("audio/") -> AUDIO
                mime.startsWith("video/") -> VIDEO
                else -> FILE
            }
        }

        /** `isContactCardAttachment` (`packages/shared/utils/vcard.ts`). */
        private fun isContactCard(mimeType: String, fileName: String?): Boolean {
            val bare = mimeType.split(";", limit = 2).first().trim().lowercase(Locale.ROOT)
            if (bare in CONTACT_CARD_ALIASES) return true
            if (bare !in GENERIC_MIME_TYPES || fileName.isNullOrEmpty()) return false
            val name = fileName.trim().lowercase(Locale.ROOT)
            return name.endsWith(".vcf") || name.endsWith(".vcard")
        }

        private fun flagsOf(subject: Subject): Flags {
            val pieces = subject.pieces
            val bits = pieces.fold(subject.effectFlags ?: 0L) { acc, piece -> acc or (piece.effectFlags ?: 0L) }
            return Flags(
                viewOnce = subject.isViewOnce == true ||
                    pieces.any { it.isViewOnce == true } ||
                    (bits and MessageEffectFlags.VIEW_ONCE) != 0L,
                blurred = subject.isBlurred == true ||
                    pieces.any { it.isBlurred == true } ||
                    (bits and MessageEffectFlags.BLURRED) != 0L,
                encrypted = !DeviceTranslationEligibility.serverReadsMessage(
                    conversationEncryptionMode = null,
                    isEncrypted = subject.isEncrypted,
                    encryptionMode = subject.encryptionMode,
                ),
                ephemeral = subject.expiresAt != null ||
                    (subject.ephemeralDuration ?: 0.0) > 0.0 ||
                    (bits and EPHEMERAL_BITS) != 0L,
                optimistic = subject.id.startsWith("cid_"),
                failed = subject.failed == true,
                captureNotice = subject.messageType == "system" && subject.metadata.kind == CAPTURE_NOTICE_KIND,
            )
        }
    }
}
