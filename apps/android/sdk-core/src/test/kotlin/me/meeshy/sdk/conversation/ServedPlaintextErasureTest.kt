package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.flow.flowOf
import me.meeshy.core.e2ee.render.EndToEndPlaintextOverlay
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.store.E2eePlaintextEntry
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.e2ee.PlaintextErasureLedger
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CursorPagination
import me.meeshy.sdk.model.MessagesApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.isoToEpochMillis
import me.meeshy.sdk.net.api.MessageApi
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.Response

/**
 * #14655, #14656 — ce que le SERVEUR dit parti s'inscrit dans la file durable, quel que soit le chemin, fil ouvert ou
 * non : une page qui porte une pierre tombale, une ligne que la page ne sert plus (élagage), une trame servie. Ce que CET
 * appareil supprime n'y entre qu'une fois la suppression confirmée : refusée, elle se rétablit, et le clair se relit.
 */
@RunWith(RobolectricTestRunner::class)
class ServedPlaintextErasureTest {

    private fun ledger(harness: MessageCollaboratorHarness) = PlaintextErasureLedger(harness.database, harness.clock) { "me" }

    private suspend fun PlaintextErasureLedger.keys(): List<String> = pending("me", 100).flatMap { it.messageKeys("me") }

    private fun sealed(id: String, author: String, cid: String? = null, at: String = "2026-11-01T09:00:00Z") = ApiMessage(
        id = id, conversationId = "c1", senderId = "p_$author", sender = ApiMessageSender(userId = author),
        content = "[Encrypted]", isEncrypted = true, encryptionMode = "e2ee", clientMessageId = cid, createdAt = at,
    )

    /** A server holding exactly [messages]: the recent window serves them all, the forward sweep those after its cursor. */
    private fun pageServing(vararg messages: ApiMessage): MessageApi = mockk<MessageApi>().also { api ->
        coEvery { api.listConditional("c1", any()) } returns Response.success(ApiResponse(success = true, data = messages.toList()))
        coEvery { api.list("c1", any(), any(), any()) } returns ApiResponse(success = true, data = emptyList())
        coEvery { api.listAfter("c1", any(), any()) } answers {
            val after = isoToEpochMillis(secondArg<String>())
            MessagesApiResponse(
                success = true,
                data = messages.filter { isoToEpochMillis(it.createdAt) > after },
                cursorPagination = CursorPagination(hasMore = false),
            )
        }
    }

    private fun source(harness: MessageCollaboratorHarness, api: MessageApi, erasures: PlaintextErasureLedger) = MessageCacheSource(
        "c1", harness.database, harness.database.messageDao(), harness.database.syncMetaDao(), api, harness.clock, flowOf(HistoryWindow.Recent(50)),
        erasures = erasures,
    )

    @Test
    fun `a page serving the tombstone of my sealed message records both its keys`() = runHarnessTest { harness ->
        val erasures = ledger(harness)

        source(harness, pageServing(sealed("m1", "me", cid = "cid_1").copy(deletedAt = "2026-11-01T10:00:00Z")), erasures).revalidate()

        assertThat(erasures.keys()).containsExactly("m1", "cid_1")
    }

    @Test
    fun `a sealed row the newest page no longer serves is recorded as it is pruned, a served one is not`() = runHarnessTest { harness ->
        harness.seedSynced(sealed("m1", "alice", at = "2026-11-01T09:00:00Z"))
        harness.seedSynced(sealed("m2", "alice", at = "2026-11-01T09:05:00Z"))
        harness.seedSynced(sealed("m3", "me", cid = "cid_3", at = "2026-11-01T09:10:00Z"))
        val erasures = ledger(harness)

        source(
            harness,
            pageServing(sealed("m1", "alice", at = "2026-11-01T09:00:00Z"), sealed("m4", "alice", at = "2026-11-01T09:20:00Z")),
            erasures,
        ).revalidate()

        assertThat(harness.database.messageDao().find("m2")).isNull()
        assertThat(erasures.keys()).containsExactly("m2", "m3", "cid_3")
    }

