package me.meeshy.sdk.post

import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.PostViewersResponse
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CreateCommentRequest
import me.meeshy.sdk.net.api.CreatePostRequest
import me.meeshy.sdk.net.api.CreateStoryRequest
import me.meeshy.sdk.net.api.MobileTranscriptionPayload
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.api.PostImpressionsRequest
import me.meeshy.sdk.net.api.PostTranslationRequest
import me.meeshy.sdk.net.api.PostViewRequest
import me.meeshy.sdk.net.api.RepostPostRequest
import me.meeshy.sdk.net.api.UpdatePostRequest
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/** Posts, comments, reposts and feed variants — port of PostService (PostService.swift). */
@Singleton
class PostRepository @Inject constructor(
    private val postApi: PostApi,
) {
    suspend fun getFeed(cursor: String? = null, limit: Int = 20): NetworkResult<List<ApiPost>> =
        apiCall { postApi.getFeed(cursor, limit) }

    suspend fun create(
        content: String? = null,
        type: String = "POST",
        visibility: String = "PUBLIC",
        moodEmoji: String? = null,
        mediaIds: List<String>? = null,
        audioUrl: String? = null,
        audioDuration: Int? = null,
        originalLanguage: String? = null,
        mobileTranscription: MobileTranscriptionPayload? = null,
        repostOfId: String? = null,
    ): NetworkResult<ApiPost> =
        apiCall {
            postApi.create(
                CreatePostRequest(
                    content = content,
                    type = type,
                    visibility = visibility,
                    moodEmoji = moodEmoji,
                    mediaIds = mediaIds,
                    audioUrl = audioUrl,
                    audioDuration = audioDuration,
                    originalLanguage = originalLanguage,
                    mobileTranscription = mobileTranscription,
                    repostOfId = repostOfId,
                ),
            )
        }

    suspend fun update(
        postId: String,
        content: String? = null,
        visibility: String? = null,
        moodEmoji: String? = null,
    ): NetworkResult<ApiPost> =
        apiCall { postApi.update(postId, UpdatePostRequest(content, visibility, moodEmoji)) }

    suspend fun delete(postId: String): NetworkResult<Unit> =
        apiCall { postApi.delete(postId) }

    suspend fun getPost(postId: String): NetworkResult<ApiPost> =
        apiCall { postApi.getPost(postId) }

    suspend fun like(postId: String): NetworkResult<Unit> =
        apiCall { postApi.like(postId) }

    suspend fun unlike(postId: String): NetworkResult<Unit> =
        apiCall { postApi.unlike(postId) }

    suspend fun bookmark(postId: String): NetworkResult<Unit> =
        apiCall { postApi.bookmark(postId) }

    suspend fun removeBookmark(postId: String): NetworkResult<Unit> =
        apiCall { postApi.removeBookmark(postId) }

    suspend fun getBookmarks(cursor: String? = null, limit: Int = 20): NetworkResult<List<ApiPost>> =
        apiCall { postApi.getBookmarks(cursor, limit) }

    suspend fun pinPost(postId: String): NetworkResult<Unit> =
        apiCall { postApi.pin(postId) }

    suspend fun unpinPost(postId: String): NetworkResult<Unit> =
        apiCall { postApi.unpin(postId) }

    suspend fun share(postId: String): NetworkResult<Unit> =
        apiCall { postApi.share(postId) }

    suspend fun repost(
        postId: String,
        targetType: PostType? = null,
        content: String? = null,
        isQuote: Boolean = false,
    ): NetworkResult<ApiPost> =
        apiCall {
            postApi.repost(
                postId,
                RepostPostRequest(content = content, isQuote = isQuote, targetType = targetType?.name),
            )
        }

    suspend fun createStory(
        content: String? = null,
        storyEffects: StoryEffects? = null,
        visibility: String = "PUBLIC",
        originalLanguage: String? = null,
        mediaIds: List<String>? = null,
        repostOfId: String? = null,
    ): NetworkResult<ApiPost> =
        apiCall {
            postApi.createStory(
                CreateStoryRequest(
                    content = content,
                    storyEffects = storyEffects,
                    visibility = visibility,
                    originalLanguage = originalLanguage,
                    mediaIds = mediaIds,
                    repostOfId = repostOfId,
                ),
            )
        }

    suspend fun requestTranslation(postId: String, targetLanguage: String): NetworkResult<Unit> =
        apiCall { postApi.requestTranslation(postId, PostTranslationRequest(targetLanguage)) }

    suspend fun viewPost(postId: String, duration: Int? = null): NetworkResult<Unit> =
        apiCall { postApi.viewPost(postId, PostViewRequest(duration)) }

    suspend fun getPostViews(
        postId: String,
        limit: Int = 50,
        offset: Int = 0,
    ): NetworkResult<PostViewersResponse> =
        apiCall { postApi.getPostViews(postId, limit, offset) }

    suspend fun getUserPosts(
        userId: String,
        cursor: String? = null,
        limit: Int = 20,
    ): NetworkResult<List<ApiPost>> =
        apiCall { postApi.getUserPosts(userId, cursor, limit) }

    suspend fun getCommunityPosts(
        communityId: String,
        cursor: String? = null,
        limit: Int = 20,
    ): NetworkResult<List<ApiPost>> =
        apiCall { postApi.getCommunityPosts(communityId, cursor, limit) }

    suspend fun recordImpressions(
        postIds: List<String>,
        source: String = "feed",
    ): NetworkResult<Unit> =
        apiCall { postApi.recordImpressions(PostImpressionsRequest(postIds, source)) }

    suspend fun getComments(
        postId: String,
        cursor: String? = null,
        limit: Int = 20,
    ): NetworkResult<List<ApiPostComment>> =
        apiCall { postApi.getComments(postId, cursor, limit) }

    suspend fun addComment(
        postId: String,
        content: String,
        parentId: String? = null,
        effectFlags: Int? = null,
    ): NetworkResult<ApiPostComment> =
        apiCall { postApi.addComment(postId, CreateCommentRequest(content, parentId, effectFlags)) }

    suspend fun getCommentReplies(
        postId: String,
        commentId: String,
        cursor: String? = null,
        limit: Int = 20,
    ): NetworkResult<List<ApiPostComment>> =
        apiCall { postApi.getCommentReplies(postId, commentId, cursor, limit) }

    suspend fun likeComment(postId: String, commentId: String): NetworkResult<Unit> =
        apiCall { postApi.likeComment(postId, commentId) }

    suspend fun unlikeComment(postId: String, commentId: String): NetworkResult<Unit> =
        apiCall { postApi.unlikeComment(postId, commentId) }

    suspend fun deleteComment(postId: String, commentId: String): NetworkResult<Unit> =
        apiCall { postApi.deleteComment(postId, commentId) }
}
