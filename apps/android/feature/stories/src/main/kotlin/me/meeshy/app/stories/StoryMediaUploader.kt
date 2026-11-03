package me.meeshy.app.stories

import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.TusUploadRepository
import me.meeshy.sdk.model.StoryVideoUploadFile
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.net.NetworkResult
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Story-composer-specific media uploader — binds the generic, context-agnostic
 * [TusUploadRepository] (`:sdk-core`) to [TusUploadContext.STORY]. "Story media
 * always uploads under the `story` TUS context" is a product decision (the SDK
 * building block stays opaque to any particular feature), so it lives here in
 * `:feature:stories` rather than in the SDK — same split
 * `packages/MeeshySDK/CLAUDE.md` documents for iOS ("le composant lit/appelle des
 * shared singletons + encode une règle 'quand faire X' → app").
 *
 * Replaces the story composer's prior use of [me.meeshy.sdk.media.MediaRepository]
 * (`POST /attachments/upload`), which only ever produces a `MessageAttachment` — a
 * different collection than the `PostMedia` rows `CreateStoryRequest.mediaIds`
 * actually claims server-side. A picked photo/video previously "uploaded"
 * successfully but the gateway's claim (`prisma.postMedia.updateMany`) silently
 * matched nothing, so the published story carried no media at all.
 */
@Singleton
public class StoryMediaUploader @Inject constructor(
    private val tusUploadRepository: TusUploadRepository,
) {
    public suspend fun upload(
        items: List<MediaUploadItem>,
        onProgress: (index: Int, sent: Long, total: Long) -> Unit = { _, _, _ -> },
    ): NetworkResult<List<UploadedMedia>> =
        tusUploadRepository.uploadAll(items, TusUploadContext.STORY, onProgress)

    /** One outcome per item, in order (#13959): a failed media never discards the ones the gateway already received. */
    public suspend fun uploadEach(
        items: List<MediaUploadItem>,
        onProgress: (index: Int, sent: Long, total: Long) -> Unit = { _, _, _ -> },
    ): List<NetworkResult<List<UploadedMedia>>> =
        tusUploadRepository.uploadEach(items, TusUploadContext.STORY, onProgress)

    /**
     * Une vidéo de story : compressée quand le compresseur sait, sinon la SOURCE part telle quelle avec un mime `video/` —
     * jamais d'échec de publication pour une compression manquée. La copie dérivée est supprimée après l'envoi.
     */
    internal suspend fun uploadVideo(
        source: File,
        compressor: StoryVideoCompressor = StoryVideoCompressor.None,
        onProgress: (index: Int, sent: Long, total: Long) -> Unit = { _, _, _ -> },
    ): NetworkResult<List<UploadedMedia>> {
        val prepared = StoryVideoUploadFile.prepared(source.path) { path -> compressor.compress(File(path))?.path }
        val file = File(prepared.path)
        try {
            return upload(listOf(MediaUploadItem.onDisk(file, file.name, prepared.mimeType)), onProgress)
        } finally {
            if (prepared.isDerived) file.delete()
        }
    }

    /** Pré-montée d'un fichier du disque (contexte STORY, comme la publication) ; `null` sur échec, jamais une exception. */
    internal suspend fun preUpload(
        path: String,
        mimeType: String,
        onProgress: (sent: Long, total: Long) -> Unit,
    ): PreUploadedAsset? {
        val file = File(path)
        val item = MediaUploadItem.onDisk(file, file.name, mimeType)
        val media = (tusUploadRepository.uploadEach(listOf(item), TusUploadContext.STORY) { _, sent, total -> onProgress(sent, total) }
            .firstOrNull() as? NetworkResult.Success)?.data?.firstOrNull() ?: return null
        return PreUploadedAsset(postMediaId = media.id, remoteUrl = media.url)
    }
}
