package me.meeshy.core.e2ee.store

import com.google.common.truth.Truth.assertThat
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.vault.InMemoryRecordBackend
import me.meeshy.core.e2ee.vault.RecordKind
import me.meeshy.core.e2ee.vault.TransactionalRecordVault
import org.junit.Test

/** Audit de #19077, P5 — une ligne du coffre qui ne se relit pas ne masque que SON message : le fil montre tous les autres. */
class E2eePlaintextVaultEntriesTest {

    @Test
    fun oneRowThatDoesNotRead_hidesOnlyItsOwnMessage() {
        val records = TransactionalRecordVault(InMemoryRecordBackend())
        val vault = E2eePlaintextVault(records, owner = null)
        val content = E2eeContent.compose("bonjour", "fr", null, "64f0c0ffee000000000c0001", null, sentAtMillis = 1L)
        vault.save(E2eePlaintextEntry.Readable(content, "64f0c0ffee0000000000aaaa"), listOf("m1"))
        records.write { it.save(RecordKind.PLAINTEXT, "m2", "{not json".toByteArray()) }

        val entries = vault.entries(listOf("m1", "m2"))

        assertThat(entries.keys).containsExactly("m1")
        assertThat((entries.getValue("m1") as E2eePlaintextEntry.Readable).content.text).isEqualTo("bonjour")
    }
}
