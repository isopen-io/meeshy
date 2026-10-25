package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.TusUploadRepository
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.net.NetworkResult

/** Une pièce du bandeau : ses octets locaux (la retouche les rouvre) et, une fois téléversée, son média. */
@Immutable
data class CommentPendingPiece(val id: String, val item: MediaUploadItem, val uploaded: UploadedMedia? = null) {
    val isVideo: Boolean get() = item.mimeType.startsWith("video")
}

/**
 * **LE BANDEAU DES PIÈCES D'UN COMMENTAIRE** (#12972) — miroir de `CommentAttachmentsTray` (iOS) : une pièce
 * choisie se téléverse aussitôt et s'affiche ; « Éditer » la rouvre dans la retouche unique et « Terminé » la
 * remplace À SA PLACE (#12735) ; l'envoi attend que tout soit téléversé et part avec les ids. Une réponse arrivée
 * pour une pièce retirée entre-temps ne la ramène pas.
 */
@Immutable
data class CommentAttachmentTray(val pieces: List<CommentPendingPiece> = emptyList()) {
    val hasMedia: Boolean get() = pieces.isNotEmpty()
    val isUploading: Boolean get() = pieces.any { it.uploaded == null }
    val isFull: Boolean get() = pieces.size >= MAX_PIECES
    val attachmentIds: List<String> get() = pieces.mapNotNull { it.uploaded?.id }

    fun adding(id: String, item: MediaUploadItem): CommentAttachmentTray =
        if (isFull) this else copy(pieces = pieces + CommentPendingPiece(id, item))

    fun uploaded(id: String, media: UploadedMedia): CommentAttachmentTray =
        copy(pieces = pieces.map { if (it.id == id) it.copy(uploaded = media) else it })

    fun failed(id: String): CommentAttachmentTray = removing(id)

    fun removing(id: String): CommentAttachmentTray = copy(pieces = pieces.filterNot { it.id == id })

    fun replacing(id: String, item: MediaUploadItem): CommentAttachmentTray =
        copy(pieces = pieces.map { if (it.id == id) CommentPendingPiece(id, item) else it })

    fun piece(id: String): CommentPendingPiece? = pieces.firstOrNull { it.id == id }

    companion object {
        /** Le plafond des médias d'un commentaire est celui d'un post (`MAX_POST_MEDIA`, #6578). */
        const val MAX_PIECES: Int = FeedComposerDraft.MAX_MEDIA
    }
}

/** Les pièces d'un commentaire se téléversent sous le contexte `comment` : la passerelle les réclame comme telles. */
@Singleton
class CommentMediaUploader @Inject constructor(private val tus: TusUploadRepository) {
    suspend fun upload(item: MediaUploadItem): NetworkResult<List<UploadedMedia>> = tus.uploadAll(listOf(item), TusUploadContext.COMMENT)
}
