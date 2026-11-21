package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** `call:conversation-changed` (#19650) arrive sur son flux ; une charge malformée est ignorée sans rien casser. */
@RunWith(RobolectricTestRunner::class)
class CallConversationChangedSocketTest {
    @Test
    fun `la bascule d'un appel arrive sur son flux et une charge malformee est ignoree`() = runTest {
        val fake = FakeCallSocket()
        val manager = CallSocialSignalManager(fake.socket).also { it.attach() }
        manager.conversationChanged.test {
            fake.deliver("call:conversation-changed", """{"callId":"c"}""")
            fake.deliver(
                "call:conversation-changed",
                """{"callId":"c","conversationId":"g","previousConversationId":"d","conversationType":"group","conversationTitle":null,"memberUserIds":["a","b","c"],"created":true,"reason":"invitation"}""",
            )
            val event = awaitItem()
            assertThat(event.conversationId).isEqualTo("g")
            assertThat(event.previousConversationId).isEqualTo("d")
            assertThat(event.memberUserIds).containsExactly("a", "b", "c").inOrder()
        }
    }
}
