package me.meeshy.core.datastore

import android.content.Context
import android.content.SharedPreferences
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.security.SecureRead
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.security.GeneralSecurityException

@RunWith(RobolectricTestRunner::class)
class KeystoreSecureStoreTest {

    private fun prefs(name: String): SharedPreferences =
        ApplicationProvider.getApplicationContext<Context>()
            .getSharedPreferences(name, Context.MODE_PRIVATE)
            .also { it.edit().clear().commit() }

    private fun store(name: String = "vault_test") = prefs(name).let { p -> KeystoreSecureStore(open = { p }) }

    @Test
    fun `isole les comptes entre eux et des cles nues`() {
        val store = store()
        store.put("jwt", "a", "A")
        store.put("jwt", "bare")
        assertThat(store.get("jwt", "A")).isEqualTo("a")
        assertThat(store.get("jwt", "B")).isNull()
        assertThat(store.get("jwt")).isEqualTo("bare")
        assertThat(store.keys("A")).containsExactly("jwt")
        assertThat(store.keys()).containsExactly("jwt")
    }

    @Test
    fun `clearAccount ne vide que ce compte et clearAll vide tout`() {
        val store = store()
        store.put("jwt", "a", "A")
        store.put("jwt", "b", "B")
        store.clearAccount("A")
        assertThat(store.get("jwt", "A")).isNull()
        assertThat(store.get("jwt", "B")).isEqualTo("b")
        store.clearAll()
        assertThat(store.get("jwt", "B")).isNull()
    }

    @Test
    fun `un fournisseur qui leve donne un coffre vide et le fichier est recree`() {
        var resets = 0
        var calls = 0
        val healthy = prefs("vault_recreated")
        val store = KeystoreSecureStore(
            open = { if (calls++ == 0) throw GeneralSecurityException("bad tag") else healthy },
            reset = { resets++ },
        )
        assertThat(store.get("jwt", "A")).isNull()
        assertThat(resets).isEqualTo(1)
        assertThat(store.put("jwt", "x", "A")).isTrue()
        assertThat(store.get("jwt", "A")).isEqualTo("x")
    }

    @Test
    fun `un coffre irrecuperable reste vide sans lever ni reboucler`() {
        var opens = 0
        val store = KeystoreSecureStore(open = { opens++; throw GeneralSecurityException("keystore") })
        assertThat(store.get("jwt")).isNull()
        assertThat(store.put("jwt", "x")).isFalse()
        store.remove("jwt")
        store.clearAll()
        assertThat(store.keys()).isEmpty()
        assertThat(opens).isEqualTo(2)
    }

    @Test
    fun `les variantes suspend lisent et ecrivent hors du thread appelant`() = runTest {
        val p = prefs("vault_suspend")
        val store = KeystoreSecureStore(open = { p }, io = StandardTestDispatcher(testScheduler))
        assertThat(store.putSuspend("k", "v", "A")).isTrue()
        assertThat(store.getSuspend("k", "A")).isEqualTo("v")
        store.removeSuspend("k", "A")
        assertThat(store.getSuspend("k", "A")).isNull()
    }

    @Test
    fun `read distingue absent present et illisible`() {
        val store = store("vault_read")
        store.put("k", "v", "A")
        assertThat(store.read("k", "A")).isEqualTo(SecureRead.Present("v"))
        assertThat(store.read("autre", "A")).isEqualTo(SecureRead.Absent)
    }

    @Test
    fun `un coffre irrecuperable est illisible et non absent`() {
        val store = KeystoreSecureStore(open = { throw GeneralSecurityException("keystore") })
        assertThat(store.read("k", "A")).isEqualTo(SecureRead.Unreadable)
    }

