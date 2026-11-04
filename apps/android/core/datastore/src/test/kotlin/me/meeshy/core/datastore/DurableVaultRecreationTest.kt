package me.meeshy.core.datastore

import android.content.Context
import android.content.SharedPreferences
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.security.GeneralSecurityException
import java.security.KeyStoreException
import javax.crypto.AEADBadTagException
import me.meeshy.sdk.model.security.SecureRead
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Le coffre de la clé de base : un échec passager ne supprime jamais le fichier, seul un échec durable prouvé le fait. */
@RunWith(RobolectricTestRunner::class)
class DurableVaultRecreationTest {

    private fun prefs(name: String): SharedPreferences =
        ApplicationProvider.getApplicationContext<Context>()
            .getSharedPreferences(name, Context.MODE_PRIVATE)
            .also { it.edit().clear().commit() }

    private class Launches(private val healthy: SharedPreferences, private val failures: SharedPreferences) {
        var resets = 0

        /** Un lancement : un process neuf dont l'ouverture lève [failure], ou réussit si [failure] est nul. */
        fun launch(failure: Exception?): KeystoreSecureStore = KeystoreSecureStore(
            open = { failure?.let { throw it } ?: healthy },
            reset = { resets++ },
            recreation = DurableFailureGate(ledger = { failures }),
        )
    }

    @Test
    fun `un echec passager du Keystore ne supprime pas le coffre et la cle se relit au lancement suivant`() {
        val launches = Launches(prefs("db_vault_transient"), prefs("db_vault_transient.failures"))
        assertThat(launches.launch(null).put("database.passphrase", "k", "meeshy.database")).isTrue()

        val failing = launches.launch(KeyStoreException("keystore not ready"))

        assertThat(failing.read("database.passphrase", "meeshy.database")).isEqualTo(SecureRead.Unreadable)
        assertThat(failing.put("database.passphrase", "autre", "meeshy.database")).isFalse()
        assertThat(launches.resets).isEqualTo(0)
        assertThat(launches.launch(null).read("database.passphrase", "meeshy.database")).isEqualTo(SecureRead.Present("k"))
    }

    @Test
    fun `un echec passager repete ne prouve jamais la perte`() {
        val launches = Launches(prefs("db_vault_repeat"), prefs("db_vault_repeat.failures"))

        repeat(DurableFailureGate.DEFAULT_LAUNCHES + 2) {
            launches.launch(GeneralSecurityException("keystore")).read("k", "A")
        }

        assertThat(launches.resets).isEqualTo(0)
    }

    @Test
    fun `un tag invalide n'est une perte qu'apres plusieurs lancements consecutifs`() {
        val launches = Launches(prefs("db_vault_badtag"), prefs("db_vault_badtag.failures"))
        val badTag = GeneralSecurityException("open", AEADBadTagException("tag mismatch"))

        repeat(DurableFailureGate.DEFAULT_LAUNCHES - 1) {
            assertThat(launches.launch(badTag).read("k", "A")).isEqualTo(SecureRead.Unreadable)
        }
        assertThat(launches.resets).isEqualTo(0)

        launches.launch(badTag).read("k", "A")

        assertThat(launches.resets).isEqualTo(1)
    }

    @Test
    fun `un lancement qui ouvre le coffre remet le decompte a zero`() {
        val launches = Launches(prefs("db_vault_reset"), prefs("db_vault_reset.failures"))
        val badTag = AEADBadTagException("tag mismatch")

        repeat(DurableFailureGate.DEFAULT_LAUNCHES - 1) { launches.launch(badTag).read("k", "A") }
        launches.launch(null).read("k", "A")
        repeat(DurableFailureGate.DEFAULT_LAUNCHES - 1) { launches.launch(badTag).read("k", "A") }

        assertThat(launches.resets).isEqualTo(0)
    }

    @Test
    fun `un decompte qui ne s'ecrit pas ne prouve rien et ne supprime rien`() {
        var resets = 0
        val store = KeystoreSecureStore(
            open = { throw AEADBadTagException("tag mismatch") },
            reset = { resets++ },
            recreation = DurableFailureGate(ledger = { throw IllegalStateException("disk") }, launches = 1),
        )

        assertThat(store.read("k", "A")).isEqualTo(SecureRead.Unreadable)
        assertThat(resets).isEqualTo(0)
    }

    @Test
    fun `une cle invalidee pour de bon par le Keystore est une signature durable`() {
        assertThat(DurableFailureGate.isPermanent(IllegalStateException("open", KeyPermanentlyInvalidatedException()))).isTrue()
        assertThat(DurableFailureGate.isPermanent(KeyStoreException("busy"))).isFalse()
    }
}

/** Le nom de la classe du Keystore Android (`android.security.keystore`), absente de la JVM des tests. */
private class KeyPermanentlyInvalidatedException : GeneralSecurityException("invalidated")
