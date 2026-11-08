package me.meeshy.app.feed

import androidx.compose.runtime.Immutable
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.TusUploadRepository
import me.meeshy.sdk.model.CommentAttachmentIntake
import me.meeshy.sdk.model.CommentPieceKind
import me.meeshy.sdk.model.MAX_POST_MEDIA
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.look.ComposerPhotoRecipe
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.ui.component.retouch.ComposerLookAuthor

/**
 * La retouche d'une photo du bandeau (#14844) : l'[original] et sa [recipe], signée par [author] — la retouche rouverte
 * les restaure, modifiables ; ce qui se téléverse n'en est que la cuisson.
 */
@Immutable
data class CommentPieceRetouch(val original: MediaUploadItem, val recipe: ComposerPhotoRecipe, val author: ComposerLookAuthor)

/**
 * Une pièce du bandeau : ce qui se téléverse ([item]) et, une fois téléversée, son média ; une photo retouchée garde à
 * côté son original et sa recette ([retouch]).
 */
@Immutable
data class CommentPendingPiece(
    val id: String,
    val item: MediaUploadItem,
    val uploaded: UploadedMedia? = null,
    val retouch: CommentPieceRetouch? = null,
) {
    /** Ce que la retouche rouvre : l'original, jamais la cuisson. */
    val source: MediaUploadItem get() = retouch?.original ?: item

    /** Les fichiers que la pièce tient : sa cuisson et son original, chacun une fois. */
    val owned: List<MediaUploadItem> get() = listOfNotNull(item, retouch?.original.takeIf { it !== item })

    val isVideo: Boolean get() = item.mimeType.startsWith("video")
    val isAudio: Boolean get() = item.mimeType.startsWith("audio")
    /** Ni photo, ni vidéo, ni vocal : un fichier (#14386), montré par son nom, jamais décodé en vignette. */
    val isFile: Boolean get() = CommentPieceKind.of(item.mimeType) == CommentPieceKind.FILE
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

    fun replacing(id: String, item: MediaUploadItem, retouch: CommentPieceRetouch? = null): CommentAttachmentTray =
        copy(pieces = pieces.map { if (it.id == id) CommentPendingPiece(id, item, retouch = retouch) else it })

    /** Ce que la zone dit d'une pièce qui frappe à la porte : le plafond du serveur et ce qui n'est pas une pièce (iOS `CommentAttachmentIntake.admit`). */
    fun admission(item: MediaUploadItem, nextPieceId: String): CommentAttachmentIntake.Outcome =
        CommentAttachmentIntake.admit(
            incoming = listOf(CommentAttachmentIntake.Candidate(nextPieceId, item.mimeType, item.fileName, isReady = false)),
            staged = pieces.map { CommentAttachmentIntake.Candidate(it.id, it.item.mimeType, it.item.fileName, isReady = it.uploaded != null) },
            limit = MAX_PIECES,
        )

    fun piece(id: String): CommentPendingPiece? = pieces.firstOrNull { it.id == id }

    companion object {
        /** Le plafond des médias d'un commentaire est celui d'un post (`MAX_POST_MEDIA`, #6578). */
        const val MAX_PIECES: Int = MAX_POST_MEDIA
    }
}

/** Les pièces d'un commentaire se téléversent sous le contexte `comment` : la passerelle les réclame comme telles. */
@Singleton
class CommentMediaUploader @Inject constructor(private val tus: TusUploadRepository) {
    suspend fun upload(item: MediaUploadItem): NetworkResult<List<UploadedMedia>> = tus.uploadAll(listOf(item), TusUploadContext.COMMENT)
}

/** La première pièce téléversée, ou `null` : sans téléverseur, sur échec ou sur exception (l'annulation, elle, se propage). */
internal suspend fun CommentMediaUploader?.firstUploaded(item: MediaUploadItem): UploadedMedia? {
    val result = try {
        this?.upload(item)
    } catch (e: kotlinx.coroutines.CancellationException) {
        throw e
    } catch (e: Exception) {
        null
    }
    return (result as? NetworkResult.Success)?.data?.firstOrNull()
}