    @Test
    fun `un fichier recree apres echec est illisible jusqu'a la reconnaissance du compte`() {
        var calls = 0
        val healthy = prefs("vault_recovered")
        val store = KeystoreSecureStore(
            open = { if (calls++ == 0) throw GeneralSecurityException("bad tag") else healthy },
            reset = {},
        )
        assertThat(store.read("k", "A")).isEqualTo(SecureRead.Unreadable)
        assertThat(store.read("k", "B")).isEqualTo(SecureRead.Unreadable)
        store.acknowledgeRecovery("A")
        assertThat(store.read("k", "A")).isEqualTo(SecureRead.Absent)
        assertThat(store.read("k", "B")).isEqualTo(SecureRead.Unreadable)
    }

    @Test
    fun `un fichier recree reste illisible apres redemarrage jusqu'a la reconnaissance du compte`() {
        var calls = 0
        val healthy = prefs("vault_restart")
        val ledger = prefs("vault_restart.recovery")
        KeystoreSecureStore(
            open = { if (calls++ == 0) throw GeneralSecurityException("bad tag") else healthy },
            reset = {},
            recoveryLedger = { ledger },
        ).read("k", "A")
        val restarted = { KeystoreSecureStore(open = { healthy }, recoveryLedger = { ledger }) }
        assertThat(restarted().read("k", "A")).isEqualTo(SecureRead.Unreadable)
        restarted().acknowledgeRecovery("A")
        assertThat(restarted().read("k", "A")).isEqualTo(SecureRead.Absent)
        assertThat(restarted().read("k", "B")).isEqualTo(SecureRead.Unreadable)
    }

    @Test
    fun `une nouvelle recreation annule les reconnaissances precedentes`() {
        val healthy = prefs("vault_again")
        val ledger = prefs("vault_again.recovery")
        fun failingOnce(): KeystoreSecureStore {
            var calls = 0
            return KeystoreSecureStore(
                open = { if (calls++ == 0) throw GeneralSecurityException("bad tag") else healthy },
                reset = {},
                recoveryLedger = { ledger },
            )
        }
        failingOnce().acknowledgeRecovery("A")
        failingOnce().read("k", "A")
        assertThat(KeystoreSecureStore(open = { healthy }, recoveryLedger = { ledger }).read("k", "A"))
            .isEqualTo(SecureRead.Unreadable)
    }

    @Test
    fun `un registre de reprise illisible laisse le compte illisible`() {
        val healthy = prefs("vault_ledger_ko")
        val broken = object : SharedPreferences by prefs("vault_ledger_ko.recovery") {
            override fun getBoolean(key: String?, defValue: Boolean): Boolean = throw IllegalStateException("disk")
        }
        assertThat(KeystoreSecureStore(open = { healthy }, recoveryLedger = { broken }).read("k", "A"))
            .isEqualTo(SecureRead.Unreadable)
    }

    @Test
    fun `un registre de reprise qui ne s'ouvre pas laisse le compte illisible et le fichier en place`() {
        var resets = 0
        val healthy = prefs("vault_ledger_absent")
        val store = KeystoreSecureStore(
            open = { healthy },
            reset = { resets++ },
            recoveryLedger = { throw IllegalStateException("disk") },
        )
        assertThat(store.read("k", "A")).isEqualTo(SecureRead.Unreadable)
        var calls = 0
        KeystoreSecureStore(
            open = { if (calls++ == 0) throw GeneralSecurityException("bad tag") else healthy },
            reset = { resets++ },
            recoveryLedger = { throw IllegalStateException("disk") },
        ).read("k", "A")
        assertThat(resets).isEqualTo(0)
    }

    @Test
    fun `une lecture qui leve sur une entree isolee est illisible`() {
        val throwing = object : SharedPreferences by prefs("vault_throw") {
            override fun contains(key: String?): Boolean = true
            override fun getString(key: String?, defValue: String?): String? = throw GeneralSecurityException("tag")
        }
        assertThat(KeystoreSecureStore(open = { throwing }).read("k", "A")).isEqualTo(SecureRead.Unreadable)
    }
}
