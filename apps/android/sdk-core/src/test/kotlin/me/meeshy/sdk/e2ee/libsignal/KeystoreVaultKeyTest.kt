package me.meeshy.sdk.e2ee.libsignal

import android.security.keystore.KeyPermanentlyInvalidatedException
import com.google.common.truth.Truth.assertThat
import java.io.File
import java.nio.file.Files
import java.security.ProviderException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import me.meeshy.core.e2ee.vault.InMemoryRecordBackend
import me.meeshy.core.e2ee.vault.RecordVault
import me.meeshy.core.e2ee.vault.TransactionalRecordVault
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #14634 — la clé du coffre E2EE ne se retire que si la clé maîtresse du Keystore est ABSENTE ou INVALIDÉE pour de bon.
 * Une erreur passagère du Keystore (service occupé, appareil encore verrouillé, défaut du fournisseur) fait échouer
 * l'ouverture SANS rien effacer : ni la clé enveloppée, ni la base, ni l'identité libsignal qu'elle protège.
 */
@RunWith(RobolectricTestRunner::class)
class KeystoreVaultKeyTest {

    /** Une clé maîtresse logicielle, que le témoin peut faire échouer à volonté. */
    private class FakeMaster : VaultKeyWrapper {
        var master: SecretKey? = null
        var failure: Exception? = null
        var discarded = 0

        override fun unwrap(blob: ByteArray): ByteArray? {
            failure?.let { throw it }
            val key = master ?: return null
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, blob, 0, 12))
            return cipher.doFinal(blob, 12, blob.size - 12)
        }

        override fun wrap(raw: ByteArray): ByteArray {
            val key = master ?: KeyGenerator.getInstance("AES").apply { init(256) }.generateKey().also { master = it }
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key)
            return cipher.iv + cipher.doFinal(raw)
        }

        override fun discard() {
            discarded++
            master = null
        }
    }

    private fun directory(): File = Files.createTempDirectory("e2ee-vault").toFile()

    @Test
    fun `a first opening draws a fresh key, the next one reads it back`() {
        val dir = directory()
        val master = FakeMaster()

        val first = KeystoreVaultKey(dir, master).open()
        val second = KeystoreVaultKey(dir, master).open()

        assertThat(first.fresh).isTrue()
        assertThat(second.fresh).isFalse()
        assertThat(second.key.encoded).isEqualTo(first.key.encoded)
    }

    @Test
    fun `a transient keystore error fails the opening and keeps the wrapped key`() {
        val dir = directory()
        val master = FakeMaster()
        val first = KeystoreVaultKey(dir, master).open()
        val wrapped = File(dir, "vault.key").readBytes()

        master.failure = ProviderException("keystore busy")
        assertThrows(E2eeVaultLockedException::class.java) { KeystoreVaultKey(dir, master).open() }

        assertThat(File(dir, "vault.key").readBytes()).isEqualTo(wrapped)
        assertThat(master.discarded).isEqualTo(0)
        master.failure = null
        assertThat(KeystoreVaultKey(dir, master).open().key.encoded).isEqualTo(first.key.encoded)
    }

    @Test
    fun `a wrapped key the master cannot open is never replaced`() {
        val dir = directory()
        val master = FakeMaster()
        KeystoreVaultKey(dir, master).open()
        master.master = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()

        assertThrows(E2eeVaultLockedException::class.java) { KeystoreVaultKey(dir, master).open() }
    }

    @Test
    fun `an absent master key starts a new vault`() {
        val dir = directory()
        val master = FakeMaster()
        KeystoreVaultKey(dir, master).open()
        master.master = null

        assertThat(KeystoreVaultKey(dir, master).open().fresh).isTrue()
    }

    @Test
    fun `a new key interrupted before taking its name never locks the vault for good`() {
        val dir = directory()
        val master = FakeMaster()
        KeystoreVaultKey(dir, master).open()
        master.master = null
        val killedAfterNewMaster = object : VaultKeyWrapper by master {
            override fun wrap(raw: ByteArray): ByteArray {
                master.wrap(raw)
                throw IllegalStateException("process killed before the wrapped key took its name")
            }
        }
        assertThrows(IllegalStateException::class.java) { KeystoreVaultKey(dir, killedAfterNewMaster).open() }

        assertThat(KeystoreVaultKey(dir, master).open().fresh).isTrue()
    }

    @Test
    fun `a permanently invalidated master key is discarded and starts a new vault`() {
        val dir = directory()
        val master = FakeMaster()
        KeystoreVaultKey(dir, master).open()
        master.failure = KeyPermanentlyInvalidatedException()

        val reopened = KeystoreVaultKey(dir, object : VaultKeyWrapper by master {
            override fun wrap(raw: ByteArray): ByteArray {
                master.failure = null
                return master.wrap(raw)
            }
        }).open()

        assertThat(reopened.fresh).isTrue()
        assertThat(master.discarded).isEqualTo(1)
    }

    @Test
    fun `a locked vault is neither wiped nor replaced by a memory vault`() {
        var wiped = 0
        var memory = 0
        assertThrows(E2eeVaultLockedException::class.java) {
            EndToEndVaultOpening.open(
                key = { throw E2eeVaultLockedException(ProviderException("busy")) },
                wipe = { wiped++ },
                sealed = { error("never reached") },
                memory = { memory++; TransactionalRecordVault(InMemoryRecordBackend()) },
            )
        }
        assertThat(wiped).isEqualTo(0)
        assertThat(memory).isEqualTo(0)
    }

    @Test
    fun `a fresh key wipes the unreadable database before opening`() {
        val calls = mutableListOf<String>()
        val vault: RecordVault = EndToEndVaultOpening.open(
            key = { KeystoreVaultKey.Opened(KeyGenerator.getInstance("AES").apply { init(256) }.generateKey(), fresh = true) },
            wipe = { calls += "wipe" },
            sealed = { calls += "open"; TransactionalRecordVault(InMemoryRecordBackend()) },
            memory = { error("never reached") },
        )
        assertThat(vault).isNotNull()
        assertThat(calls).containsExactly("wipe", "open").inOrder()
    }
}
