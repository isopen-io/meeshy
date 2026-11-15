package me.meeshy.app.navigation

import android.net.Uri
import androidx.lifecycle.ViewModelStore
import androidx.navigation.NavGraph
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.ComposeNavigator
import androidx.navigation.compose.composable
import androidx.navigation.createGraph
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/**
 * #16676 — le Flux quitté par le retour système, un lien, une conversation ouverte d'ailleurs ou le jeu revient au
 * prochain toucher du bouton Flux avec le MÊME état (son ViewModel, sa position de lecture), prouvé sur une
 * navigation réelle. Rien d'autre ne ressuscite : ni ce qui était empilé sur le Flux, ni une conversation remplacée.
 */
@RunWith(RobolectricTestRunner::class)
class FeedSetAsideTest {

    private val profile = "profile-above-feed"

    private fun navigation(): NavHostController =
        NavHostController(RuntimeEnvironment.getApplication()).apply {
            navigatorProvider.addNavigator(ComposeNavigator())
            setViewModelStore(ViewModelStore())
            graph = createGraph(startDestination = Routes.CONVERSATIONS) {
                composable(Routes.CONVERSATIONS) {}
                composable(Routes.FEED) {}
                composable(Routes.NOTIFICATIONS) {}
                composable(profile) {}
                composable(
                    route = Routes.CHAT,
                    arguments = listOf(
                        navArgument("conversationId") { type = NavType.StringType },
                        navArgument(ChatRouteArgs.HIGHLIGHT_MESSAGE_ID) {
                            type = NavType.StringType
                            nullable = true
                            defaultValue = null
                        },
                    ),
                    deepLinks = listOf(navDeepLink { uriPattern = Routes.CONVERSATION_SHORT_DEEP_LINK }),
                ) {}
            }
        }

    /** Le Flux ouvert par son bouton, lu jusqu'à une position que l'écran garde dans l'état de l'entrée. */
    private fun NavHostController.openFeedAndRead(): ViewModelStore {
        navigateToTopLevel(Routes.FEED)
        val feed = currentBackStackEntry!!
        feed.savedStateHandle["reading"] = 7
        return feed.viewModelStore
    }

    private fun NavHostController.routes() =
        currentBackStack.value.filterNot { it.destination is NavGraph }.map { it.destination.route }

    private fun NavHostController.assertFeedCameBack(store: ViewModelStore) {
        navigateToTopLevel(Routes.FEED)
        val feed = currentBackStackEntry!!
        assertThat(feed.destination.route).isEqualTo(Routes.FEED)
        assertThat(feed.viewModelStore).isSameInstanceAs(store)
        assertThat(feed.savedStateHandle.get<Int>("reading")).isEqualTo(7)
    }

    @Test
    fun `back on the feed returns to the list and the feed button brings back the same feed`() {
        val nav = navigation()
        val store = nav.openFeedAndRead()

        assertThat(nav.setFeedAside()).isTrue()

        assertThat(nav.currentDestination?.route).isEqualTo(Routes.CONVERSATIONS)
        nav.assertFeedCameBack(store)
    }

    @Test
    fun `the feed button toggles back to the list after a restored feed`() {
        val nav = navigation()
        nav.openFeedAndRead()
        nav.setFeedAside()
        nav.navigateToTopLevel(Routes.FEED)

        nav.navigateToTopLevel(Routes.CONVERSATIONS)

        assertThat(nav.routes()).containsExactly(Routes.CONVERSATIONS)
    }

    @Test
    fun `a link opened over the feed keeps it for the next tap on the feed button`() {
        val nav = navigation()
        val store = nav.openFeedAndRead()

        assertThat(WarmDeepLink.open(nav, Uri.parse("meeshy://c/abc"))).isTrue()

        assertThat(nav.routes()).containsExactly(Routes.CONVERSATIONS, Routes.CHAT).inOrder()
        nav.popBackStack()
        nav.assertFeedCameBack(store)
    }

    @Test
    fun `a conversation opened from elsewhere keeps the feed`() {
        val nav = navigation()
        val store = nav.openFeedAndRead()

        nav.navigateOverConversations(Routes.chat("abc"))

        assertThat(nav.routes()).containsExactly(Routes.CONVERSATIONS, Routes.CHAT).inOrder()
        nav.popBackStack()
        nav.assertFeedCameBack(store)
    }

    @Test
    fun `a screen stacked above the feed does not come back with it`() {
        val nav = navigation()
        nav.openFeedAndRead()
        nav.navigate(profile)

        WarmDeepLink.open(nav, Uri.parse("meeshy://c/abc"))
        nav.popBackStack()
        nav.navigateToTopLevel(Routes.FEED)

        assertThat(nav.routes()).containsExactly(Routes.CONVERSATIONS, Routes.FEED).inOrder()
    }

    @Test
    fun `a conversation replaced by a link never comes back through the feed button`() {
        val nav = navigation()
        nav.navigate(Routes.chat("first"))

        WarmDeepLink.open(nav, Uri.parse("meeshy://c/second"))
        nav.popBackStack()
        nav.navigateToTopLevel(Routes.FEED)
        nav.navigateToTopLevel(Routes.CONVERSATIONS)

        assertThat(nav.routes()).containsExactly(Routes.CONVERSATIONS)
    }

    @Test
    fun `an address the graph does not know leaves the feed where it is`() {
        val nav = navigation()
        nav.openFeedAndRead()

        assertThat(WarmDeepLink.open(nav, Uri.parse("meeshy://nowhere"))).isFalse()

        assertThat(nav.routes()).containsExactly(Routes.CONVERSATIONS, Routes.FEED).inOrder()
    }

    @Test
    fun `going back to the conversations from above the feed keeps the feed`() {
        val nav = navigation()
        val store = nav.openFeedAndRead()
        nav.navigate(profile)

        assertThat(nav.backToConversations()).isTrue()

        assertThat(nav.routes()).containsExactly(Routes.CONVERSATIONS)
        nav.assertFeedCameBack(store)
    }

    @Test
    fun `going back to the conversations from the list itself pops nothing`() {
        val nav = navigation()

        assertThat(nav.backToConversations()).isFalse()

        assertThat(nav.routes()).containsExactly(Routes.CONVERSATIONS)
    }

    @Test
    fun `the feed left for another top-level screen still comes back`() {
        val nav = navigation()
        val store = nav.openFeedAndRead()
        nav.navigateToTopLevel(Routes.NOTIFICATIONS)

        WarmDeepLink.open(nav, Uri.parse("meeshy://c/abc"))
        nav.popBackStack()

        nav.assertFeedCameBack(store)
    }
}
