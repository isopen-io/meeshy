package me.meeshy.sdk.story

import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.StoryViewer
import me.meeshy.sdk.model.toStoryViewer
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CreateCommentRequest
import me.meeshy.sdk.net.api.RepostPostRequest
import me.meeshy.sdk.net.api.StoryApi
import me.meeshy.sdk.net.api.StoryLikeRequest
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/** Story feed, reactions and reposts — port of StoryService (StoryService.swift). */
@Singleton
class StoryRepository @Inject constructor(
    private val storyApi: StoryApi,
) {
    suspend fun list(cursor: String? = null, limit: Int = 50): NetworkResult<List<ApiPost>> =
        apiCall { storyApi.list(cursor, limit) }

    suspend fun markViewed(storyId: String): NetworkResult<Unit> =
        apiCall { storyApi.markViewed(storyId) }

    suspend fun delete(storyId: String): NetworkResult<Unit> =
        apiCall { storyApi.delete(storyId) }

    suspend fun react(storyId: String, emoji: String): NetworkResult<Unit> =
        apiCall { storyApi.react(storyId, StoryLikeRequest(emoji)) }

    suspend fun comment(storyId: String, content: String): NetworkResult<ApiPostComment> =
        apiCall { storyApi.comment(storyId, CreateCommentRequest(content)) }

    suspend fun repost(storyId: String): NetworkResult<Unit> =
        apiCall { storyApi.repost(storyId, RepostPostRequest()) }

    suspend fun fetchPost(id: String): NetworkResult<ApiPost> =
        apiCall { storyApi.fetchPost(id) }

    /**
     * Fetches the viewers of a story (with their optional reaction), mapping the
     * wire payload to domain [StoryViewer]s. Port of iOS
     * `StoryInteractionService.loadViewers`.
     */
    suspend fun viewers(storyId: String): NetworkResult<List<StoryViewer>> =
        apiCall { storyApi.viewers(storyId) }.map { it.viewers.map { wire -> wire.toStoryViewer() } }
}
