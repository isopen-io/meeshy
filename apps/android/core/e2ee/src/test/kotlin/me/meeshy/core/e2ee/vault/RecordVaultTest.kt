package me.meeshy.core.e2ee.vault

import com.google.common.truth.Truth.assertThat
import javax.crypto.spec.SecretKeySpec
import me.meeshy.core.e2ee.store.E2eeIdentityRecords
import org.junit.Assert.assertThrows
import org.junit.Test

class RecordVaultTest {
    private fun key(seed: Int) = SecretKeySpec(ByteArray(32) { (it + seed).toByte() }, "AES")

    @Test
    fun aFailedTransaction_writesNothing_soTheRatchetNeverAdvancesWithoutItsPlaintext() {
        val backend = InMemoryRecordBackend()
        val vault = TransactionalRecordVault(backend)

        runCatching {
            vault.write { tx ->
                tx.save(RecordKind.SESSION, "bob.1", byteArrayOf(1))
                error("plaintext could not be stored")
            }
        }

        assertThat(backend.snapshot()).isEmpty()
    }

    @Test
    fun aTransactionReadsItsOwnWrites_andRemovals() {
        val vault = TransactionalRecordVault(InMemoryRecordBackend())
        vault.write { it.save(RecordKind.PRE_KEY, "1", byteArrayOf(1)) }

        vault.write { tx ->
            tx.remove(RecordKind.PRE_KEY, "1")
            tx.save(RecordKind.PRE_KEY, "2", byteArrayOf(2))
            assertThat(tx.load(RecordKind.PRE_KEY, "1")).isNull()
            assertThat(tx.keys(RecordKind.PRE_KEY)).containsExactly("2")
        }
        assertThat(vault.read { it.keys(RecordKind.PRE_KEY) }).containsExactly("2")
    }

    @Test
    fun removeAll_wipesEverything_includingTheIdentity() {
        val vault = TransactionalRecordVault(InMemoryRecordBackend())
        E2eeIdentityRecords.currentOrCreate(vault)

        vault.write { it.removeAll() }

        assertThat(vault.read(E2eeIdentityRecords::load)).isNull()
    }

    @Test
    fun noRecordReachesTheDiskInClear() {
        val raw = InMemoryRecordBackend()
        val vault = TransactionalRecordVault(SealedRecordBackend(raw, RecordSealer(key(0))))
        val secret = "cle-privee-d-identite".toByteArray()

        vault.write { it.save(RecordKind.IDENTITY, "current", secret) }

        val stored = raw.snapshot().values.single()
        assertThat(String(stored, Charsets.ISO_8859_1)).doesNotContain("cle-privee")
        assertThat(vault.read { it.load(RecordKind.IDENTITY, "current") }).isEqualTo(secret)
    }

    @Test
    fun aRecordMovedUnderAnotherKey_orOpenedWithAnotherKey_doesNotOpen() {
        val sealer = RecordSealer(key(0))
        val sealed = sealer.seal(RecordId(RecordKind.PLAINTEXT, "m1"), "bonjour".toByteArray())

        assertThrows(SealedRecordException::class.java) { sealer.open(RecordId(RecordKind.PLAINTEXT, "m2"), sealed) }
        assertThrows(SealedRecordException::class.java) { RecordSealer(key(1)).open(RecordId(RecordKind.PLAINTEXT, "m1"), sealed) }
        sealed[sealed.size - 1] = (sealed.last().toInt() xor 1).toByte()
        assertThrows(SealedRecordException::class.java) { sealer.open(RecordId(RecordKind.PLAINTEXT, "m1"), sealed) }
    }

    @Test
    fun theIdentityRecord_keepsTheIosKeychainLayout_andRoundTrips() {
        val vault = TransactionalRecordVault(InMemoryRecordBackend())
        val created = E2eeIdentityRecords.currentOrCreate(vault)

        val raw = vault.read { it.load(RecordKind.IDENTITY, "current") }!!
        val again = E2eeIdentityRecords.currentOrCreate(vault)

        assertThat(((raw[0].toInt() and 0xFF) shl 8) or (raw[1].toInt() and 0xFF)).isEqualTo(created.registrationId)
        assertThat(created.registrationId).isIn(1..0x3FFF)
        assertThat(again.keyPair.serialize()).isEqualTo(created.keyPair.serialize())
    }
}
