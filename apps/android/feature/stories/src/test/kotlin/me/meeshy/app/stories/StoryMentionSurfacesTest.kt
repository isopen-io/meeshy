package me.meeshy.app.stories

import androidx.work.WorkManager
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
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.mention.MentionContacts
import me.meeshy.sdk.mention.MentionSearch
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.sdk.model.SocketCommentAddedData
import me.meeshy.sdk.model.mention.MentionContext
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/** « @ » in the story comment field and in the story reply sheet (#14053): the story is the post context. */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryMentionSurfacesTest {

    private val dispatcher = StandardTestDispatcher()
    private val session: SessionRepository = mockk(relaxed = true)

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(MeeshyUser(id = "me", username = "me"))
    }

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

    private fun commentsViewModel(search: MentionSearch): StoryCommentsViewModel {
        val repo = mockk<StoryRepository>(relaxed = true)
        coEvery { repo.comments(any()) } returns NetworkResult.Success(emptyList())
        val socket = mockk<SocialSocketManager>(relaxed = true)
        every { socket.commentAdded } returns MutableSharedFlow<SocketCommentAddedData>()
        return StoryCommentsViewModel(repo, session, socket, mentionSearch = search, mentionContacts = contacts)
    }

    private fun replyViewModel(search: MentionSearch) = StoryReplyViewModel(
        mockk<ConversationRepository>(relaxed = true),
        mockk<MessageRepository>(relaxed = true),
        session,
        mockk<WorkManager>(relaxed = true),
        null,
        EndToEndRegimeLedger.None,
        mentionSearch = search,
        mentionContacts = contacts,
    )

    @Test
    fun `the story comment field opens the cached contacts on a bare at sign`() = runTest(dispatcher) {
        val search = RecordingSearch(emptyList())
        val vm = commentsViewModel(search)
        vm.load("s1")
        advanceUntilIdle()

        vm.onDraftChange("@")
        advanceUntilIdle()

        assertThat(vm.mention.value.suggestions.map { it.username }).containsExactly("anna")
        assertThat(search.asked).isEmpty()
    }

    @Test
    fun `the story comment field asks the story as a post context from the third character`() = runTest(dispatcher) {
        val search = RecordingSearch(listOf(MentionCandidate(id = "u9", username = "zoe")))
        val vm = commentsViewModel(search)
        vm.load("s1")
        advanceUntilIdle()

        vm.onDraftChange("coucou @zoe")
        advanceUntilIdle()

        assertThat(search.asked).containsExactly("zoe" to MentionContext.post("s1"))
        assertThat(vm.selectMention(vm.mention.value.suggestions.single(), "coucou @zoe")).isEqualTo("coucou @zoe ")
        assertThat(vm.mention.value.isActive).isFalse()
    }

    @Test
    fun `the story reply offers the author alone and never asks the story's context (#14071)`() = runTest(dispatcher) {
        val search = RecordingSearch(listOf(MentionCandidate(id = "u9", username = "zoe")))
        val vm = replyViewModel(search)
        vm.attachAuthor(authorId = "a1", authorUsername = "zola")
        advanceUntilIdle()

        vm.onTextChange("@")
        advanceUntilIdle()
        assertThat(vm.mention.value.suggestions.map { it.username }).containsExactly("zola")

        vm.onTextChange("@zol")
        advanceUntilIdle()

        assertThat(search.asked).isEmpty()
        vm.onMentionSelected(vm.mention.value.suggestions.single())
        assertThat(vm.state.value.text).isEqualTo("@zola ")
    }
}
