package me.meeshy.app.navigation

import androidx.navigation.NavHostController
import androidx.navigation.compose.ComposeNavigator
import androidx.navigation.compose.DialogNavigator
import androidx.navigation.compose.composable
import androidx.navigation.createGraph
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/** #13369 — fermer une feuille retire la feuille, jamais l'écran qui l'a ouverte. */
@RunWith(RobolectricTestRunner::class)
class SheetCloseTest {

    private fun controller(): NavHostController = NavHostController(RuntimeEnvironment.getApplication()).apply {
        navigatorProvider.addNavigator(ComposeNavigator())
        navigatorProvider.addNavigator(DialogNavigator())
        val nav = this
        graph = createGraph(startDestination = "root") {
            composable("root") {}
            composable("settings") {}
            sheetComposable("about", nav) { _, _ -> }
            sheetComposable("security", nav) { _, _ -> }
        }
    }

    @Test
    fun `a sheet closed twice leaves the screen under it in place`() {
        val nav = controller()
        nav.navigate("settings")
        nav.navigate("about")
        val sheet = checkNotNull(nav.currentBackStackEntry)

        nav.closeSheet(sheet)
        nav.closeSheet(sheet)

        assertThat(nav.currentDestination?.route).isEqualTo("settings")
    }

    @Test
    fun `a sheet under another sheet does not close the one on top`() {
        val nav = controller()
        nav.navigate("settings")
        nav.navigate("security")
        val security = checkNotNull(nav.currentBackStackEntry)
        nav.navigate("about")

        nav.closeSheet(security)

        assertThat(nav.currentDestination?.route).isEqualTo("about")
    }
}
