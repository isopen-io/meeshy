package me.meeshy.sdk.model.contacts

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

class ContactSyncBatchingTest {

    private fun entries(count: Int) = List(count) { ContactMatchEntry(displayName = "c$it", phoneNumbers = listOf("+33$it")) }

    private class Server(private val token: String? = "T0", private val removedOnFinal: Int = 7) {
        val seen = mutableListOf<DirectorySyncRequest>()
        suspend fun handle(r: DirectorySyncRequest): DirectorySyncResult {
            seen += r
            val final = r.isFinalBatch == true
            return DirectorySyncResult(
                totalContacts = r.contacts.size,
                processedContacts = r.contacts.size,
                syncedCount = r.contacts.size - 1,
                matchedCount = 1,
                removedCount = if (final) removedOnFinal else 0,
                syncStartedAt = token,
            )
        }
    }

    private suspend fun run(n: Int, mode: DirectorySyncMode, server: Server): DirectorySyncResult =
        ContactSyncBatching.sync(entries(n), mode, "FR", send = server::handle)

    @Test fun `empty book sends one empty final batch`() = runTest {
        val s = Server()
        run(0, DirectorySyncMode.Replace, s)
        assertThat(s.seen).hasSize(1)
        assertThat(s.seen[0].contacts).isEmpty()
        assertThat(s.seen[0].isFinalBatch).isTrue()
    }

    @Test fun `one contact keeps the requested mode`() = runTest {
        val s = Server()
        run(1, DirectorySyncMode.Replace, s)
        assertThat(s.seen.single().mode).isEqualTo(DirectorySyncMode.Replace)
    }

    @Test fun `exactly 2000 is a single batch`() = runTest {
        val s = Server()
        run(2000, DirectorySyncMode.Replace, s)
        assertThat(s.seen).hasSize(1)
        assertThat(s.seen[0].mode).isEqualTo(DirectorySyncMode.Replace)
    }

    @Test fun `2001 splits in two and forces merge`() = runTest {
        val s = Server()
        run(2001, DirectorySyncMode.Replace, s)
        assertThat(s.seen.map { it.contacts.size }).containsExactly(2000, 1).inOrder()
        assertThat(s.seen.map { it.mode }).containsExactly(DirectorySyncMode.Merge, DirectorySyncMode.Merge)
    }

    @Test fun `4500 makes three batches, token repeated, final only on last`() = runTest {
        val s = Server()
        val result = run(4500, DirectorySyncMode.Replace, s)
        assertThat(s.seen.map { it.contacts.size }).containsExactly(2000, 2000, 500).inOrder()
        assertThat(s.seen.map { it.syncStartedAt }).containsExactly(null, "T0", "T0").inOrder()
        assertThat(s.seen.map { it.isFinalBatch }).containsExactly(null, null, true).inOrder()
        assertThat(result.totalContacts).isEqualTo(4500)
        assertThat(result.processedContacts).isEqualTo(4500)
        assertThat(result.syncedCount).isEqualTo(4497)
        assertThat(result.matchedCount).isEqualTo(3)
        assertThat(result.removedCount).isEqualTo(7)
        assertThat(result.syncStartedAt).isEqualTo("T0")
    }

    @Test fun `merge never marks a final batch`() = runTest {
        val s = Server()
        run(4500, DirectorySyncMode.Merge, s)
        assertThat(s.seen.all { it.isFinalBatch == null }).isTrue()
    }

    @Test fun `gateway without token falls back to a single merge shot when contacts remain unsent`() = runTest {
        val s = Server(token = null)
        run(4500, DirectorySyncMode.Replace, s)
        assertThat(s.seen).hasSize(2)
        assertThat(s.seen[1].contacts).hasSize(2000)
        assertThat(s.seen[1].mode).isEqualTo(DirectorySyncMode.Merge)
        assertThat(s.seen[1].isFinalBatch).isNull()
    }

    @Test fun `single batch against a gateway without token returns the counts as is`() = runTest {
        val s = Server(token = null)
        val result = run(10, DirectorySyncMode.Replace, s)
        assertThat(s.seen).hasSize(1)
        assertThat(result.syncStartedAt).isNull()
        assertThat(result.totalContacts).isEqualTo(10)
    }
}
