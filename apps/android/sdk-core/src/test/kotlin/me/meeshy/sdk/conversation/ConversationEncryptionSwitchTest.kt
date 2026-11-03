package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.sdk.e2ee.InMemoryEndToEndRegimeLedger
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ConversationEncryptionChangedSocketEvent
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.sync.SyncAccountProvider
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #13794 — `conversation:encryption-changed` repeint la conversation en cache pour TOUS les modes, comme iOS
 * (`adoptingEncryption`) : le fil ouvert, qui observe sa ligne, se repeint sans rechargement. Le passage au bout en bout
 * scelle en plus le registre du compte ; une rétrogradation annoncée ne repeint jamais une conversation vue e2ee (#12949).
 */
@RunWith(RobolectricTestRunner::class)
class ConversationEncryptionSwitchTest {

    private class Account(var id: String? = "u-a") : SyncAccountProvider {
        override fun activeAccountId(): String? = id
    }

    private suspend fun MessageCollaboratorHarness.cache(mode: String?) {
        database.conversationDao().upsertAll(
            listOf(
                ConversationEntity(
                    id = CONVERSATION,
                    payload = MeeshyApi.json.encodeToString(ApiConversation(id = CONVERSATION, type = "group", encryptionMode = mode)),
                    updatedAt = 0,
                    cachedAt = 0,
                ),
            ),
        )
    }

    private suspend fun MessageCollaboratorHarness.cachedMode(): String? =
        MeeshyApi.json.decodeFromString<ApiConversation>(database.conversationDao().find(CONVERSATION)!!.payload).encryptionMode

    @Test
    fun `une bascule server vers hybrid repeint la ligne sans sceller le registre`() = runHarnessTest { harness ->
        val ledger = InMemoryEndToEndRegimeLedger(Account())
        harness.cache("server")

        EndToEndRegimeKeeper(ledger, harness.database).adopt(CONVERSATION, "hybrid")

        assertThat(harness.cachedMode()).isEqualTo("hybrid")
        assertThat(ledger.isSealed(CONVERSATION)).isFalse()
    }

    @Test
    fun `un passage au bout en bout repeint la ligne et scelle le registre`() = runHarnessTest { harness ->
        val ledger = InMemoryEndToEndRegimeLedger(Account())
        harness.cache("hybrid")

        EndToEndRegimeKeeper(ledger, harness.database).adopt(CONVERSATION, "e2ee")

        assertThat(harness.cachedMode()).isEqualTo("e2ee")
        assertThat(ledger.isSealed(CONVERSATION)).isTrue()
    }

    @Test
    fun `une retrogradation annoncee ne repeint pas une ligne e2ee`() = runHarnessTest { harness ->
        val ledger = InMemoryEndToEndRegimeLedger(Account())
        harness.cache("e2ee")

        EndToEndRegimeKeeper(ledger, harness.database).adopt(CONVERSATION, "server")
        EndToEndRegimeKeeper(ledger, harness.database).adopt(CONVERSATION, null)

        assertThat(harness.cachedMode()).isEqualTo("e2ee")
    }

    @Test
    fun `une conversation scellee au registre, meme servie server en cache, ne se repeint pas vers un mode lisible`() = runHarnessTest { harness ->
        val ledger = InMemoryEndToEndRegimeLedger(Account())
        ledger.learn(CONVERSATION)
        harness.cache("server")

        EndToEndRegimeKeeper(ledger, harness.database).adopt(CONVERSATION, "hybrid")

        assertThat(harness.cachedMode()).isEqualTo("server")
    }

    @Test
    fun `la liaison temps reel repeint la ligne pour une bascule lisible, plus seulement pour le bout en bout`() = runHarnessTest { harness ->
        val ledger = InMemoryEndToEndRegimeLedger(Account())
        harness.cache("server")
        val events = MutableSharedFlow<ConversationEncryptionChangedSocketEvent>(extraBufferCapacity = 4)
        val socket = mockk<MessageSocketManager> { every { encryptionChanged } returns events }
        val binding = EndToEndRegimeBinding(socket, EndToEndRegimeKeeper(ledger, harness.database))
        binding.attach()
        try {
            withContext(Dispatchers.Default) {
                withTimeout(5_000) {
                    while (events.subscriptionCount.value == 0) delay(10)
                    events.emit(ConversationEncryptionChangedSocketEvent(conversationId = CONVERSATION, mode = "hybrid", epoch = 2))
                    while (harness.cachedMode() != "hybrid") delay(10)
                }
            }
        } finally {
            binding.detach()
        }
        assertThat(harness.cachedMode()).isEqualTo("hybrid")
    }

    private companion object {
        const val CONVERSATION = "c-switch"
    }
}
