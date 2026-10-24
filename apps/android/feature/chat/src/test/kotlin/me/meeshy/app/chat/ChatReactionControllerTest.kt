package me.meeshy.app.chat

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.ReactionUpdateEvent
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.model.ReactionSyncResponse
import me.meeshy.sdk.reaction.InMemoryEmojiUsageStore
import me.meeshy.sdk.reaction.ReactionRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ChatReactionControllerTest {

    private val me = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "fr")

    private class Rig(
        val controller: ChatReactionController,
        val flow: MutableStateFlow<ChatUiState>,
        val repo: MessageRepository,
        val reactions: ReactionRepository,
        val workManager: WorkManager,
        val emojiUsage: InMemoryEmojiUsageStore,
        val added: MutableSharedFlow<ReactionUpdateEvent>,
        val removed: MutableSharedFlow<ReactionUpdateEvent>,
    ) {
        val state: ChatUiState get() = flow.value
        fun mine(messageId: String): Set<String> = controller.ownReactions.value[messageId] ?: emptySet()
    }

    private fun TestScope.rig(initial: ChatUiState = ChatUiState(conversationId = "c1")): Rig {
        val flow = MutableStateFlow(initial)
        val repo = mockk<MessageRepository>(relaxed = true)
        coEvery { repo.toggleReactionOptimistic(any(), any(), any()) } returns true
        val reactions = mockk<ReactionRepository>(relaxed = true)
        coEvery { reactions.fetchDetails(any()) } returns NetworkResult.Failure(ApiError("offline"))
        val workManager = mockk<WorkManager>(relaxed = true)
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns MutableStateFlow(me)
        val emojiUsage = InMemoryEmojiUsageStore()
        val added = MutableSharedFlow<ReactionUpdateEvent>()
        val removed = MutableSharedFlow<ReactionUpdateEvent>()
        val socket = mockk<MessageSocketManager>()
        every { socket.reactionAdded } returns added
        every { socket.reactionRemoved } returns removed
        val controller = ChatReactionController(
            scope = screenScope(),
            state = ChatStateAccess(flow),
            conversationId = "c1",
            messageRepository = repo,
            reactionRepository = reactions,
            sessionRepository = session,
            emojiUsageStore = emojiUsage,
            messageSocketManager = socket,
            workManager = workManager,
        )
        return Rig(controller, flow, repo, reactions, workManager, emojiUsage, added, removed)
    }

    private fun event(userId: String, conversationId: String = "c1") =
        ReactionUpdateEvent(messageId = "m1", conversationId = conversationId, userId = userId, emoji = "❤️")

    // --- the optimistic toggle -------------------------------------------------------------

    @Test
    fun `a tap lights the chip before the outbox answers and flushes once it is queued`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<Boolean>()
        coEvery { r.repo.toggleReactionOptimistic("m1", "🔥", true) } coAnswers { gate.await() }

        r.controller.toggle("m1", "🔥")
        runCurrent()

        assertThat(r.mine("m1")).containsExactly("🔥")
        verify(exactly = 0) { r.workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }

        gate.complete(true)
        advanceUntilIdle()

        assertThat(r.mine("m1")).containsExactly("🔥")
        verify(exactly = 1) { r.workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
    }

    @Test
    fun `tapping a chip that is already mine removes it`() = runTest {
        val r = rig()
        r.controller.toggle("m1", "🔥")
        advanceUntilIdle()

        r.controller.toggle("m1", "🔥")
        advanceUntilIdle()

        coVerify(exactly = 1) { r.repo.toggleReactionOptimistic("m1", "🔥", false) }
        assertThat(r.mine("m1")).isEmpty()
    }

    @Test
    fun `adding records the usage that ranks the strip, removing does not`() = runTest {
        val r = rig()
        r.controller.start()
        advanceUntilIdle()

        r.controller.toggle("m1", "😢")
        advanceUntilIdle()
        assertThat(r.emojiUsage.usage.value["😢"]).isEqualTo(1)
        assertThat(r.state.quickReactions.first()).isEqualTo("😢")

        r.controller.toggle("m1", "😢")
        advanceUntilIdle()
        assertThat(r.emojiUsage.usage.value["😢"]).isEqualTo(1)
    }

    @Test
    fun `a refused toggle rolls the chip back without an error`() = runTest {
        val r = rig()
        coEvery { r.repo.toggleReactionOptimistic("m1", "🔥", true) } returns false

        r.controller.toggle("m1", "🔥")
        advanceUntilIdle()

        assertThat(r.mine("m1")).isEmpty()
        assertThat(r.state.errorMessage).isNull()
        verify(exactly = 0) { r.workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
    }

    @Test
    fun `a failed toggle rolls the chip back to its snapshot and surfaces the error`() = runTest {
        val r = rig()
        r.controller.toggle("m1", "👍")
        advanceUntilIdle()
        assertThat(r.mine("m1")).containsExactly("👍")
        coEvery { r.repo.toggleReactionOptimistic("m1", "🔥", true) } throws RuntimeException("boom")

        r.controller.toggle("m1", "🔥")
        advanceUntilIdle()

        assertThat(r.mine("m1")).containsExactly("👍")
        assertThat(r.state.errorMessage).isEqualTo("boom")
    }

    @Test
    fun `a failed toggle frees its slot so the viewer can try again`() = runTest {
        val r = rig()
        coEvery { r.repo.toggleReactionOptimistic("m1", "🔥", true) } throws RuntimeException("boom")
        r.controller.toggle("m1", "🔥")
        advanceUntilIdle()
        coEvery { r.repo.toggleReactionOptimistic("m1", "🔥", true) } returns true

        r.controller.toggle("m1", "🔥")
        advanceUntilIdle()

        assertThat(r.mine("m1")).containsExactly("🔥")
        coVerify(exactly = 2) { r.repo.toggleReactionOptimistic("m1", "🔥", true) }
    }

    // --- one toggle in flight per message + emoji ---------------------------------------------

    @Test
    fun `a second tap while the first is still being persisted sends nothing`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<Boolean>()
        coEvery { r.repo.toggleReactionOptimistic("m1", "🔥", true) } coAnswers { gate.await() }

        r.controller.toggle("m1", "🔥")
        runCurrent()
        r.controller.toggle("m1", "🔥")
        r.controller.toggle("m1", "🔥")
        runCurrent()

        assertThat(r.mine("m1")).containsExactly("🔥")
        coVerify(exactly = 1) { r.repo.toggleReactionOptimistic(any(), any(), any()) }

        gate.complete(true)
        advanceUntilIdle()
        coVerify(exactly = 1) { r.repo.toggleReactionOptimistic(any(), any(), any()) }
        verify(exactly = 1) { r.workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
    }

    @Test
    fun `once the flight has landed the same chip toggles off again`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<Boolean>()
        coEvery { r.repo.toggleReactionOptimistic("m1", "🔥", true) } coAnswers { gate.await() }
        r.controller.toggle("m1", "🔥")
        runCurrent()
        gate.complete(true)
        advanceUntilIdle()

        r.controller.toggle("m1", "🔥")
        advanceUntilIdle()

        coVerify(exactly = 1) { r.repo.toggleReactionOptimistic("m1", "🔥", false) }
        assertThat(r.mine("m1")).isEmpty()
    }

    @Test
    fun `another emoji or another message is not held back by a flight in progress`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<Boolean>()
        coEvery { r.repo.toggleReactionOptimistic("m1", "🔥", true) } coAnswers { gate.await() }
        r.controller.toggle("m1", "🔥")
        runCurrent()

        r.controller.toggle("m1", "👍")
        r.controller.toggle("m2", "🔥")
        advanceUntilIdle()

        assertThat(r.mine("m1")).containsExactly("🔥", "👍")
        assertThat(r.mine("m2")).containsExactly("🔥")
        coVerify(exactly = 1) { r.repo.toggleReactionOptimistic("m1", "👍", true) }
        coVerify(exactly = 1) { r.repo.toggleReactionOptimistic("m2", "🔥", true) }
    }

    @Test
    fun `a tap closes the action sheet and the picker, even an ignored one`() = runTest {
        val r = rig(ChatUiState(conversationId = "c1", actionMessageId = "m1", emojiPickerMessageId = "m1"))
        val gate = CompletableDeferred<Boolean>()
        coEvery { r.repo.toggleReactionOptimistic("m1", "🔥", true) } coAnswers { gate.await() }

        r.controller.toggle("m1", "🔥")
        runCurrent()
        assertThat(r.state.actionMessageId).isNull()
        assertThat(r.state.emojiPickerMessageId).isNull()

        r.controller.openEmojiPicker("m1")
        assertThat(r.state.emojiPickerMessageId).isEqualTo("m1")
        r.controller.toggle("m1", "🔥")

        assertThat(r.state.emojiPickerMessageId).isNull()
    }

    @Test
    fun `opening the picker targets the message and dismissing clears it`() = runTest {
        val r = rig(ChatUiState(conversationId = "c1", actionMessageId = "m1"))

        r.controller.openEmojiPicker("m1")
        assertThat(r.state.emojiPickerMessageId).isEqualTo("m1")
        assertThat(r.state.actionMessageId).isNull()

        r.controller.dismissEmojiPicker()
        assertThat(r.state.emojiPickerMessageId).isNull()
    }

    // --- peers' reaction frames ----------------------------------------------------------------

    @Test
    fun `a peer's reaction frame is folded into the cache as a delta`() = runTest {
        val r = rig()
        r.controller.start()
        advanceUntilIdle()

        r.added.emit(event("other"))
        r.removed.emit(event("other"))
        advanceUntilIdle()

        coVerify(exactly = 1) { r.repo.applyReactionDelta("m1", "❤️", 1) }
        coVerify(exactly = 1) { r.repo.applyReactionDelta("m1", "❤️", -1) }
    }

    @Test
    fun `the echo of my own reaction and a frame from another conversation are ignored`() = runTest {
        val r = rig()
        r.controller.start()
        advanceUntilIdle()

        r.added.emit(event("me"))
        r.added.emit(event("other", conversationId = "elsewhere"))
        advanceUntilIdle()

        coVerify(exactly = 0) { r.repo.applyReactionDelta(any(), any(), any()) }
    }

    // --- who-reacted sheet -----------------------------------------------------------------------

    @Test
    fun `the who-reacted sheet opens loading, then settles on an empty breakdown when the fetch fails`() = runTest {
        val r = rig()

        r.controller.openDetails("m1")
        val opening = r.state.reactionDetails
        assertThat(opening?.messageId).isEqualTo("m1")
        assertThat(opening?.isLoading).isTrue()

        advanceUntilIdle()

        assertThat(r.state.reactionDetails?.isLoading).isFalse()
        assertThat(r.state.reactionDetails?.breakdown).isEqualTo(ReactionBreakdown(emptyList()))
    }

    @Test
    fun `fetching the details also refreshes my own reactions`() = runTest {
        val r = rig()
        coEvery { r.reactions.fetchDetails("m1") } returns NetworkResult.Success(
            ReactionSyncResponse(messageId = "m1", userReactions = listOf("❤️")),
        )

        r.controller.openDetails("m1")
        advanceUntilIdle()

        assertThat(r.mine("m1")).containsExactly("❤️")
        assertThat(r.state.reactionDetails?.isLoading).isFalse()
    }

    @Test
    fun `a sheet reopened on another message is not overwritten by the slow answer of the first`() = runTest {
        val r = rig()
        val slow = CompletableDeferred<NetworkResult<ReactionSyncResponse>>()
        coEvery { r.reactions.fetchDetails("m1") } coAnswers { slow.await() }
        r.controller.openDetails("m1")
        runCurrent()

        r.controller.openDetails("m2")
        advanceUntilIdle()
        slow.complete(NetworkResult.Success(ReactionSyncResponse(messageId = "m1")))
        advanceUntilIdle()

        assertThat(r.state.reactionDetails?.messageId).isEqualTo("m2")
    }

    @Test
    fun `closing the sheet clears it and a stray tab index is inert`() = runTest {
        val r = rig()
        r.controller.openDetails("m1")
        advanceUntilIdle()

        r.controller.selectTab(7)
        assertThat(r.state.reactionDetails?.selectedTabIndex).isEqualTo(0)

        r.controller.closeDetails()
        assertThat(r.state.reactionDetails).isNull()
    }

    @Test
    fun `a long press hydrates my reactions on that message`() = runTest {
        val r = rig()
        coEvery { r.reactions.fetchDetails("m2") } returns NetworkResult.Success(
            ReactionSyncResponse(messageId = "m2", userReactions = listOf("👏")),
        )

        r.controller.refreshOwnReactions("m2")
        advanceUntilIdle()

        assertThat(r.mine("m2")).containsExactly("👏")
    }

    @Test
    fun `adding from the quick strip records the usage and flips the sheet at once`() = runTest {
        val r = rig()
        coEvery { r.reactions.fetchDetails("m1") } returns NetworkResult.Success(
            ReactionSyncResponse(messageId = "m1"),
        )
        r.controller.openDetails("m1")
        advanceUntilIdle()

        r.controller.addFromDetails("m1", "🔥")
        advanceUntilIdle()

        assertThat(r.emojiUsage.usage.value["🔥"]).isEqualTo(1)
        coVerify(exactly = 1) { r.repo.toggleReactionOptimistic("m1", "🔥", true) }
        val tabs = r.state.reactionDetails!!.breakdown.tabs
        assertThat(tabs.first().count).isEqualTo(1)
        assertThat(r.state.reactionDetails!!.quickEmojis.first()).isEqualTo("🔥")
    }

    @Test
    fun `the quick strip never takes back a reaction the viewer already has`() = runTest {
        val r = rig()
        r.controller.toggle("m1", "🔥")
        advanceUntilIdle()

        r.controller.addFromDetails("m1", "🔥")
        advanceUntilIdle()

        coVerify(exactly = 1) { r.repo.toggleReactionOptimistic("m1", "🔥", true) }
        assertThat(r.mine("m1")).containsExactly("🔥")
    }

    @Test
    fun `a refused add from the sheet rolls its row back`() = runTest {
        val r = rig()
        coEvery { r.repo.toggleReactionOptimistic("m1", "🔥", true) } returns false
        r.controller.openDetails("m1")
        advanceUntilIdle()

        r.controller.addFromDetails("m1", "🔥")
        advanceUntilIdle()

        assertThat(r.state.reactionDetails!!.breakdown.isEmpty).isTrue()
    }

    @Test
    fun `the sheet opens with the twelve most used emojis for its strip`() = runTest {
        val r = rig()
        repeat(3) { r.emojiUsage.record("🎉") }

        r.controller.openDetails("m1")

        val strip = r.state.reactionDetails!!.quickEmojis
        assertThat(strip.first()).isEqualTo("🎉")
        assertThat(strip.size).isAtMost(12)
    }
}
