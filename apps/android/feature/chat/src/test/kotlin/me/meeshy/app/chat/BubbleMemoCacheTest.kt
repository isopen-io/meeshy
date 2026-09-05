package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.LocalSendState
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.MeeshyUser
import org.junit.Test

private fun message(id: String, senderId: String = "them", content: String = "hi") =
    LocalMessage(
        message = ApiMessage(id = id, conversationId = "c1", senderId = senderId, content = content),
    )

private fun buildArgs(
    memo: BubbleMemoCache,
    local: LocalMessage,
    currentUser: MeeshyUser? = null,
    ownReactions: Set<String> = emptySet(),
    isOffline: Boolean = false,
) = memo.build(
    local = local,
    currentUser = currentUser,
    showSenderName = true,
    ownReactions = ownReactions,
    recipientCount = 1,
    showOriginal = false,
    activeLanguageCode = null,
    mediaBaseUrl = "https://media.example",
    showReadReceipts = true,
    isOffline = isOffline,
)

/**
 * #5189 — per-message memoization: a reaction on ONE message, or a
 * connectivity blip that doesn't affect a settled message, must not replay
 * [me.meeshy.ui.component.bubble.BubbleContentBuilder.build] for messages
 * whose own inputs are unchanged.
 */
class BubbleMemoCacheTest {

    @Test
    fun `an unchanged message is not rebuilt on a later call`() {
        val memo = BubbleMemoCache()
        val a = message("a")

        buildArgs(memo, a)
        buildArgs(memo, a)

        assertThat(memo.buildInvocations).isEqualTo(1)
    }

    @Test
    fun `a reaction on one message does not rebuild the bubbles of other messages`() {
        val memo = BubbleMemoCache()
        val a = message("a")
        val b = message("b")
        buildArgs(memo, a)
        buildArgs(memo, b)
        assertThat(memo.buildInvocations).isEqualTo(2)

        // Only "a" gets a new reaction — "b"'s inputs are identical to before.
        buildArgs(memo, a, ownReactions = setOf("👍"))
        buildArgs(memo, b)

        assertThat(memo.buildInvocations).isEqualTo(3)
    }

    @Test
    fun `a connectivity flip does not rebuild a settled message's bubble`() {
        val memo = BubbleMemoCache()
        val settled = message("a") // default LocalSendState.SYNCED
        buildArgs(memo, settled, isOffline = false)
        assertThat(memo.buildInvocations).isEqualTo(1)

        buildArgs(memo, settled, isOffline = true)

        assertThat(memo.buildInvocations).isEqualTo(1)
    }

    @Test
    fun `a connectivity flip DOES rebuild an outgoing message still sending`() {
        val memo = BubbleMemoCache()
        val me = MeeshyUser(id = "me", username = "me")
        val sending = LocalMessage(
            message = ApiMessage(id = "a", conversationId = "c1", senderId = "me", content = "hi"),
            sendState = LocalSendState.SENDING,
        )
        buildArgs(memo, sending, currentUser = me, isOffline = false)
        assertThat(memo.buildInvocations).isEqualTo(1)

        buildArgs(memo, sending, currentUser = me, isOffline = true)

        assertThat(memo.buildInvocations).isEqualTo(2)
    }

    @Test
    fun `a changed message content rebuilds its own bubble`() {
        val memo = BubbleMemoCache()
        val a = message("a", content = "hi")
        buildArgs(memo, a)

        val edited = message("a", content = "hi there")
        val result = buildArgs(memo, edited)

        assertThat(memo.buildInvocations).isEqualTo(2)
        assertThat(result.text).isEqualTo("hi there")
    }

    @Test
    fun `retain drops entries for messages no longer visible, forcing a rebuild if they return`() {
        val memo = BubbleMemoCache()
        val a = message("a")
        buildArgs(memo, a)
        assertThat(memo.buildInvocations).isEqualTo(1)

        memo.retain(emptySet())
        buildArgs(memo, a)

        assertThat(memo.buildInvocations).isEqualTo(2)
    }

    @Test
    fun `retain keeps entries for messages still visible`() {
        val memo = BubbleMemoCache()
        val a = message("a")
        buildArgs(memo, a)
        assertThat(memo.buildInvocations).isEqualTo(1)

        memo.retain(setOf("a"))
        buildArgs(memo, a)

        assertThat(memo.buildInvocations).isEqualTo(1)
    }

    @Test
    fun `a cache hit returns content equal to what a fresh build would produce`() {
        val memo = BubbleMemoCache()
        val a = message("a")

        val first = buildArgs(memo, a)
        val second = buildArgs(memo, a)

        assertThat(second).isEqualTo(first)
    }
}
