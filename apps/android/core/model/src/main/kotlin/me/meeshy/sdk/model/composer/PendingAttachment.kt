package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.AttachmentMessageType

/** Famille d'une pièce en attente, dérivée de son type MIME. */
enum class PendingAttachmentType {
    IMAGE,
    VIDEO,
    AUDIO,
    FILE,
    ;

    companion object {
        fun forMime(mime: String?): PendingAttachmentType = when (AttachmentMessageType.forMime(mime)) {
            AttachmentMessageType.IMAGE -> IMAGE
            AttachmentMessageType.VIDEO -> VIDEO
            AttachmentMessageType.AUDIO -> AUDIO
            else -> FILE
        }
    }
}

/** Cycle de préparation d'une pièce : copie, vignette, puis prête à partir. */
sealed interface PendingAttachmentPhase {
    data object Preparing : PendingAttachmentPhase
    data object Ready : PendingAttachmentPhase
    data class Failed(val reason: String? = null) : PendingAttachmentPhase
}

/**
 * Une pièce choisie mais pas encore envoyée : le plateau du composer ne tient que ces
 * objets, l'envoi n'a lieu qu'au bouton Envoyer. Les chemins sont ceux du dossier de
 * travail de l'app (copie privée du fichier choisi), jamais l'URI source.
 */
data class PendingAttachment(
    val id: String,
    val type: PendingAttachmentType,
    val fileName: String?,
    val localPath: String? = null,
    val thumbnailPath: String? = null,
    val mimeType: String? = null,
    val sizeBytes: Long = 0L,
    val durationMs: Long? = null,
    val width: Int? = null,
    val height: Int? = null,
    val thumbnailColorHex: String? = null,
    val mediaStoreId: String? = null,
    val phase: PendingAttachmentPhase = PendingAttachmentPhase.Preparing,
) {
    val isReady: Boolean get() = phase is PendingAttachmentPhase.Ready

    /** Les fichiers de travail que cette pièce possède et qu'il faudra supprimer. */
    val ownedPaths: List<String> get() = listOfNotNull(localPath, thumbnailPath)
}
