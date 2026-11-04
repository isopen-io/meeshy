package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.thread.ThreadReply
import me.meeshy.sdk.model.thread.ThreadReplyStatus
import me.meeshy.sdk.thread.ThreadRepliesPage
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ReplyThreadViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(dispatcher)

    @After fun tearDown() = Dispatchers.resetMain()

    private fun reply(id: String, at: Long, status: ThreadReplyStatus = ThreadReplyStatus.SENT, cid: String? = null) =
        ThreadReply(id, cid, "u1", "Ana", null, "t-$id", at, false, status)

    private class FakeReplies(
        var cached: List<ThreadReply> = emptyList(),
        var pages: ArrayDeque<Result<ThreadRepliesPage>> = ArrayDeque(),
    ) : ThreadRepliesPort {
        val offsets = mutableListOf<Int>()
        var gate: CompletableDeferred<Unit>? = null
        override suspend fun cached(conversationId: String, parentId: String) = cached
        override suspend fun load(conversationId: String, parentId: String, offset: Int): ThreadRepliesPage {
            offsets += offset
            gate?.await()
            return pages.removeFirst().getOrThrow()
        }
    }

    private class FakeSender(var failure: Exception? = null) : ThreadReplySenderPort {
        val sent = mutableListOf<String>()
        override suspend fun send(conversationId: String, parentId: String, text: String): ThreadReply {
            failure?.let { throw it }
            sent += text
            return ThreadReply("cid_1", "cid_1", "me", "Moi", null, text, 1_000, true, ThreadReplyStatus.SENDING)
        }
    }

    private fun page(vararg r: ThreadReply, more: Boolean = false) = Result.success(ThreadRepliesPage(r.toList(), more))

    private fun open(vm: ReplyThreadViewModel, canReply: Boolean = true) =
        vm.onEvent(ReplyThreadUiEvent.Open("c1", "p1", canReply))

    @Test
    fun `le cache amorce le fil sans squelette puis le serveur le confirme`() = runTest(dispatcher) {
        val replies = FakeReplies(cached = listOf(reply("a", 1)), pages = ArrayDeque(listOf(page(reply("a", 1), reply("b", 2)))))
        val vm = ReplyThreadViewModel(replies, FakeSender())
        open(vm)
        advanceUntilIdle()
        assertThat(vm.state.value.replies.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(vm.state.value.isLoading).isFalse()
    }

    @Test
    fun `un echec reseau conserve le cache et passe hors ligne sans erreur bloquante`() = runTest(dispatcher) {
        val replies = FakeReplies(cached = listOf(reply("a", 1)), pages = ArrayDeque(listOf(Result.failure(RuntimeException("x")))))
        val vm = ReplyThreadViewModel(replies, FakeSender())
        open(vm)
        advanceUntilIdle()
        assertThat(vm.state.value.replies.map { it.id }).containsExactly("a")
        assertThat(vm.state.value.isOffline).isTrue()
        assertThat(vm.state.value.isLoading).isFalse()
    }

    @Test
    fun `un cache vide affiche le squelette jusqu'a la reponse du serveur`() = runTest(dispatcher) {
        val replies = FakeReplies(pages = ArrayDeque(listOf(page(reply("a", 1)))))
        val gate = CompletableDeferred<Unit>().also { replies.gate = it }
        val vm = ReplyThreadViewModel(replies, FakeSender())
        open(vm)
        dispatcher.scheduler.runCurrent()
        assertThat(vm.state.value.isLoading).isTrue()
        gate.complete(Unit)
        advanceUntilIdle()
        assertThat(vm.state.value.isLoading).isFalse()
    }

    @Test
    fun `envoyer ajoute la reponse optimiste et le rafraichissement ne l'ecrase pas`() = runTest(dispatcher) {
        val replies = FakeReplies(pages = ArrayDeque(listOf(page(reply("a", 1)), page(reply("a", 1)))))
        val sender = FakeSender()
        val vm = ReplyThreadViewModel(replies, sender)
        open(vm)
        advanceUntilIdle()
        vm.onEvent(ReplyThreadUiEvent.DraftChanged("  salut  "))
        vm.onEvent(ReplyThreadUiEvent.Send)
        advanceUntilIdle()
        assertThat(sender.sent).containsExactly("salut")
        assertThat(vm.state.value.replies.map { it.id }).containsExactly("a", "cid_1").inOrder()
        assertThat(vm.state.value.draft).isEmpty()
        assertThat(vm.state.value.isSending).isFalse()
    }

    @Test
    fun `un envoi qui echoue rend le texte au composeur et signale l'erreur`() = runTest(dispatcher) {
        val replies = FakeReplies(pages = ArrayDeque(listOf(page())))
        val vm = ReplyThreadViewModel(replies, FakeSender(failure = RuntimeException("boom")))
        open(vm)
        advanceUntilIdle()
        vm.onEvent(ReplyThreadUiEvent.DraftChanged("salut"))
        vm.onEvent(ReplyThreadUiEvent.Send)
        advanceUntilIdle()
        assertThat(vm.state.value.draft).isEqualTo("salut")
        assertThat(vm.state.value.sendFailed).isTrue()
        assertThat(vm.state.value.replies).isEmpty()
    }

    @Test
    fun `sans droit d'ecrire rien ne part`() = runTest(dispatcher) {
        val sender = FakeSender()
        val vm = ReplyThreadViewModel(FakeReplies(pages = ArrayDeque(listOf(page()))), sender)
        open(vm, canReply = false)
        advanceUntilIdle()
        vm.onEvent(ReplyThreadUiEvent.DraftChanged("salut"))
        vm.onEvent(ReplyThreadUiEvent.Send)
        advanceUntilIdle()
        assertThat(sender.sent).isEmpty()
    }

    @Test
    fun `la page suivante part depuis le nombre de reponses confirmees`() = runTest(dispatcher) {
        val replies = FakeReplies(
            pages = ArrayDeque(listOf(page(reply("a", 1), reply("b", 2), more = true), page(reply("c", 3)))),
        )
        val vm = ReplyThreadViewModel(replies, FakeSender())
        open(vm)
        advanceUntilIdle()
        vm.onEvent(ReplyThreadUiEvent.LoadMore)
        advanceUntilIdle()
        assertThat(replies.offsets).containsExactly(0, 2).inOrder()
        assertThat(vm.state.value.replies.map { it.id }).containsExactly("a", "b", "c").inOrder()
        assertThat(vm.state.value.hasMore).isFalse()
    }
}
