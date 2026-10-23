package me.meeshy.core.datastore

import android.content.Context
import android.content.SharedPreferences
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
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
}