    /**
     * #18915 — the page was built before these two arrived through the socket: their absence proves nothing, so they are
     * neither pruned nor recorded. The plaintext of my own message stays readable — the vault is its only copy.
     */
    @Test
    fun `a sealed message that arrived while the page was in flight is neither pruned nor recorded as erased`() = runHarnessTest { harness ->
        harness.seedSynced(sealed("m1", "alice", at = "2026-11-01T09:00:00Z"))
        val erasures = ledger(harness)
        val api = mockk<MessageApi>().also { api ->
            coEvery { api.listAfter(any(), any(), any()) } throws IOException("offline")
            coEvery { api.listConditional("c1", any()) } coAnswers {
                MessageIngestPipeline(harness.database).ingest(
                    listOf(sealed("m2", "alice", at = "2026-11-01T09:10:00Z"), sealed("m3", "me", cid = "cid_3", at = "2026-11-01T09:11:00Z")),
                    harness.clock.now,
                )
                Response.success(ApiResponse(success = true, data = listOf(sealed("m1", "alice", at = "2026-11-01T09:00:00Z"))))
            }
        }

        source(harness, api, erasures).revalidate()

        assertThat(harness.database.messageDao().find("m2")).isNotNull()
        assertThat(harness.database.messageDao().find("m3")).isNotNull()
        assertThat(erasures.keys()).isEmpty()
    }

    /**
     * #18915 (M4) — an empty page says the conversation no longer serves any of the rows held before it: they are pruned,
     * and the plaintext of each sealed one leaves the vault with its row instead of surviving it.
     */
    @Test
    fun `an empty page records the erasure of the sealed rows held before it`() = runHarnessTest { harness ->
        harness.seedSynced(sealed("m1", "alice", at = "2026-11-01T09:00:00Z"))
        harness.seedSynced(sealed("m2", "me", cid = "cid_2", at = "2026-11-01T09:05:00Z"))
        val erasures = ledger(harness)

        source(harness, pageServing(), erasures).revalidate()

        assertThat(harness.database.messageDao().find("m2")).isNull()
        assertThat(erasures.keys()).containsExactly("m1", "m2", "cid_2")
    }

    /**
     * #18915 (M4) — the deleted message was the NEWEST one held (its `message:deleted` was missed): newer than everything
     * the page serves, it used to lose its row and keep its plaintext in the vault.
     */
    @Test
    fun `the newest sealed message the page no longer serves leaves the vault with its row`() = runHarnessTest { harness ->
        harness.seedSynced(sealed("m1", "alice", at = "2026-11-01T09:00:00Z"))
        harness.seedSynced(sealed("m2", "me", cid = "cid_2", at = "2026-11-01T09:10:00Z"))
        val erasures = ledger(harness)

        source(harness, pageServing(sealed("m1", "alice", at = "2026-11-01T09:00:00Z")), erasures).revalidate()

        assertThat(harness.database.messageDao().find("m2")).isNull()
        assertThat(erasures.keys()).containsExactly("m2", "cid_2")
    }

    /**
     * #18915 (R4) — a served date that cannot be read proves nothing about what the page covers: it used to count as 0,
     * so the prune span took in everything held, and every sealed row the page did not serve lost its row and recorded
     * its plaintext as erased. Such a page prunes nothing and records nothing (fail-closed).
     */
    @Test
    fun `a page with an unreadable date prunes nothing and records no erasure`() = runHarnessTest { harness ->
        harness.seedSynced(sealed("m1", "alice", at = "2026-11-01T09:00:00Z"))
        harness.seedSynced(sealed("m2", "me", cid = "cid_2", at = "2026-11-01T09:05:00Z"))
        val erasures = ledger(harness)

        source(
            harness,
            pageServing(sealed("m3", "alice", at = "not-a-date"), sealed("m4", "alice", at = "2026-11-01T09:20:00Z")),
            erasures,
        ).revalidate()

        assertThat(harness.database.messageDao().find("m1")).isNotNull()
        assertThat(harness.database.messageDao().find("m2")).isNotNull()
        assertThat(erasures.keys()).isEmpty()
    }

    /** [pageServing], the recent window saying whether older messages remain behind it (`pagination.hasMore`), under [limit]. */
    private fun windowServing(hasMore: Boolean?, vararg messages: ApiMessage, limit: Int = 20): MessageApi =
        windowPaginated(hasMore?.let { Pagination(total = messages.size, offset = 0, limit = limit, hasMore = it) }, *messages)

    private fun windowPaginated(pagination: Pagination?, vararg messages: ApiMessage): MessageApi = pageServing(*messages).also { api ->
        coEvery { api.listConditional("c1", any()) } returns
            Response.success(ApiResponse(success = true, data = messages.toList(), pagination = pagination))
    }

