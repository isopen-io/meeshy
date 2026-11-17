package me.meeshy.core.e2ee.store

import com.google.common.truth.Truth.assertThat
import java.io.IOException
import kotlinx.coroutines.test.runTest
import me.meeshy.core.e2ee.content.E2eeContent
import me.meeshy.core.e2ee.vault.InMemoryRecordBackend
import me.meeshy.core.e2ee.vault.RecordKind
import me.meeshy.core.e2ee.vault.TransactionalRecordVault
import org.junit.Test

/**
 * #18975 (AND-02), audit de #19077 P9 — le clair d'un message que J'AI écrit se range au coffre LOCAL : un appareil déjà
 * enrôlé pour ce compte le garde sans rien demander au réseau (annuaire injoignable compris) ; un appareil qui ne l'est pas
 * encore se prépare d'abord, et ne garde rien s'il ne le peut pas.
 */
class E2eePlaintextVaultKeepMineTest {
    private val alice = "64f0c0ffee0000000000aaaa"
    private val content = E2eeContent.compose("rendez-vous à 8 h", "fr", null, "64f0c0ffee000000000c0001", "cid_1", sentAtMillis = 1L)

    @Test
    fun anEnrolledDevice_keepsMyPlaintext_withoutPreparingAgain_evenWhenTheDirectoryIsUnreachable() = runTest {
        val records = TransactionalRecordVault(InMemoryRecordBackend())
        records.write { E2eeEnrollmentRecords.save(E2eeLocalDevice(alice, 1, 4242), it) }
        val vault = E2eePlaintextVault(records, owner = alice)
        var preparations = 0

        vault.keepMine(alice, content, listOf("cid_1")) {
            preparations++
            throw IOException("directory unreachable")
        }

        assertThat(preparations).isEqualTo(0)
        assertThat((vault.entry("cid_1") as E2eePlaintextEntry.Readable).content.text).isEqualTo("rendez-vous à 8 h")
    }

    @Test
    fun aDeviceNotYetEnrolled_preparesFirst_andKeepsNothingWhenItCannot() = runTest {
        val records = TransactionalRecordVault(InMemoryRecordBackend())
        val vault = E2eePlaintextVault(records, owner = alice)

        val kept = runCatching { vault.keepMine(alice, content, listOf("cid_1")) { throw IOException("directory unreachable") } }

        assertThat(kept.exceptionOrNull()).isInstanceOf(IOException::class.java)
        assertThat(records.read { it.load(RecordKind.PLAINTEXT, "cid_1") }).isNull()
    }
}
