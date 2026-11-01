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

/** « @ » in the reply to a mood (#14053): the cached contacts at once, the mood (its status id) as the post context. */
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

    private fun viewModel(search: MentionSearch): MoodSpotlightViewModel {
        val posts = mockk<PostRepository>(relaxed = true)
        every { posts.cachedPost(any()) } returns null
        coEvery { posts.getPost(any()) } returns NetworkResult.Failure(ApiError("offline"))
        val session = mockk<SessionRepository>(relaxed = true)
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(MeeshyUser(id = "me", username = "me"))
        return MoodSpotlightViewModel(
            posts,
            mockk<UserRepository>(relaxed = true),
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
    fun `a bare at sign opens the cached contacts without the network`() = runTest(dispatcher) {
        val search = RecordingSearch(emptyList())
        val vm = viewModel(search)
        advanceUntilIdle()

        vm.onReplyChange("@")
        advanceUntilIdle()

        assertThat(vm.mention.value.suggestions.map { it.username }).containsExactly("anna")
        assertThat(search.asked).isEmpty()
    }

    @Test
    fun `from the third character the mood is asked as a post context and a pick fills the reply`() = runTest(dispatcher) {
        val search = RecordingSearch(listOf(MentionCandidate(id = "u9", username = "annabel")))
        val vm = viewModel(search)
        advanceUntilIdle()

        vm.onReplyChange("merci @ann")
        advanceUntilIdle()

        assertThat(search.asked).containsExactly("ann" to MentionContext.post("mood-1"))
        val annabel = vm.mention.value.suggestions.first { it.username == "annabel" }
        vm.onMentionSelected(annabel)
        assertThat(vm.state.value.replyText).isEqualTo("merci @annabel ")
    }
}
