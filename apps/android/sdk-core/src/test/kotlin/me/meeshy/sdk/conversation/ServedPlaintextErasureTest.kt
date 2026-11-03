package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.flow.flowOf
import me.meeshy.core.e2ee.render.EndToEndPlaintextOverlay
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.store.E2eePlaintextEntry
import me.meeshy.sdk.e2ee.PlaintextErasureLedger
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.ApiResponse
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

    private fun pageServing(vararg messages: ApiMessage): MessageApi = mockk<MessageApi>().also { api ->
        coEvery { api.listAfter(any(), any(), any()) } throws IOException("offline")
        coEvery { api.listConditional("c1", any()) } returns Response.success(ApiResponse(success = true, data = messages.toList()))
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

    @Test
    fun `a sealed message newer than the page, arrived while it was in flight, is never recorded as erased`() = runHarnessTest { harness ->
        harness.seedSynced(sealed("m1", "alice", at = "2026-11-01T09:00:00Z"))
        harness.seedSynced(sealed("m2", "alice", at = "2026-11-01T09:10:00Z"))
        harness.seedSynced(sealed("m3", "me", cid = "cid_3", at = "2026-11-01T09:11:00Z"))
        val erasures = ledger(harness)

        source(harness, pageServing(sealed("m1", "alice", at = "2026-11-01T09:00:00Z")), erasures).revalidate()

        assertThat(erasures.keys()).isEmpty()
    }

    @Test
    fun `an empty page records nothing, the sealed rows it prunes may have arrived after it was built`() = runHarnessTest { harness ->
        harness.seedSynced(sealed("m1", "alice", at = "2026-11-01T09:00:00Z"))
        val erasures = ledger(harness)

        source(harness, pageServing(), erasures).revalidate()

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
