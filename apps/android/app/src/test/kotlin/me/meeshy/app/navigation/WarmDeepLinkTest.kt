package me.meeshy.app.navigation

import android.content.Intent
import android.net.Uri
import androidx.lifecycle.ViewModelStore
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.ComposeNavigator
import androidx.navigation.compose.composable
import androidx.navigation.createGraph
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import com.google.common.truth.Truth.assertThat
import me.meeshy.app.navigation.graph.GameRoutes
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/**
 * #13392 — un lien `meeshy://` ou un raccourci d'icône reçu app OUVERTE (`onNewIntent`) navigue :
 * `MeeshyApp` rejoue l'intent par `handleDeepLink`, ici prouvé sur une navigation réelle déjà
 * démarrée sur la liste, avec les adresses exactes des raccourcis dynamiques.
 */
@RunWith(RobolectricTestRunner::class)
class WarmDeepLinkTest {

    private fun startedNavigation(): NavHostController =
        NavHostController(RuntimeEnvironment.getApplication()).apply {
            navigatorProvider.addNavigator(ComposeNavigator())
            setViewModelStore(ViewModelStore())
            graph = createGraph(startDestination = Routes.CONVERSATIONS) {
                composable(Routes.CONVERSATIONS) {}
                composable(
                    route = Routes.CHAT,
                    arguments = listOf(navArgument("conversationId") { type = NavType.StringType }),
                    deepLinks = listOf(
                        navDeepLink { uriPattern = Routes.CHAT_DEEP_LINK },
                        navDeepLink { uriPattern = Routes.CONVERSATION_DEEP_LINK },
                        navDeepLink { uriPattern = Routes.CONVERSATION_SINGULAR_DEEP_LINK },
                        navDeepLink { uriPattern = Routes.CONVERSATION_SHORT_DEEP_LINK },
                    ),
                ) {}
                composable(
                    route = "${Routes.PACK_SHOP}?domain={domain}&pack={pack}",
                    arguments = listOf(
                        navArgument("domain") { type = NavType.StringType; nullable = true; defaultValue = null },
                        navArgument("pack") { type = NavType.StringType; nullable = true; defaultValue = null },
                    ),
                    deepLinks = listOf(navDeepLink { uriPattern = Routes.PACK_SHOP_DEEP_LINK }),
                ) {}
                composable(
                    route = GameRoutes.PROGRESSION,
                    deepLinks = GameRoutes.PROGRESSION_DEEP_LINKS.map { pattern -> navDeepLink { uriPattern = pattern } },
                ) {}
            }
        }

    /** Ce que `MainActivity.onNewIntent` reçoit d'un lanceur, d'un navigateur ou de `adb` : un VIEW en NEW_TASK. */
    private fun open(nav: NavHostController, uri: String): Boolean {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return WarmDeepLink.open(nav, WarmDeepLink.replayable(intent)!!)
    }

    @Test
    fun `a notification tap or a plain relaunch is not replayed as a link`() {
        assertThat(WarmDeepLink.replayable(Intent(Intent.ACTION_MAIN))).isNull()
        assertThat(WarmDeepLink.replayable(Intent(Intent.ACTION_VIEW))).isNull()
    }

    @Test
    fun `progression opens while the list is already showing`() {
        val nav = startedNavigation()

        assertThat(open(nav, "meeshy://progression")).isTrue()

        assertThat(nav.currentDestination?.route).isEqualTo(GameRoutes.PROGRESSION)
    }

    @Test
    fun `the conversation shortcut addresses open their conversation with the list underneath`() {
        listOf("meeshy://c/abc123", "meeshy://conversation/abc123").forEach { uri ->
            val nav = startedNavigation()

            assertThat(open(nav, uri)).isTrue()

            assertThat(nav.currentDestination?.route).isEqualTo(Routes.CHAT)
            assertThat(nav.currentBackStackEntry?.arguments?.getString("conversationId")).isEqualTo("abc123")
            nav.popBackStack()
            assertThat(nav.currentDestination?.route).isEqualTo(Routes.CONVERSATIONS)
        }
    }

    @Test
    fun `an address the graph does not know is left alone`() {
        val nav = startedNavigation()

        assertThat(open(nav, "meeshy://nowhere")).isFalse()

        assertThat(nav.currentDestination?.route).isEqualTo(Routes.CONVERSATIONS)
    }

    @Test
    fun `a second shortcut replaces the open conversation instead of stacking`() {
        val nav = startedNavigation()
        open(nav, "meeshy://c/first")

        open(nav, "meeshy://c/second")

        assertThat(nav.currentBackStackEntry?.arguments?.getString("conversationId")).isEqualTo("second")
        nav.popBackStack()
        assertThat(nav.currentDestination?.route).isEqualTo(Routes.CONVERSATIONS)
    }

    @Test
    fun `the pack shop link opens the shop on the asked domain and pack`() {
        val nav = startedNavigation()

        assertThat(open(nav, "meeshy://settings/packs?domaine=banner&pack=x")).isTrue()

        assertThat(nav.currentDestination?.route).isEqualTo("${Routes.PACK_SHOP}?domain={domain}&pack={pack}")
        assertThat(nav.currentBackStackEntry?.arguments?.getString("domain")).isEqualTo("banner")
        assertThat(nav.currentBackStackEntry?.arguments?.getString("pack")).isEqualTo("x")
    }
}
