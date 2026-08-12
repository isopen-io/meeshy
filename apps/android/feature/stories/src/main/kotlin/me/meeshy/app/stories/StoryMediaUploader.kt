package me.meeshy.app.stories

import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.TusUploadRepository
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.net.NetworkResult
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
    public suspend fun upload(items: List<MediaUploadItem>): NetworkResult<List<UploadedMedia>> =
        tusUploadRepository.uploadAll(items, TusUploadContext.STORY)
}
