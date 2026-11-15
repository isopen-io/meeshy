package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.translation.SharedTranslationKdf
import me.meeshy.sdk.sync.SyncSeqTracker
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class MessageSocketManagerTranslationSharedTest {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    private fun handlers(): Pair<MessageSocketManager, Map<String, (Array<Any>) -> Unit>> {
        val socket: SocketManager = mockk(relaxed = true)
        val map = mutableMapOf<String, (Array<Any>) -> Unit>()
        every { socket.on(any(), any()) } answers { map[firstArg()] = secondArg() }
        return MessageSocketManager(socket, json, SyncSeqTracker()).also { it.attach() } to map
    }

    private fun payload(kdf: String = "message-content") = JSONObject(
        """{"id":"t1","conversationId":"c1","messageId":"m1","targetLanguage":"fr",
           "envelope":{"v":1,"alg":"A256GCM","kdf":"$kdf","payload":"AAAA"},
           "sharedBy":"u1","sharedAt":"2026-10-01T00:00:00.000Z","extra":1}""",
    )

    @Test
    fun `message translation shared est decode et remis`() = runTest {
        val (manager, map) = handlers()
        manager.translationShared.test {
            map.getValue("message:translation-shared").invoke(arrayOf(payload()))
            val event = awaitItem()
            assertThat(event.messageId).isEqualTo("m1")
            assertThat(event.envelope.kdf).isEqualTo(SharedTranslationKdf.MESSAGE_CONTENT)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `une charge illisible ne leve rien sur le thread de socket`() {
        val (_, map) = handlers()
        map.getValue("message:translation-shared").invoke(arrayOf(payload(kdf = "futur")))
        map.getValue("message:translation-shared").invoke(arrayOf("pas un objet"))
    }
}
