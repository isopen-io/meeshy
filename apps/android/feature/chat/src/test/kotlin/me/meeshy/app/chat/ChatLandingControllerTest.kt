package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import me.meeshy.sdk.conversation.MessageLanding
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.ui.component.bubble.BubbleContent
import org.junit.Test

/**
 * #14670 — a search hit opens the conversation ON its message, even far outside the first page: the
 * window centred on it is loaded, the list lands on it once it is drawn, and it is lit for an instant.
 */
class ChatLandingControllerTest {

    private fun bubble(id: String) = BubbleContent(
        messageId = id,
        text = "message $id",
        isOutgoing = false,
        isTranslated = false,
        originalText = null,
        senderName = null,
        showSenderName = false,
        isEdited = false,
        isDeleted = false,
        createdAtIso = null,
    )

    private val firstPage = (100 until 130).map { bubble("r$it") }
    private val aroundWindow = (40 until 61).map { bubble("o$it") }

    private class Rig(val repo: MessageRepository, initial: ChatUiState) {
        val scope = TestScope(StandardTestDispatcher())
        val flow = MutableStateFlow(initial)
        val controller = ChatLandingController("c1", ChatStateAccess(flow), repo, scope)
        val state: ChatUiState get() = flow.value
        val landing: ChatLandingState get() = controller.state.value

        fun showMessages(messages: List<BubbleContent>) {
            flow.value = flow.value.copy(messages = messages)
        }
    }

    private fun rig(landing: MessageLanding): Rig {
        val repo = mockk<MessageRepository>(relaxed = true)
        coEvery { repo.loadAround("c1", "o50") } returns landing
        return Rig(repo, ChatUiState(messages = firstPage))
    }

    @Test
    fun `an anchor outside the first page loads its window, then lands on it and lights it`() {
        val r = rig(MessageLanding.Anchored(hasNewer = true, hasOlder = true))

        r.controller.land("o50")
        r.scope.runCurrent()

        coVerify(exactly = 1) { r.repo.loadAround("c1", "o50") }
        assertThat(r.state.scrollToMessageId).isNull()
        assertThat(r.landing.hasMoreNewer).isTrue()

        r.showMessages(aroundWindow)
        r.scope.runCurrent()

        assertThat(r.state.scrollToMessageId).isEqualTo("o50")
        assertThat(r.landing.highlightedMessageId).isEqualTo("o50")
    }

    @Test
    fun `the light goes out after an instant`() {
        val r = rig(MessageLanding.Anchored(hasNewer = true, hasOlder = true))
        r.controller.land("o50")
        r.scope.runCurrent()
        r.showMessages(aroundWindow)
        r.scope.runCurrent()

        r.scope.advanceTimeBy(2_100)
        r.scope.runCurrent()

        assertThat(r.landing.highlightedMessageId).isNull()
    }

    @Test
    fun `an anchor already drawn lands at once without anchoring the window`() {
        val repo = mockk<MessageRepository>(relaxed = true)
        coEvery { repo.loadAround("c1", "r120") } returns MessageLanding.InWindow
        val r = Rig(repo, ChatUiState(messages = firstPage))

        r.controller.land("r120")
        r.scope.runCurrent()

        assertThat(r.state.scrollToMessageId).isEqualTo("r120")
        assertThat(r.landing.hasMoreNewer).isFalse()
    }

    @Test
    fun `a message the server no longer serves leaves the conversation where it opened`() {
        val r = rig(MessageLanding.NotFound)

        r.controller.land("o50")
        r.scope.runCurrent()
        r.showMessages(aroundWindow)
        r.scope.runCurrent()

        assertThat(r.state.scrollToMessageId).isNull()
        assertThat(r.landing.highlightedMessageId).isNull()
    }

    @Test
    fun `offline, a cached anchor still lands`() {
        val repo = mockk<MessageRepository>(relaxed = true)
        coEvery { repo.loadAround("c1", "r110") } throws IllegalStateException("offline")
        val r = Rig(repo, ChatUiState(messages = firstPage))

        r.controller.land("r110")
        r.scope.runCurrent()

        assertThat(r.state.scrollToMessageId).isEqualTo("r110")
    }

    @Test
    fun `the bottom of an anchored window pages newer until the present`() {
        val r = rig(MessageLanding.Anchored(hasNewer = true, hasOlder = true))
        coEvery { r.repo.loadNewer("c1") } returnsMany listOf(true, false)
        r.controller.land("o50")
        r.scope.runCurrent()

        r.controller.loadNewer()
        r.scope.runCurrent()
        assertThat(r.landing.hasMoreNewer).isTrue()

        r.controller.loadNewer()
        r.scope.runCurrent()
        assertThat(r.landing.hasMoreNewer).isFalse()
        assertThat(r.landing.isLoadingNewer).isFalse()

        r.controller.loadNewer()
        r.scope.runCurrent()
        coVerify(exactly = 2) { r.repo.loadNewer("c1") }
    }

    @Test
    fun `back to the present leaves the anchored window`() {
        val r = rig(MessageLanding.Anchored(hasNewer = true, hasOlder = false))
        r.controller.land("o50")
        r.scope.runCurrent()

        r.controller.returnToPresent()
        r.scope.runCurrent()

        coVerify(exactly = 1) { r.repo.jumpToPresent("c1") }
        assertThat(r.landing.hasMoreNewer).isFalse()
        assertThat(r.state.hasMoreOlder).isTrue()
    }

    @Test
    fun `the bottom of an anchored window is not the present, so the jump control stays`() {
        val r = rig(MessageLanding.Anchored(hasNewer = true, hasOlder = true))
        r.controller.land("o50")
        r.scope.runCurrent()

        assertThat(r.landing.isAtPresent(isNearBottom = true)).isFalse()

        r.controller.returnToPresent()
        r.scope.runCurrent()

        assertThat(r.landing.isAtPresent(isNearBottom = true)).isTrue()
        assertThat(r.landing.isAtPresent(isNearBottom = false)).isFalse()
    }

    @Test
    fun `the jump control always goes to the present, even once the landing believes it is there`() {
        val r = rig(MessageLanding.Anchored(hasNewer = true, hasOlder = true))
        coEvery { r.repo.loadNewer("c1") } returns false
        r.controller.land("o50")
        r.scope.runCurrent()
        r.controller.loadNewer()
        r.scope.runCurrent()

        r.controller.returnToPresent()
        r.scope.runCurrent()

        coVerify(exactly = 1) { r.repo.jumpToPresent("c1") }
    }

    @Test
    fun `back to the present that fails says so`() {
        val r = rig(MessageLanding.Anchored(hasNewer = true, hasOlder = true))
        coEvery { r.repo.jumpToPresent("c1") } throws IllegalStateException("offline")
        r.controller.land("o50")
        r.scope.runCurrent()

        r.controller.returnToPresent()
        r.scope.runCurrent()

        assertThat(r.state.errorMessage).isEqualTo("offline")
    }
}
