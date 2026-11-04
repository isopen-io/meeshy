package me.meeshy.core.database.crypto

import android.content.Context
import android.content.SharedPreferences
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.File
import java.security.KeyStoreException
import me.meeshy.core.datastore.DurableFailureGate
import me.meeshy.core.datastore.KeystoreSecureStore
import org.junit.Assert.assertThrows
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * De bout en bout, coffre réel (`KeystoreSecureStore` + [DurableFailureGate]) : un Keystore momentanément illisible au
 * démarrage ne supprime ni le coffre ni la base chiffrée ; le lancement suivant relit la même clé, base intacte.
 */
@RunWith(RobolectricTestRunner::class)
class DatabaseKeyVaultEndToEndTest {

    @get:Rule
    val folder = TemporaryFolder()

    private fun prefs(name: String): SharedPreferences =
        ApplicationProvider.getApplicationContext<Context>()
            .getSharedPreferences(name, Context.MODE_PRIVATE)
            .also { it.edit().clear().commit() }

    private val vault by lazy { prefs("e2e_db_key_vault") }
    private val ledger by lazy { prefs("e2e_db_key_vault.recovery") }
    private val failures by lazy { prefs("e2e_db_key_vault.failures") }
    private var resets = 0

    private fun launch(failure: Exception? = null) = KeystoreSecureStore(
        open = { failure?.let { throw it } ?: vault },
        reset = { resets++; vault.edit().clear().commit() },
        recoveryLedger = { ledger },
        recreation = DurableFailureGate(ledger = { failures }),
    )

    private class InertEngine : PlaintextExportEngine {
        override fun export(plain: File, target: File, passphrase: ByteArray): Unit = error("no plaintext here")
        override fun verify(source: File?, encrypted: File, passphrase: ByteArray) = true
    }

    private fun bootstrap(store: KeystoreSecureStore, events: MutableList<String>) =
        EncryptedDatabaseBootstrap(File(folder.root, "meeshy.db"), DatabaseKeyProvider(store), PlaintextDatabaseMigrator(InertEngine()), events::add)

    @Test
    fun `un coffre momentanement illisible ne purge pas la base chiffree`() {
        val key = DatabaseKeyProvider(launch()).obtain()
        val main = File(folder.root, "meeshy.db")
        val bytes = ByteArray(4096) { (it * 7 + 3).toByte() }
        main.writeBytes(bytes)
        val events = mutableListOf<String>()

        assertThrows(DatabaseKeyUnavailableException::class.java) {
            bootstrap(launch(KeyStoreException("keystore not ready")), events).prepare()
        }

        assertThat(resets).isEqualTo(0)
        assertThat(main.readBytes()).isEqualTo(bytes)
        assertThat(events).isEmpty()

        val next = bootstrap(launch(), events).prepare()

        assertThat(next.origin).isEqualTo(KeyOrigin.EXISTING)
        assertThat(next.hex()).isEqualTo(key.hex())
        assertThat(main.readBytes()).isEqualTo(bytes)
    }
}