    private suspend fun MessageCollaboratorHarness.holdOlderThanTheWindow() =
        seedSynced(sealed("m0", "me", cid = "cid_0", at = "2026-11-01T08:00:00Z"))

    private fun theWholeHistory(hasMore: Boolean?, limit: Int = 20) = windowServing(
        hasMore,
        sealed("m1", "alice", at = "2026-11-01T09:00:00Z"),
        sealed("m2", "alice", at = "2026-11-01T09:10:00Z"),
        sealed("m3", "alice", at = "2026-11-01T09:20:00Z"),
        limit = limit,
    )

    /**
     * #19423 (A8) — the recent window serves EVERY message of the thread (`hasMore == false`): a message held older than its
     * oldest no longer exists on the server. The prune used to stop at the oldest served, and kept that row and its plaintext.
     */
    @Test
    fun `a window serving the whole history takes the older held sealed row and its plaintext with it`() = runHarnessTest { harness ->
        harness.holdOlderThanTheWindow()
        val erasures = ledger(harness)

        source(harness, theWholeHistory(hasMore = false), erasures).revalidate()

        assertThat(harness.database.messageDao().find("m0")).isNull()
        assertThat(harness.database.messageDao().find("m1")).isNotNull()
        assertThat(erasures.keys()).containsExactly("m0", "cid_0")
    }

    /**
     * #19423 — the page's counts say « nothing older » (19 counted, 19 served, under its limit) yet the read was cut: the
     * gateway withdrew a due ephemeral message from the page it had counted. The confirming read before the oldest served
     * finds the live older message, and the held row keeps its plaintext.
     */
    @Test
    fun `a window whose counts claim the whole history keeps the older held row when a read before it finds one`() = runHarnessTest { harness ->
        harness.holdOlderThanTheWindow()
        val erasures = ledger(harness)
        val api = theWholeHistory(hasMore = false)
        coEvery { api.list("c1", any(), any(), "m1") } returns
            ApiResponse(success = true, data = listOf(sealed("m0", "me", cid = "cid_0", at = "2026-11-01T08:00:00Z")))

        source(harness, api, erasures).revalidate()

        assertThat(harness.database.messageDao().find("m0")).isNotNull()
        assertThat(erasures.keys()).isEmpty()
    }

    @Test
    fun `a window whose confirming read fails keeps the older held row (fail-closed)`() = runHarnessTest { harness ->
        harness.holdOlderThanTheWindow()
        val erasures = ledger(harness)
        val api = theWholeHistory(hasMore = false)
        coEvery { api.list("c1", any(), any(), any()) } throws java.io.IOException("offline")

        source(harness, api, erasures).revalidate()

        assertThat(harness.database.messageDao().find("m0")).isNotNull()
        assertThat(erasures.keys()).isEmpty()
    }

    @Test
    fun `a window with older messages behind it keeps the older held row, alive beyond its limit`() = runHarnessTest { harness ->
        harness.holdOlderThanTheWindow()
        val erasures = ledger(harness)

        source(harness, theWholeHistory(hasMore = true), erasures).revalidate()

        assertThat(harness.database.messageDao().find("m0")).isNotNull()
        assertThat(erasures.keys()).isEmpty()
    }

    /**
     * #19423 — the gateway counts `total` and reads the page in two queries that share no snapshot: a message written
     * between them lets a FULL page (its `limit` reached) claim `hasMore == false` while an older message still exists
     * behind it. Only a page shorter than its limit proves, by its own read, that nothing older remains.
     */
    @Test
    fun `a full window claiming no older message keeps the older held row and its plaintext`() = runHarnessTest { harness ->
        harness.holdOlderThanTheWindow()
        val erasures = ledger(harness)

        source(harness, theWholeHistory(hasMore = false, limit = 3), erasures).revalidate()

        assertThat(harness.database.messageDao().find("m0")).isNotNull()
        assertThat(erasures.keys()).isEmpty()
    }

    @Test
    fun `a window that does not say whether older messages remain keeps the older held row (fail-closed)`() = runHarnessTest { harness ->
        harness.holdOlderThanTheWindow()
        val erasures = ledger(harness)

        source(harness, theWholeHistory(hasMore = null), erasures).revalidate()

        assertThat(harness.database.messageDao().find("m0")).isNotNull()
        assertThat(erasures.keys()).isEmpty()
    }

