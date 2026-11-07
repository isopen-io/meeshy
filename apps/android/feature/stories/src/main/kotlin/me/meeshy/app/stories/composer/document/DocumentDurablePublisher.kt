package me.meeshy.app.stories.composer.document

import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.composer.DocumentDurableSink
import me.meeshy.sdk.model.composer.PublishIntent
import me.meeshy.sdk.model.scene.CanvasMediaAdoption
import me.meeshy.sdk.net.api.CreatePostRequest
import me.meeshy.sdk.publication.PublicationOutbox
import me.meeshy.sdk.model.media.TusUploadContext

/**
 * Le publieur durable du document (iOS `ComposerDocumentDurablePublisher`) : sans aucun fil, il met en file chaque fichier local
 * (le son posé et le sticker importé compris, portés par `localMedia`), puis la publication qui attend leurs téléversements.
 * Rien ne dépend de la pré-montée : le post part même si elle n'a pas abouti.
 */
@Singleton
internal class DocumentDurablePublisher @Inject constructor(
    private val uploads: MediaUploadQueue,
    private val publications: PublicationOutbox,
) : DocumentDurableSink {

    override suspend fun enqueue(intent: PublishIntent): String {
        val queued = mutableListOf<String>()
        try {
            intent.localMedia.forEach { media ->
                val file = File(media.path)
                queued += uploads.enqueue(MediaUploadItem.onDisk(file, file.name, media.mimeType, media.durationMs), TusUploadContext.POST)
            }
            return publications.enqueuePost(DocumentPostRequest.build(intent, queued))
        } catch (failure: Throwable) {
            queued.forEach { runCatching { uploads.cancel(it) } }
            throw failure
        }
    }
}

/** La charge `POST /posts` d'un document : les objets de la scène désignent les `cmid` de leurs téléversements. */
internal object DocumentPostRequest {

    fun build(intent: PublishIntent, uploadIds: List<String>): CreatePostRequest {
        val adopted = CanvasMediaAdoption.adopting(
            effects = intent.storyEffects,
            canvas = intent.storyEffects?.canvas,
            objectIdsBySourceIndex = intent.mediaObjectIds,
            idsBySourceIndex = uploadIds.withIndex().associate { it.index to it.value },
            urlsBySourceIndex = emptyMap(),
        )
        val effects = adopted.effects?.copy(canvas = adopted.canvas)
        return CreatePostRequest(
            content = intent.content,
            type = intent.type,
            visibility = intent.visibility,
            mediaIds = CanvasMediaAdoption.publicationMediaIds(uploadIds, effects, effects?.canvas).takeIf { it.isNotEmpty() },
            originalLanguage = intent.originalLanguage,
            mobileTranscription = intent.mobileTranscription,
            location = intent.location,
            mediaAlt = keyed(intent.mediaAlts, uploadIds),
            visibilityUserIds = intent.visibilityUserIds,
            storyEffects = effects,
            allowSoundExtraction = intent.allowSoundExtraction,
            commentsDisabled = intent.commentsDisabled,
            mentions = intent.mentions?.takeIf { it.isNotEmpty() },
            mediaCaption = keyed(intent.mediaCaptions, uploadIds),
            discoverabilityPrecision = intent.discoverabilityPrecision,
        )
    }

    private fun keyed(texts: List<String?>, uploadIds: List<String>): Map<String, String>? =
        uploadIds.zip(texts) { id, text -> text?.takeIf { it.isNotBlank() }?.let { id to it } }
            .filterNotNull().toMap().takeIf { it.isNotEmpty() }
}
