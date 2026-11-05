package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.LocalSendState
import me.meeshy.sdk.media.MediaLocationRefusal
import me.meeshy.sdk.media.MediaLoss
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

    @Test
    fun `a send refused for a file's location says so on its failed bubble, a plain failure does not`() {
        val me = MeeshyUser(id = "me", username = "me")
        val refused = message("r", senderId = "me").copy(sendState = LocalSendState.FAILED, lastError = MediaLocationRefusal.REASON)
        val plain = message("p", senderId = "me").copy(sendState = LocalSendState.FAILED, lastError = "Transient delivery failure")
        val sending = message("s", senderId = "me").copy(sendState = LocalSendState.SENDING, lastError = MediaLocationRefusal.REASON)
        val memo = BubbleMemoCache()

        assertThat(buildArgs(memo, refused, currentUser = me).isLocationRefused).isTrue()
        assertThat(buildArgs(memo, plain, currentUser = me).isLocationRefused).isFalse()
        assertThat(buildArgs(memo, sending, currentUser = me).isLocationRefused).isFalse()
    }

    @Test
    fun `a send whose media was lost on the device says so on its failed bubble, never as a location refusal`() {
        val me = MeeshyUser(id = "me", username = "me")
        val lost = message("l", senderId = "me").copy(sendState = LocalSendState.FAILED, lastError = MediaLoss.REASON)
        val plain = message("p", senderId = "me").copy(sendState = LocalSendState.FAILED, lastError = "Transient delivery failure")
        val memo = BubbleMemoCache()

        assertThat(buildArgs(memo, lost, currentUser = me).isMediaLost).isTrue()
        assertThat(buildArgs(memo, lost, currentUser = me).isLocationRefused).isFalse()
        assertThat(buildArgs(memo, plain, currentUser = me).isMediaLost).isFalse()
    }

    @Test
    fun `#16053 a send refused for its attachment right says so on its failed bubble, and only there`() {
        val me = MeeshyUser(id = "me", username = "me")
        val reason = "Refused: HTTP 403 ATTACHMENT_RIGHT_NOT_PERMITTED"
        val refused = message("a", senderId = "me").copy(sendState = LocalSendState.FAILED, lastError = reason)
        val sending = message("s", senderId = "me").copy(sendState = LocalSendState.SENDING, lastError = reason)
        val plain = message("p", senderId = "me").copy(sendState = LocalSendState.FAILED, lastError = "Refused: HTTP 403 WRITE_NOT_PERMITTED")
        val memo = BubbleMemoCache()

        assertThat(buildArgs(memo, refused, currentUser = me).isAttachmentRightRefused).isTrue()
        assertThat(buildArgs(memo, refused, currentUser = me).isLocationRefused).isFalse()
        assertThat(buildArgs(memo, sending, currentUser = me).isAttachmentRightRefused).isFalse()
        assertThat(buildArgs(memo, plain, currentUser = me).isAttachmentRightRefused).isFalse()
    }
}

/** La signature du cache couvre TOUTES les entrées de la bulle : chacune, changée, force la reconstruction. */
class BubbleMemoCacheSignatureTest {

    private val me = MeeshyUser(id = "me", username = "me")

    private fun build(
        memo: BubbleMemoCache,
        local: LocalMessage = message("a"),
        currentUser: MeeshyUser? = me,
        showSenderName: Boolean = true,
        ownReactions: Set<String> = emptySet(),
        recipientCount: Int = 1,
        showOriginal: Boolean = false,
        activeLanguageCode: String? = null,
        mediaBaseUrl: String = "https://media.example",
        showReadReceipts: Boolean = true,
    ) = memo.build(
        local, currentUser, showSenderName, ownReactions, recipientCount, showOriginal,
        activeLanguageCode, mediaBaseUrl, showReadReceipts, isOffline = false,
    )

    private fun rebuilds(change: (BubbleMemoCache) -> Unit): Boolean {
        val memo = BubbleMemoCache()
        build(memo)
        val before = memo.buildInvocations
        change(memo)
        return memo.buildInvocations > before
    }

    @Test
    fun `des entrees identiques sont un succes de cache et rendent la meme instance`() {
        val memo = BubbleMemoCache()
        val first = build(memo)
        val second = build(memo)

        assertThat(second).isSameInstanceAs(first)
        assertThat(memo.buildInvocations).isEqualTo(1)
    }

    @Test
    fun `chaque entree de la signature force la reconstruction quand elle change`() {
        assertThat(rebuilds { build(it, showSenderName = false) }).isTrue()
        assertThat(rebuilds { build(it, ownReactions = setOf("👍")) }).isTrue()
        assertThat(rebuilds { build(it, recipientCount = 5) }).isTrue()
        assertThat(rebuilds { build(it, showOriginal = true) }).isTrue()
        assertThat(rebuilds { build(it, activeLanguageCode = "es") }).isTrue()
        assertThat(rebuilds { build(it, mediaBaseUrl = "https://other.example") }).isTrue()
        assertThat(rebuilds { build(it, showReadReceipts = false) }).isTrue()
        assertThat(rebuilds { build(it, currentUser = null) }).isTrue()
        assertThat(rebuilds { build(it, local = message("a", content = "autre")) }).isTrue()
    }

    @Test
    fun `un echec de cache sur un message ne touche pas l'entree d'un autre`() {
        val memo = BubbleMemoCache()
        val a = build(memo, local = message("a"))
        build(memo, local = message("b"))

        build(memo, local = message("b", content = "modifie"))

        assertThat(build(memo, local = message("a"))).isSameInstanceAs(a)
        assertThat(memo.buildInvocations).isEqualTo(3)
    }
}
