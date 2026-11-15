package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class BannerPeekNavigationTest {

    private fun TestScope.state() = BannerPeekState(scope = this)

    @Test
    fun `ouvrir la conversation complete ferme la feuille puis navigue 100 ms plus tard`() = runTest {
        val state = state()
        val navigated = mutableListOf<String>()
        state.show("c1")

        state.openFull { navigated += it }
        runCurrent()

        assertThat(state.conversationId).isNull()
        assertThat(navigated).isEmpty()

        advanceTimeBy(99)
        runCurrent()
        assertThat(navigated).isEmpty()

        advanceTimeBy(1)
        runCurrent()
        assertThat(navigated).containsExactly("c1")
    }

    @Test
    fun `sans feuille ouverte rien ne navigue`() = runTest {
        val state = state()
        val navigated = mutableListOf<String>()

        state.openFull { navigated += it }
        advanceTimeBy(500)
        runCurrent()

        assertThat(navigated).isEmpty()
    }

    @Test
    fun `fermer la feuille ne navigue pas`() = runTest {
        val state = state()
        val navigated = mutableListOf<String>()
        state.show("c1")

        state.dismiss()
        advanceTimeBy(500)
        runCurrent()

        assertThat(state.conversationId).isNull()
        assertThat(navigated).isEmpty()
    }
}
