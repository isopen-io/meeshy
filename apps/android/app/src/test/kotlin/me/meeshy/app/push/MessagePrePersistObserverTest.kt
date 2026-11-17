package me.meeshy.app.push

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import me.meeshy.sdk.conversation.MinimalMessageIngest
import me.meeshy.sdk.lock.ConversationLockStore
import me.meeshy.sdk.lock.InMemoryConversationLockStore
import me.meeshy.sdk.model.MinimalMessageSeed
import me.meeshy.sdk.net.InMemoryTokenStore
import org.junit.Test
import java.util.Collections

/**
 * Miroir de `NSEPreparationStep.plan` (iOS) : une conversation verrouillée ne pré-enregistre pas son message —
 * ni texte ni graine ne sont écrits en cache depuis la charge d'un push que le verrou scelle.
 */
class MessagePrePersistObserverTest {

    private val ingested = Collections.synchronizedList(mutableListOf<String>())
    private val written = CompletableDeferred<Unit>()

    private val ingest = mockk<MinimalMessageIngest> {
        coEvery { ingest(any()) } answers {
            ingested += firstArg<MinimalMessageSeed>().conversationId
            written.complete(Unit)
            true
        }
    }

    private fun observer(locks: ConversationLockStore) =
        MessagePrePersistObserver(ingest, InMemoryTokenStore(jwt = "jwt", userId = "me"), locks)

    private fun push(conversationId: String) = IncomingPush.of(
        mapOf(
            "type" to "new_message", "notificationId" to "n-$conversationId", "conversationId" to conversationId,
            "messageId" to "m-$conversationId", "senderId" to "u1", "body" to "mon code est 4471",
        ),
    )

    private fun awaitWrite() = runBlocking { withTimeout(5_000) { written.await() } }

    @Test
    fun `un message d une conversation non verrouillee est pre-enregistre`() {
        observer(InMemoryConversationLockStore()).onPush(push("c2"))

        awaitWrite()
        assertThat(ingested).containsExactly("c2")
    }

    @Test
    fun `un message d une conversation verrouillee n est jamais pre-enregistre`() {
        val locks = InMemoryConversationLockStore().also { it.setLock("c1", "1234") }
        val observer = observer(locks)

        observer.onPush(push("c1"))
        observer.onPush(push("c2"))

        awaitWrite()
        assertThat(ingested).containsExactly("c2")
    }

    @Test
    fun `un verrou illisible ne pre-enregistre rien`() {
        val broken = mockk<ConversationLockStore> { io.mockk.every { isLocked(any()) } throws IllegalStateException("keystore") }
        val locks = InMemoryConversationLockStore()
        val observer = observer(broken)

        observer.onPush(push("c1"))
        observer(locks).onPush(push("c2"))

        awaitWrite()
        assertThat(ingested).containsExactly("c2")
    }
}
