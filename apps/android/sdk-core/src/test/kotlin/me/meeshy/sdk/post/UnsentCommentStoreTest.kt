package me.meeshy.sdk.post

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class UnsentCommentStoreTest {

    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun store() = SharedPrefsUnsentCommentStore(context, Json)

    @Test
    fun `le texte survit au processus et se retire quand l auteur le reprend`() {
        store().keep("p1", "Bravo")

        val reborn = store()
        assertThat(reborn.peek("p1")).isEqualTo("Bravo")
        assertThat(reborn.take("p1")).isEqualTo("Bravo")
        assertThat(store().peek("p1")).isNull()
    }

    @Test
    fun `un texte blanc n est pas garde`() {
        store().keep("p2", "   ")

        assertThat(store().peek("p2")).isNull()
    }

    @Test
    fun `le compte qui part emporte les mots du premier`() = runTest {
        val s = store()
        s.keep("p3", "secret")

        s.clear()

        assertThat(store().peek("p3")).isNull()
        assertThat(s.kept.value).isEmpty()
    }
}
