package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import java.io.IOException
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.api.MessageApi
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.Response

/**
 * #18915 — ce que la revalidation d'un fil a le droit d'élaguer. Une page de la fenêtre récente est construite AVANT
 * d'arriver : un message écrit pendant son vol (socket, accusé de mon envoi) lui est inconnu, et son absence ne prouve
 * rien. Seul ce qui était détenu avant la requête peut être dit supprimé.
 */
@RunWith(RobolectricTestRunner::class)
class MessageWindowRevalidationTest {

    private fun message(id: String, at: String, senderId: String = "u-peer", clientMessageId: String? = null) = ApiMessage(
        id = id,
        conversationId = CONVERSATION,
        senderId = senderId,
        content = "texte $id",
        clientMessageId = clientMessageId,
        createdAt = at,
    )

    private fun page(vararg messages: ApiMessage) = Response.success(ApiResponse(success = true, data = messages.toList()))

    private fun MessageCollaboratorHarness.repository(api: MessageApi) = MessageRepository(
        api,
        mockk(relaxed = true),
        database,
        database.messageDao(),
        database.syncMetaDao(),
        outbox,
        clock,
        regime = EndToEndRegimeKeeper(EndToEndRegimeLedger.None, database),
    )

    @Test
    fun `a message the socket writes while the recent window is in flight survives the page that predates it`() =
        runHarnessTest { harness ->
            val api = mockk<MessageApi> {
                coEvery { listConditional(CONVERSATION, any()) } coAnswers {
                    MessageIngestPipeline(harness.database).ingest(listOf(message("m3", T3)), harness.clock.now)
                    page(message("m1", T1))
                }
            }

            harness.repository(api).refresh(CONVERSATION)

            assertThat(harness.database.messageDao().find("m1")).isNotNull()
            assertThat(harness.database.messageDao().find("m3")).isNotNull()
        }

    @Test
    fun `my message acknowledged while the recent window is in flight survives the page that predates it`() =
        runHarnessTest { harness ->
            harness.seedSynced(message("m1", T1))
            lateinit var repo: MessageRepository
            lateinit var cid: String
            val api = mockk<MessageApi> {
                coEvery { listAfter(CONVERSATION, any(), any()) } throws IOException("offline")
                coEvery { listConditional(CONVERSATION, any()) } coAnswers {
                    repo.reconcileSent(cid, message("m3", T3, senderId = "me", clientMessageId = cid))
                    page(message("m1", T1))
                }
            }
            repo = harness.repository(api)
            cid = repo.sendOptimistic(CONVERSATION, "salut", "fr", MeeshyUser(id = "me", username = "me"))

            repo.refresh(CONVERSATION)

            assertThat(harness.database.messageDao().find("m3")).isNotNull()
            assertThat(harness.database.messageDao().find("m1")).isNotNull()
        }

    private companion object {
        const val CONVERSATION = "c1"
        const val T1 = "2026-06-01T10:00:00Z"
        const val T3 = "2026-06-01T12:00:00Z"
    }
}