    /**
     * #19423 — `hasMore` DECODES to `false` when the pagination leaves it out: a pagination that counts more messages than
     * the page serves (`total` 5, three served) proves that older ones remain, whatever it fails to say. Only a page that
     * serves its own `total` proves the whole history.
     */
    @Test
    fun `a window counting more messages than it serves keeps the older held row, its hasMore left out`() = runHarnessTest { harness ->
        harness.holdOlderThanTheWindow()
        val erasures = ledger(harness)
        val api = windowPaginated(
            Pagination(total = 5, offset = 0, limit = 20),
            sealed("m1", "alice", at = "2026-11-01T09:00:00Z"),
            sealed("m2", "alice", at = "2026-11-01T09:10:00Z"),
            sealed("m3", "alice", at = "2026-11-01T09:20:00Z"),
        )

        source(harness, api, erasures).revalidate()

        assertThat(harness.database.messageDao().find("m0")).isNotNull()
        assertThat(erasures.keys()).isEmpty()
    }

    @Test
    fun `a bubble replaced by its server twin is not an erasure`() = runHarnessTest { harness ->
        harness.database.messageDao().upsertAll(
            listOf(MessageEntityFactory.cached(sealed("cid_9", "me", cid = "cid_9"), harness.clock.now)),
        )
        val erasures = ledger(harness)

        source(harness, pageServing(sealed("m9", "me", cid = "cid_9")), erasures).revalidate()

        assertThat(erasures.keys()).isEmpty()
    }

    /**
     * #18915 (F8) — re-reading ONE message by its id is the way back of the gestures the server refused for good: what it
     * serves there is ingested like a page, so a sealed view-once message it serves as opened by me leaves the vault too.
     */
    @Test
    fun `a sealed message re-read by its id and served as an opened view-once records its erasure`() = runHarnessTest { harness ->
        harness.seedSynced(sealed("m1", "alice").copy(isViewOnce = true))
        val erasures = ledger(harness)
        val api = mockk<MessageApi>().also { api ->
            coEvery { api.listAround("c1", "m1", 1) } returns
                ApiResponse(success = true, data = listOf(sealed("m1", "alice").copy(isViewOnce = true, consumedByMe = true)))
        }
        val repository = MessageRepository(
            api, mockk(relaxed = true), harness.database, harness.database.messageDao(), harness.database.syncMetaDao(),
            harness.outbox, harness.clock, regime = EndToEndRegimeKeeper(EndToEndRegimeLedger.None, harness.database),
            erasures = erasures,
        )

        val merged = repository.refreshMessage("c1", "m1")

        assertThat(merged).isTrue()
        assertThat(erasures.keys()).containsExactly("m1")
    }

    @Test
    fun `a page in clear records nothing`() = runHarnessTest { harness ->
        harness.seedSynced(ApiMessage(id = "m1", conversationId = "c1", content = "clair", senderId = "me", createdAt = "2026-11-01T09:00:00Z"))
        val erasures = ledger(harness)

        source(harness, pageServing(ApiMessage(id = "m2", conversationId = "c1", content = "x", deletedAt = "2026-11-01T10:00:00Z", createdAt = "2026-11-01T09:30:00Z")), erasures).revalidate()

        assertThat(erasures.keys()).isEmpty()
    }

    @Test
    fun `a deletion refused by the server leaves the plaintext in place, and it reads again`() = runHarnessTest { harness ->
        val mine = sealed("m1", "me", cid = "cid_1")
        harness.seedSynced(mine)
        val erasures = ledger(harness)
        val writer = MessageMutationWriter(harness.updater, harness.outbox, harness.clock)
        val vault = mapOf("m1" to E2eePlaintextEntry.Readable(E2eeContent.compose("Bonjour", "fr", null, "c1", "cid_1", 1L), "me"))

        writer.deleteOptimistic("m1")
        val tombstone = harness.cachedMessage("m1")
        assertThat(EndToEndPlaintextOverlay.erasableKeys(tombstone, "me", harness.clock.now)).isEmpty()
        assertThat(erasures.keys()).isEmpty()

        writer.markUndeleted("m1")

        assertThat(EndToEndPlaintextOverlay.apply(harness.cachedMessage("m1"), vault, "c1", "me").content).isEqualTo("Bonjour")
    }
}
