package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.sync.SyncSeqTracker
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #18924 — `profile:updated` crosses the real socket route, from the payload the gateway composes key by key
 * (`ownProfileUpdatedPayload`, `services/gateway/src/routes/users/own-profile-sync.ts`), a key it may add tolerated.
 */
@RunWith(RobolectricTestRunner::class)
class MessageSocketManagerOwnProfileTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false; coerceInputValues = true }

    private fun managerWithHandlers(): Pair<MessageSocketManager, Map<String, (Array<Any>) -> Unit>> {
        val socket: SocketManager = mockk(relaxed = true)
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        every { socket.on(any(), any()) } answers { handlers[firstArg()] = secondArg() }
        return MessageSocketManager(socket, json, SyncSeqTracker()).also { it.attach() } to handlers
    }

    @Test
    fun `my profile snapshot is decoded from the gateway payload`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.profileUpdated.test {
            handlers.getValue("profile:updated").invoke(
                arrayOf(
                    JSONObject(
                        """{"userId":"me","updatedAt":"2026-11-17T10:05:00.000Z","profile":{"systemLanguage":"en",""" +
                            """"regionalLanguage":null,"customDestinationLanguage":"es","displayName":null,"firstName":"Ada",""" +
                            """"lastName":"Lovelace","username":"ada","avatar":null,"banner":"https://cdn/b.jpg"},"later":1}""",
                    ),
                ),
            )
            val event = awaitItem()
            assertThat(event.userId).isEqualTo("me")
            assertThat(event.updatedAt).isEqualTo("2026-11-17T10:05:00.000Z")
            assertThat(event.profile.customDestinationLanguage).isEqualTo("es")
            assertThat(event.profile.regionalLanguage).isNull()
            assertThat(event.profile.banner).isEqualTo("https://cdn/b.jpg")
            cancelAndIgnoreRemainingEvents()
        }
    }
}
