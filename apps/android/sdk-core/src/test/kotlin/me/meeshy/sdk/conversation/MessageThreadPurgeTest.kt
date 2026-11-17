package me.meeshy.sdk.conversation

import androidx.room.withTransaction
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import java.time.Instant
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import me.meeshy.core.database.entity.EditRevisionEntity
import me.meeshy.core.database.entity.EphemeralReceiptEntity
import me.meeshy.core.database.entity.PendingIdEntity
import me.meeshy.core.database.entity.SyncMetaEntity
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CursorPagination
import me.meeshy.sdk.model.MessagesApiResponse
import me.meeshy.sdk.model.StoredTextTranslation
import me.meeshy.sdk.net.api.MessageApi
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.Response

/**
 * What leaves the device with a thread or a message (audit of #19046 / #19115):
 * - A2 — the revalidation runs in a job of its own, out of reach of the screen: a thread purged during its flight
 *   (« Supprimer pour moi », « Quitter ») must not come back from its page, its keys included;
 * - A3 (#19440) — a message the recent window declares gone, and every message of a purged thread, leave with their child
 *   rows: the edit history keeps the PAST texts of the message in clear, the memory of the translations its translation.
 *   The disk rows of the translations leave through a trigger that predates A3, so they are no witness of it.
 */
@RunWith(RobolectricTestRunner::class)
class MessageThreadPurgeTest {

    private fun message(id: String, at: String) =
        ApiMessage(id = id, conversationId = CONVERSATION, senderId = "u-peer", content = "texte $id", originalLanguage = "en", createdAt = at)

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

    /** The child rows [MessageChildRows] takes away, which no trigger takes: past texts in clear, the id bridge, the receipt. */
    private suspend fun MessageCollaboratorHarness.retainChildRowsOf(messageId: String) {
        database.editRevisionDao().upsert(EditRevisionEntity(messageId, 1, "texte antérieur de $messageId", 1L))
        database.pendingIdDao().upsert(PendingIdEntity("cid_$messageId", messageId, CONVERSATION, null))
        database.ephemeralReceiptDao().insertIfAbsent(EphemeralReceiptEntity(messageId, CONVERSATION, 1L, null))
    }

    private suspend fun MessageCollaboratorHarness.editHistoryOf(messageId: String) = database.editRevisionDao().forMessage(messageId)

    private suspend fun MessageCollaboratorHarness.rememberTranslationInMemory(messageId: String) =
        TranslationLayer.of(database).saveText(messageId, StoredTextTranslation(messageId, "fr", "texte traduit", "en", null, null), 1L)

    private suspend fun MessageCollaboratorHarness.translationsShown(local: LocalMessage) =
        TranslationLayer.of(database).project(local).message.translations

    private fun pageServingOnlyM1() = mockk<MessageApi> {
        coEvery { listConditional(CONVERSATION, any()) } returns page(message("m1", T1))
        coEvery { listAfter(CONVERSATION, any(), any()) } returns nothingAfter
    }

    @Test
    fun `a message the recent window declares gone takes its edit history, its id bridge and its receipt with it`() =
        runHarnessTest { harness ->
            harness.seedSynced(message("m1", T1))
            harness.seedSynced(message("m2", T2))
            harness.retainChildRowsOf("m2")

            harness.repository(pageServingOnlyM1()).refresh(CONVERSATION)

            assertThat(harness.database.messageDao().find("m2")).isNull()
            assertThat(harness.editHistoryOf("m2")).isEmpty()
            assertThat(harness.database.pendingIdDao().byServerId("m2")).isNull()
            assertThat(harness.database.ephemeralReceiptDao().find("m2")).isNull()
        }

    @Test
    fun `a message the recent window declares gone is forgotten by the translation memory, not only by the disk`() =
        runHarnessTest { harness ->
            harness.seedSynced(message("m1", T1))
            harness.seedSynced(message("m2", T2))
            harness.rememberTranslationInMemory("m2")
            val local = LocalMessage(harness.cachedMessage("m2"))
            assertThat(harness.translationsShown(local)).isNotEmpty()

            harness.repository(pageServingOnlyM1()).refresh(CONVERSATION)

            assertThat(harness.translationsShown(local)).isEmpty()
        }

    @Test
    fun `a purged thread takes the edit history, the id bridges and the receipts of its messages with it`() = runHarnessTest { harness ->
        harness.seedSynced(message("m1", T1))
        harness.retainChildRowsOf("m1")

        harness.database.withTransaction { harness.database.clearThreadCache(CONVERSATION) }

        assertThat(harness.database.messageDao().find("m1")).isNull()
        assertThat(harness.editHistoryOf("m1")).isEmpty()
        assertThat(harness.database.pendingIdDao().byServerId("m1")).isNull()
        assertThat(harness.database.ephemeralReceiptDao().find("m1")).isNull()
    }

    @Test
    fun `a purged thread is forgotten by the translation memory, not only by the disk`() = runHarnessTest { harness ->
        harness.seedSynced(message("m1", T1))
        harness.rememberTranslationInMemory("m1")
        val local = LocalMessage(harness.cachedMessage("m1"))
        assertThat(harness.translationsShown(local)).isNotEmpty()

        harness.database.withTransaction { harness.database.clearThreadCache(CONVERSATION) }

        assertThat(harness.translationsShown(local)).isEmpty()
    }

    private companion object {
        const val CONVERSATION = "c1"
        const val KEY = "messages:$CONVERSATION"
        const val THREE_MINUTES = 180_000L
        const val T1 = "2026-06-01T10:00:00Z"
        const val T2 = "2026-06-01T11:00:00Z"
    }
}
