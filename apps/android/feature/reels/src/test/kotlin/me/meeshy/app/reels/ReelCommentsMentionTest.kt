package me.meeshy.app.reels

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.lang.LanguageIdentifying
import me.meeshy.sdk.mention.MentionContacts
import me.meeshy.sdk.mention.MentionSearch
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.sdk.model.SocketCommentAddedData
import me.meeshy.sdk.model.mention.MentionContext
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

/** « @ » in the reel comment field (#14053): the cached contacts at once, the reel's suggestions by the law. */
@OptIn(ExperimentalCoroutinesApi::class)
class ReelCommentsMentionTest {

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

    private fun viewModel(search: MentionSearch): ReelCommentsViewModel {
        val repo = mockk<PostRepository>(relaxed = true)
        coEvery { repo.getComments(any(), any(), any()) } returns NetworkResult.Success(emptyList())
        val session = mockk<SessionRepository>(relaxed = true)
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(MeeshyUser(id = "me", username = "me"))
        val socket = mockk<SocialSocketManager>(relaxed = true)
        every { socket.commentAdded } returns MutableSharedFlow<SocketCommentAddedData>()
        return ReelCommentsViewModel(
            repo, session, socket, LanguageIdentifying.Unavailable, null,
            mentionSearch = search,
            mentionContacts = contacts,
        )
    }

    @Test
    fun `an at sign opens the cached contacts without asking the network`() = runTest(dispatcher) {
        val search = RecordingSearch(emptyList())
        val vm = viewModel(search)
        vm.load("r1")
        advanceUntilIdle()

        vm.setDraft("bravo @")
        advanceUntilIdle()

        assertThat(vm.mention.value.suggestions.map { it.username }).containsExactly("anna")
        assertThat(search.asked).isEmpty()
    }

    @Test
    fun `from the third character the reel is asked as a post context`() = runTest(dispatcher) {
        val search = RecordingSearch(listOf(MentionCandidate(id = "u9", username = "annabel")))
        val vm = viewModel(search)
        vm.load("r1")
        advanceUntilIdle()

        vm.setDraft("bravo @ann")
        advanceUntilIdle()

        assertThat(search.asked).containsExactly("ann" to MentionContext.post("r1"))
        assertThat(vm.mention.value.suggestions.map { it.username }).containsExactly("anna", "annabel").inOrder()
    }

    @Test
    fun `picking a person writes the handle into the field and closes the list`() = runTest(dispatcher) {
        val vm = viewModel(RecordingSearch(emptyList()))
        vm.load("r1")
        advanceUntilIdle()
        vm.setDraft("bravo @an")

        vm.onMentionSelected(vm.mention.value.suggestions.single())

        assertThat(vm.state.value.draft).isEqualTo("bravo @anna ")
        assertThat(vm.mention.value.isActive).isFalse()
    }
}
