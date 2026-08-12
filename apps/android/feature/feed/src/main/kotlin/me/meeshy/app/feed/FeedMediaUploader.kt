package me.meeshy.app.feed

import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.TusUploadRepository
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Feed-composer-specific media uploader — binds the generic, context-agnostic
 * [TusUploadRepository] (`:sdk-core`) to [TusUploadContext.POST]. "Feed-post
 * media always uploads under the `post` TUS context" is a product decision
 * (the SDK building block stays opaque to any particular feature), so it
 * lives here in `:feature:feed` rather than in the SDK — same split
 * `packages/MeeshySDK/CLAUDE.md` documents for iOS ("le composant lit/appelle
 * des shared singletons + encode une règle 'quand faire X' → app"), and the
 * exact Feed counterpart of `me.meeshy.app.stories.StoryMediaUploader`.
 *
 * Deliberately uses [TusUploadContext.POST] from the start (never the legacy
 * `MediaRepository`/`POST /attachments/upload` path that only ever produces a
 * `MessageAttachment`) — that pipeline was proven, in the story composer, to
 * silently lose media because `CreatePostRequest.mediaIds` claims exclusively
 * against `PostMedia`, which only a TUS-context upload ever creates.
 */
@Singleton
class FeedMediaUploader @Inject constructor(
    private val tusUploadRepository: TusUploadRepository,
) {
    suspend fun upload(items: List<MediaUploadItem>): NetworkResult<List<UploadedMedia>> =
        tusUploadRepository.uploadAll(items, TusUploadContext.POST)
}
