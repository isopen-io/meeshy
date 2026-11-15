package me.meeshy.sdk.chat

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** La barre de composition repliée ou dépliée se retient par conversation, d'un lancement à l'autre (#16341). */
@RunWith(RobolectricTestRunner::class)
class ComposerFoldStoreTest {

    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        context.getSharedPreferences(SharedPreferencesComposerFoldStore.FILE_NAME, Context.MODE_PRIVATE).edit().clear().commit()
    }

    private fun newStore() = SharedPreferencesComposerFoldStore(context)

    @Test
    fun `une conversation jamais touchee garde la barre depliee`() {
        assertThat(newStore().isMinimized("c1")).isFalse()
    }

    @Test
    fun `une barre repliee le reste apres un redemarrage`() {
        newStore().setMinimized("c1", minimized = true)
        assertThat(newStore().isMinimized("c1")).isTrue()
    }

    @Test
    fun `le repli d une conversation ne touche pas les autres`() {
        val store = newStore()
        store.setMinimized("c1", minimized = true)
        assertThat(store.isMinimized("c2")).isFalse()
    }

    @Test
    fun `deplier une barre repliee le retient aussi`() {
        newStore().setMinimized("c1", minimized = true)
        newStore().setMinimized("c1", minimized = false)
        assertThat(newStore().isMinimized("c1")).isFalse()
    }

    @Test
    fun `un changement de compte oublie tous les replis`() = runTest {
        val store = newStore()
        store.setMinimized("c1", minimized = true)
        store.clear()
        assertThat(newStore().isMinimized("c1")).isFalse()
    }

    @Test
    fun `la memoire volatile suit la meme loi`() {
        val store = InMemoryComposerFoldStore()
        store.setMinimized("c1", minimized = true)
        assertThat(store.isMinimized("c1")).isTrue()
        assertThat(store.isMinimized("c2")).isFalse()
        store.setMinimized("c1", minimized = false)
        assertThat(store.isMinimized("c1")).isFalse()
    }
}
