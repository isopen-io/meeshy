package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import java.time.Instant
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import me.meeshy.core.database.entity.MessageTranslationEntity
import me.meeshy.core.database.entity.SyncMetaEntity
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CursorPagination
import me.meeshy.sdk.model.MessagesApiResponse
import me.meeshy.sdk.net.api.MessageApi
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.Response

/**
 * What leaves the device with a thread or a message (audit of #19046 / #19115):
 * - A2 — the revalidation runs in a job of its own, out of reach of the screen: a thread purged during its flight
 *   (« Supprimer pour moi », « Quitter ») must not come back from its page, its keys included;
 * - A3 — a message the recent window declares gone, and every message of a purged thread, leave with their child rows:
 *   a retained translation keeps the text of the message it translates.
 */
@RunWith(RobolectricTestRunner::class)
class MessageThreadPurgeTest {

    private fun message(id: String, at: String) =
        ApiMessage(id = id, conversationId = CONVERSATION, senderId = "u-peer", content = "texte $id", createdAt = at)

    private fun page(vararg messages: ApiMessage) = Response.success(ApiResponse(success = true, data = messages.toList()))

    private val nothingAfter = MessagesApiResponse(success = true, data = emptyList(), cursorPagination = CursorPagination(hasMore = false))

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

    private suspend fun MessageCollaboratorHarness.retainTranslation(messageId: String) =
        database.messageTranslationDao().upsertText(MessageTranslationEntity(messageId, "fr", "texte traduit", "en", null, null, 1L))

    private suspend fun MessageCollaboratorHarness.retainedTranslations(messageId: String) =
        database.messageTranslationDao().textsFor(listOf(messageId))

    @Test
    fun `a thread purged while its revalidation flies stays purged, its messages and its key included`() =
        runHarnessTest { harness ->
            harness.seedSynced(message("m1", T1))
            harness.database.syncMetaDao().upsert(SyncMetaEntity(KEY, harness.clock.now - THREE_MINUTES, Instant.parse(T1).toEpochMilli()))
            val asked = CompletableDeferred<Unit>()
            val released = CompletableDeferred<Unit>()
            val api = mockk<MessageApi> {
                coEvery { listConditional(CONVERSATION, any()) } coAnswers {
                    asked.complete(Unit)
                    released.await()
                    page(message("m1", T1), message("m2", T2))
                }
                coEvery { listAfter(CONVERSATION, any(), any()) } returns nothingAfter
            }
            val repo = harness.repository(api)

            coroutineScope {
                val revalidating = launch { repo.refresh(CONVERSATION) }
                asked.await()
                harness.database.withTransaction { harness.database.clearThreadCache(CONVERSATION) }
                released.complete(Unit)
                revalidating.join()
            }

            assertThat(harness.database.messageDao().listForConversation(CONVERSATION)).isEmpty()
            assertThat(harness.database.syncMetaDao().lastSyncedAt(KEY)).isNull()
        }

    @Test
    fun `a message the recent window declares gone leaves with its retained translation`() = runHarnessTest { harness ->
        harness.seedSynced(message("m1", T1))
        harness.seedSynced(message("m2", T2))
        harness.retainTranslation("m2")
        val api = mockk<MessageApi> {
            coEvery { listConditional(CONVERSATION, any()) } returns page(message("m1", T1))
            coEvery { listAfter(CONVERSATION, any(), any()) } returns nothingAfter
        }

        harness.repository(api).refresh(CONVERSATION)

        assertThat(harness.database.messageDao().find("m2")).isNull()
        assertThat(harness.retainedTranslations("m2")).isEmpty()
    }

    @Test
    fun `a purged thread leaves with the retained translations of its messages`() = runHarnessTest { harness ->
        harness.seedSynced(message("m1", T1))
        harness.retainTranslation("m1")

        harness.database.withTransaction { harness.database.clearThreadCache(CONVERSATION) }

        assertThat(harness.database.messageDao().find("m1")).isNull()
        assertThat(harness.retainedTranslations("m1")).isEmpty()
    }

    private companion object {
        const val CONVERSATION = "c1"
        const val KEY = "messages:$CONVERSATION"
        const val THREE_MINUTES = 180_000L
        const val T1 = "2026-06-01T10:00:00Z"
        const val T2 = "2026-06-01T11:00:00Z"
    }
}
