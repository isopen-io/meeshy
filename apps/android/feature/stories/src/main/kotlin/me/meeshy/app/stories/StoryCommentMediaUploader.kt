package me.meeshy.app.stories

import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.TusUploadRepository
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject
import javax.inject.Singleton

/** L'issue du téléversement d'une pièce de commentaire : son id serveur, ou l'échec (la pièce quitte le plateau). */
sealed interface StoryCommentUpload {
    data class Done(val serverId: String) : StoryCommentUpload

    data object Failed : StoryCommentUpload
}

/**
 * **Le téléversement des pièces d'un commentaire de story** : sous le contexte `comment` (la passerelle les réclame comme
 * telles), par le pipeline média TUS. Le commentaire attend ces ids : tant qu'une pièce n'en a pas, le plateau est « en
 * téléversement » et l'envoi reste éteint ; un échec rend la pièce, jamais une exception (hors annulation).
 */
@Singleton
class StoryCommentMediaUploader @Inject constructor(private val tus: TusUploadRepository) {

    suspend fun upload(item: MediaUploadItem): StoryCommentUpload =
        try {
            val media = (tus.uploadAll(listOf(item), TusUploadContext.COMMENT) as? NetworkResult.Success)?.data?.firstOrNull()
            if (media == null) StoryCommentUpload.Failed else StoryCommentUpload.Done(media.id)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            StoryCommentUpload.Failed
        }
}
