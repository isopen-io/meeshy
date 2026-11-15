package me.meeshy.app.startup

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AppExtensionsTest {

    private class Overlay(override val order: Int) : AppOverlay {
        @Composable
        override fun Content(navController: NavHostController) = Unit
    }

    private class Locals(override val order: Int) : AppLocalsProvider {
        @Composable
        override fun Provide(content: @Composable () -> Unit) = content()
    }

    @Test
    fun `overlays are stacked by ascending order so the highest draws on top`() {
        val high = Overlay(order = 10)
        val low = Overlay(order = -5)
        val mid = Overlay(order = 0)

        val extensions = AppExtensions(listOf(high, low, mid), emptyList(), emptyList())

        assertThat(extensions.overlays).containsExactly(low, mid, high).inOrder()
    }

    @Test
    fun `locals providers wrap from the smallest order outward in`() {
        val inner = Locals(order = 5)
        val outer = Locals(order = -1)

        val extensions = AppExtensions(emptyList(), listOf(inner, outer), emptyList())

        assertThat(extensions.localsProviders).containsExactly(outer, inner).inOrder()
    }
}
