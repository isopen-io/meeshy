package me.meeshy.sdk.model.story

/**
 * Une pièce du plateau d'un commentaire de story (iOS `ComposerAttachment`) sous sa forme DURABLE : [localPath] est le
 * fichier que l'appareil garde (jamais des octets en mémoire), [uploadedId] l'id serveur une fois téléversée. C'est ce
 * qui survit au brouillon par story et qui revient au composeur quand la file refuse le commentaire.
 */
data class StoryCommentPiece(
    val id: String,
    val localPath: String,
    val fileName: String,
    val mimeType: String,
    val durationMs: Long? = null,
    val uploadedId: String? = null,
)

/**
 * **Le plateau des pièces d'un commentaire de story** (iOS `commentAttachments`, `Self.mediaLimit = 1`) : une pièce
 * choisie se téléverse aussitôt, l'envoi attend que tout le soit et part avec les ids. Une réponse arrivée pour une pièce
 * retirée entre-temps ne la ramène pas. Immuable : chaque transition rend un nouveau plateau, ou le MÊME quand rien ne change.
 */
data class StoryCommentAttachmentTray(val pieces: List<StoryCommentPiece> = emptyList()) {
    val hasMedia: Boolean get() = pieces.isNotEmpty()
    val isFull: Boolean get() = pieces.size >= MAX_PIECES
    val isUploading: Boolean get() = pieces.any { it.uploadedId == null }
    val attachmentIds: List<String> get() = pieces.mapNotNull { it.uploadedId }

    fun adding(piece: StoryCommentPiece): StoryCommentAttachmentTray =
        if (isFull || pieces.any { it.id == piece.id }) this else copy(pieces = pieces + piece)

    fun uploaded(id: String, serverId: String): StoryCommentAttachmentTray {
        if (pieces.none { it.id == id }) return this
        return copy(pieces = pieces.map { if (it.id == id) it.copy(uploadedId = serverId) else it })
    }

    fun failed(id: String): StoryCommentAttachmentTray = removing(id)

    fun removing(id: String): StoryCommentAttachmentTray =
        if (pieces.none { it.id == id }) this else copy(pieces = pieces.filterNot { it.id == id })

    fun piece(id: String): StoryCommentPiece? = pieces.firstOrNull { it.id == id }

    /** Les pièces d'un brouillon ou d'un commentaire refusé reprennent leur place, dans la limite des places libres. */
    fun restoring(restored: List<StoryCommentPiece>): StoryCommentAttachmentTray =
        restored.fold(this) { tray, piece -> tray.adding(piece) }

    companion object {
        /** iOS `StoryViewerView.mediaLimit`. */
        const val MAX_PIECES: Int = 1
    }
}
