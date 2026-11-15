package me.meeshy.sdk.auth

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PendingReferralStoreTest {

    private lateinit var context: Context
    private var clock = 1_000L

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        context.getSharedPreferences(SharedPrefsPendingReferralStore.FILE_NAME, Context.MODE_PRIVATE).edit().clear().commit()
        clock = 1_000L
    }

    private fun newStore(ttl: Long = 10_000L) = SharedPrefsPendingReferralStore(context, ttl) { clock }

    @Test
    fun `un code memorise survit a un nouveau magasin`() {
        newStore().remember("  aff_ABC  ")
        assertThat(newStore().recall()).isEqualTo("aff_ABC")
    }

    @Test
    fun `un code mal forme n'efface rien`() {
        val store = newStore()
        store.remember("aff_ABC")
        store.remember("deux mots")
        store.remember("")
        assertThat(store.recall()).isEqualTo("aff_ABC")
    }

    @Test
    fun `usage unique apres inscription`() {
        val store = newStore()
        store.remember("aff_ABC")
        store.forget()
        assertThat(store.recall()).isNull()
    }

    @Test
    fun `le code perit apres sa duree de vie`() {
        val store = newStore(ttl = 10_000L)
        store.remember("aff_ABC")
        clock += 10_000L
        assertThat(store.recall()).isEqualTo("aff_ABC")
        clock += 1L
        assertThat(store.recall()).isNull()
        assertThat(newStore().recall()).isNull()
    }

    @Test
    fun `le magasin en memoire suit la meme loi`() {
        var now = 0L
        val store = InMemoryPendingReferralStore(timeToLiveMillis = 5L) { now }
        store.remember("ref_1")
        assertThat(store.recall()).isEqualTo("ref_1")
        now = 6L
        assertThat(store.recall()).isNull()
    }
}
