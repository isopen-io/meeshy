package me.meeshy.app.feed

import androidx.lifecycle.SavedStateHandle
import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.DirectConversationResolution
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
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
 * #13820 — la réponse à une humeur part dans la directe avec son auteur, une conversation que cet écran ne connaît que
 * par le cache : son mode est relu AVANT que la bulle ne naisse. Chiffrée de bout en bout, rien ne naît et le texte revient
 * dans le champ ; illisible maintenant, la réponse entre en file et la file relira le mode avant tout clair.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class MoodSpotlightReplyGateTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val me = MeeshyUser(id = "me", username = "me", systemLanguage = "fr")
    private val mood = ApiPost(id = "mood-1", type = "STATUS", moodEmoji = "🌞", content = "Belle journée", author = ApiAuthor(id = "lea", username = "lea"))

    private class Rig(val vm: MoodSpotlightViewModel, val messages: MessageRepository, val gated: List<String>)

    private fun rig(admission: OutOfThreadAdmission): Rig {
        val posts = mockk<PostRepository>(relaxed = true)
        every { posts.cachedPost("mood-1") } returns mood
        coEvery { posts.getPost("mood-1") } returns NetworkResult.Success(mood)
        val users = mockk<UserRepository>(relaxed = true)
        coEvery { users.getProfile(any()) } returns NetworkResult.Failure(ApiError("offline"))
        val conversations = mockk<ConversationRepository>(relaxed = true)
        coEvery { conversations.directConversationWith("lea", any()) } returns
            DirectConversationResolution.Found(ApiConversation(id = "d-lea", type = "direct", encryptionMode = "server"), fromCache = true)
        val messages = mockk<MessageRepository>(relaxed = true)
        val session = mockk<SessionRepository>(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(me)
        every { session.currentUserId } returns "me"
        val gated = mutableListOf<String>()
        val vm = MoodSpotlightViewModel(
            posts, users, conversations, messages, session, mockk<WorkManager>(relaxed = true),
            OutOfThreadSendGate { id -> gated += id; admission },
            { 0L },
            SavedStateHandle(mapOf(MoodSpotlightViewModel.STATUS_ID_ARG to "mood-1")),
        )
        return Rig(vm, messages, gated)
    }

    private fun Rig.reply(text: String) {
        vm.onReplyChange(text)
        vm.sendReply()
    }

    @Test
    fun `a reply to a direct the cache calls server but the server serves end to end never leaves and the text comes back`() = runTest {
        val r = rig(OutOfThreadAdmission.END_TO_END)

        r.reply("Bravo !")

        assertThat(r.gated).containsExactly("d-lea")
        coVerify(exactly = 0) { r.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        assertThat(r.vm.state.value.replyState).isEqualTo(MoodReplyState.FAILED)
        assertThat(r.vm.state.value.replyText).isEqualTo("Bravo !")
    }

    @Test
    fun `a reply to a direct the gateway no longer serves never leaves`() = runTest {
        val r = rig(OutOfThreadAdmission.UNREACHABLE)

        r.reply("Bravo !")

        coVerify(exactly = 0) { r.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        assertThat(r.vm.state.value.replyState).isEqualTo(MoodReplyState.FAILED)
    }

    @Test
    fun `a reply whose mode is read clear, or cannot be read now, enters the queue citing the mood`() = runTest {
        listOf(OutOfThreadAdmission.SEND, OutOfThreadAdmission.QUEUE_UNTIL_MODE_KNOWN).forEach { admission ->
            val r = rig(admission)

            r.reply("Bravo !")

            coVerify(exactly = 1) {
                r.messages.sendOptimistic(conversationId = "d-lea", content = "Bravo !", originalLanguage = any(), sender = me, storyReplyToId = "mood-1")
            }
            assertThat(r.vm.state.value.replyState).isEqualTo(MoodReplyState.SENT)
        }
    }
}
