package me.meeshy.app.feed

import androidx.lifecycle.SavedStateHandle
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import me.meeshy.sdk.mention.MentionSearch
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.sdk.model.card.PostCommentCardPost
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager

/**
 * Le fil de la recette S8 de #13922 : le post vidéo PUBLIC de Windie Nh, deux commentaires racines publics à emoji (grâce
 * salem, elvira ndjiki), une réponse chargée sous le second — servis comme la passerelle de staging les sert.
 */
internal object RecetteCommentThread {
    const val POST_ID = "post-windie"
    const val GRACE_TEXT = "😭😭😭😭j'ai éclaté seigneur"

    private val grace = ApiAuthor(id = "u-grace", username = "grace_salem", displayName = "grâce salem")
    private val elvira = ApiAuthor(id = "u-elvira", username = "elvira_ndjiki", displayName = "elvira ndjiki")

    val rootGrace = ApiPostComment(
        id = "c-grace",
        content = GRACE_TEXT,
        originalLanguage = "fr",
        replyCount = 0,
        effectFlags = 0,
        createdAt = "2026-10-30T18:16:18.759Z",
        author = grace,
        media = emptyList(),
    )

    val rootElvira = ApiPostComment(
        id = "c-elvira",
        content = "C'est la situation qui la met dans cet état ❤️😂",
        originalLanguage = "fr",
        replyCount = 1,
        effectFlags = 0,
        createdAt = "2026-10-30T18:20:00.000Z",
        author = elvira,
        media = emptyList(),
    )

    val reply = ApiPostComment(
        id = "r-1",
        content = "Exactement 😂",
        originalLanguage = "fr",
        parentId = "c-elvira",
        effectFlags = 0,
        createdAt = "2026-10-30T18:25:00.000Z",
        author = grace,
    )

    private val videoPost = ApiPost(
        id = POST_ID,
        type = "POST",
        visibility = "PUBLIC",
        content = "Quand la vidéo TikTok tombe 😂",
        createdAt = "2026-10-30T18:00:00.000Z",
        author = ApiAuthor(id = "u-windie", username = "windie", displayName = "Windie Nh"),
        media = listOf(ApiPostMedia(id = "m-video", mimeType = "video/mp4", order = 0)),
    )

    val support: PostCommentCardPost = CommentCardReading.support(videoPost, videoPost.content.orEmpty())

    private val noMentions = object : MentionSearch {
        override suspend fun search(query: String): List<MentionCandidate> = emptyList()
    }

    /** Le fil chargé, la réponse d'elvira dépliée. */
    fun loadedViewModel(): PostCommentsViewModel {
        val repository: PostRepository = mockk(relaxed = true)
        val session: SessionRepository = mockk(relaxed = true)
        val socket: SocialSocketManager = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "viewer", username = "recette_s8", displayName = "Recette S8"))
        every { socket.commentAdded } returns MutableSharedFlow()
        every { socket.commentUpdated } returns MutableSharedFlow()
        every { socket.commentDeleted } returns MutableSharedFlow()
        every { socket.commentReactionAdded } returns MutableSharedFlow()
        every { socket.commentReactionRemoved } returns MutableSharedFlow()
        every { socket.commentTranslationUpdated } returns MutableSharedFlow()
        coEvery { repository.getComments(POST_ID, null, any()) } returns NetworkResult.Success(listOf(rootGrace, rootElvira))
        coEvery { repository.getCommentReplies(POST_ID, "c-elvira", null, any()) } returns NetworkResult.Success(listOf(reply))
        val vm = PostCommentsViewModel(repository, session, socket, MeeshyConfig(), noMentions, SavedStateHandle(mapOf("postId" to POST_ID)))
        vm.toggleReplies("c-elvira")
        return vm
    }
}
