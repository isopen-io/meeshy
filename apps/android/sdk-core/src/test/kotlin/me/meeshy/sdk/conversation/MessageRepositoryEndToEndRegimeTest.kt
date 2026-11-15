package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import io.mockk.mockkClass
import java.lang.reflect.InvocationTargetException
import javax.inject.Inject
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.sdk.e2ee.InMemoryEndToEndRegimeLedger
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.sync.SyncAccountProvider
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #13792 — les deux chemins REST du fil (revalidation de la fenêtre récente, page d'historique) nourrissent le registre des
 * régimes par le dépôt tel que Hilt le construit : un tête-à-tête servi chiffré de bout en bout s'y scelle, fil fermé ou non.
 */
@RunWith(RobolectricTestRunner::class)
class MessageRepositoryEndToEndRegimeTest {

    private val account = SyncAccountProvider { "u-a" }

    private fun sealed(id: String, createdAt: String) = ApiMessage(
        id = id,
        conversationId = DIRECT,
        senderId = "u-peer",
        content = "[Encrypted]",
        createdAt = createdAt,
        isEncrypted = true,
        encryptionMode = "e2ee",
    )

    private fun clear(id: String, createdAt: String) =
        ApiMessage(id = id, conversationId = DIRECT, senderId = "u-peer", content = "salut", createdAt = createdAt)

    private suspend fun MessageCollaboratorHarness.cacheDirect() {
        database.conversationDao().upsertAll(
            listOf(
                ConversationEntity(
                    id = DIRECT,
                    payload = MeeshyApi.json.encodeToString(ApiConversation(id = DIRECT, type = "direct", encryptionMode = "server")),
                    updatedAt = 0,
                    cachedAt = 0,
                ),
            ),
        )
    }

    private fun MessageCollaboratorHarness.repository(api: MessageApi, ledger: InMemoryEndToEndRegimeLedger) = MessageRepository(
        api,
        mockk(relaxed = true),
        database,
        database.messageDao(),
        database.syncMetaDao(),
        outbox,
        clock,
        regime = EndToEndRegimeKeeper(ledger, database),
    )

    @Test
    fun `la revalidation de la fenetre recente scelle le tete-a-tete servi e2ee`() = runHarnessTest { harness ->
        val ledger = InMemoryEndToEndRegimeLedger(account)
        harness.cacheDirect()
        val api = mockk<MessageApi> {
            coEvery { listConditional(DIRECT, any()) } returns
                retrofit2.Response.success(ApiResponse(success = true, data = listOf(sealed("m1", T2))))
        }

        harness.repository(api, ledger).refresh(DIRECT)

        assertThat(ledger.isSealed(DIRECT)).isTrue()
    }

    @Test
    fun `une page d historique servie e2ee scelle le tete-a-tete`() = runHarnessTest { harness ->
        val ledger = InMemoryEndToEndRegimeLedger(account)
        harness.cacheDirect()
        harness.seedSynced(clear("m2", T2))
        val api = mockk<MessageApi> {
            coEvery { list(DIRECT, any(), any(), "m2") } returns
                ApiResponse(success = true, data = listOf(sealed("m1", T1)), pagination = Pagination(hasMore = false))
        }

        harness.repository(api, ledger).loadOlder(DIRECT)

        assertThat(ledger.isSealed(DIRECT)).isTrue()
    }

    @Test
    fun `Hilt injecte le registre des regimes au depot et au prechargement - le constructeur injecte refuse un registre nul`() = runHarnessTest { harness ->
        listOf(MessageRepository::class.java, RoomMessagePrefetchStore::class.java).forEach { type ->
            val injected = type.declaredConstructors.single { it.isAnnotationPresent(Inject::class.java) }
            assertThat(injected.parameterTypes.toList()).contains(EndToEndRegimeKeeper::class.java)
            val arguments = injected.parameterTypes.map { parameter ->
                when (parameter) {
                    EndToEndRegimeKeeper::class.java, AccountFence::class.java -> null
                    MeeshyDatabase::class.java -> harness.database
                    MessageDao::class.java -> harness.database.messageDao()
                    else -> mockkClass(parameter.kotlin, relaxed = true)
                }
            }
            val refused = runCatching { injected.newInstance(*arguments.toTypedArray()) }.exceptionOrNull()
            assertThat((refused as? InvocationTargetException)?.targetException).isInstanceOf(NullPointerException::class.java)
        }
    }

    private companion object {
        const val DIRECT = "c-direct"
        const val T1 = "2026-01-01T10:00:00.000Z"
        const val T2 = "2026-01-02T10:00:00.000Z"
    }
}
