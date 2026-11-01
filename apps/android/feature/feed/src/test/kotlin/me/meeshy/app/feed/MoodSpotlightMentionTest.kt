package me.meeshy.app.feed

import androidx.lifecycle.SavedStateHandle
import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.mention.MentionContacts
import me.meeshy.sdk.mention.MentionSearch
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.sdk.model.mention.MentionContext
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.OutOfThreadAdmission
import me.meeshy.sdk.outbox.OutOfThreadSendGate
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * « @ » in the reply to a mood (#14053, #14071): the reply lands in the author's DM, where only the
 * interlocutor can be mentioned — the list offers the author alone and never asks the network.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class MoodSpotlightMentionTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private class RecordingSearch(private val answer: List<MentionCandidate>) : MentionSearch {
        val asked = mutableListOf<Pair<String, MentionContext?>>()
        override suspend fun search(query: String): List<MentionCandidate> = answer
        override suspend fun suggest(query: String, context: MentionContext?): List<MentionCandidate> {
            asked += query to context
            return answer
        }
    }

    private val contacts = object : MentionContacts {
        override fun snapshot(): List<MentionCandidate> = listOf(MentionCandidate(id = "u1", username = "anna", displayName = "Anna"))
        override suspend fun refresh() = Unit
    }

    private val mood = ApiPost(
        id = "mood-1", type = "STATUS", moodEmoji = "🌞", content = "Belle journée",
        author = ApiAuthor(id = "lea", username = "lea"),
    )

    private fun viewModel(search: MentionSearch): MoodSpotlightViewModel {
        val posts = mockk<PostRepository>(relaxed = true)
        every { posts.cachedPost(any()) } returns null
        coEvery { posts.getPost(any()) } returns NetworkResult.Success(mood)
        val users = mockk<UserRepository>(relaxed = true)
        coEvery { users.getProfile(any()) } returns NetworkResult.Failure(ApiError("offline"))
        val session = mockk<SessionRepository>(relaxed = true)
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(MeeshyUser(id = "me", username = "me"))
        every { session.currentUserId } returns "me"
        return MoodSpotlightViewModel(
            posts,
            users,
            mockk<ConversationRepository>(relaxed = true),
            mockk<MessageRepository>(relaxed = true),
            session,
            mockk<WorkManager>(relaxed = true),
            OutOfThreadSendGate { OutOfThreadAdmission.SEND },
            { 0L },
            SavedStateHandle(mapOf(MoodSpotlightViewModel.STATUS_ID_ARG to "mood-1")),
            mentionSearch = search,
            mentionContacts = contacts,
        )
    }

    @Test
    fun `a bare at sign offers the mood's author alone, never a contact`() = runTest(dispatcher) {
        val search = RecordingSearch(emptyList())
        val vm = viewModel(search)
        advanceUntilIdle()

        vm.onReplyChange("@")
        advanceUntilIdle()

        assertThat(vm.mention.value.suggestions.map { it.username }).containsExactly("lea")
        assertThat(search.asked).isEmpty()
    }

    @Test
    fun `from the third character the network is never asked, and a pick fills the reply`() = runTest(dispatcher) {
        val search = RecordingSearch(listOf(MentionCandidate(id = "u9", username = "leander")))
        val vm = viewModel(search)
        advanceUntilIdle()

        vm.onReplyChange("merci @lea")
        advanceUntilIdle()

        assertThat(search.asked).isEmpty()
        vm.onMentionSelected(vm.mention.value.suggestions.single())
        assertThat(vm.state.value.replyText).isEqualTo("merci @lea ")
    }
}
