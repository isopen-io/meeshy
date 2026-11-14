package me.meeshy.app.navigation

import androidx.lifecycle.ViewModelStore
import androidx.navigation.NavController
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.ComposeNavigator
import androidx.navigation.compose.DialogNavigator
import androidx.navigation.compose.composable
import androidx.navigation.createGraph
import androidx.navigation.navArgument
import com.google.common.truth.Truth.assertThat
import me.meeshy.app.auth.GuestJoinViewModel
import me.meeshy.app.chat.ChatViewModel
import me.meeshy.app.navigation.graph.CommunityRoutes
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/** #18365 — un double toucher n'empile qu'un écran, un double retour n'en dépile qu'un. */
@RunWith(RobolectricTestRunner::class)
class StackGuardTest {

    private fun controller(): NavHostController = NavHostController(RuntimeEnvironment.getApplication()).apply {
        navigatorProvider.addNavigator(ComposeNavigator())
        navigatorProvider.addNavigator(DialogNavigator())
        setViewModelStore(ViewModelStore())
        val nav = this
        graph = createGraph(startDestination = Routes.CONVERSATIONS) {
            composable(Routes.CONVERSATIONS) {}
            composable(Routes.SETTINGS) {}
            composable(SETTINGS_PAGE) {}
            composable(CommunityRoutes.LIST) {}
            composable(CHANNEL) {}
            composable(Routes.LOGIN) {}
            composable(Routes.GUEST_JOIN, listOf(navArgument(GuestJoinViewModel.IDENTIFIER_ARG) { type = NavType.StringType })) {}
            composable(Routes.PROFILE_USER, listOf(navArgument(USER_ARG) { type = NavType.StringType })) {}
            composable(
                Routes.CHAT,
                listOf(
                    navArgument(ChatViewModel.CONVERSATION_ID_ARG) { type = NavType.StringType },
                    navArgument(ChatRouteArgs.HIGHLIGHT_MESSAGE_ID) { type = NavType.StringType; nullable = true; defaultValue = null },
                ),
            ) {}
            sheetComposable(SHEET, nav) { _, _ -> }
        }
    }

    private fun NavHostController.top() = checkNotNull(currentBackStackEntry)

    private fun NavHostController.routes() = currentBackStack.value.mapNotNull { it.destination.route }.filter { it != graph.route }

    private fun NavHostController.navigator(): AppNavigator {
        val tracker = RouteTracker()
        addOnDestinationChangedListener(
            NavController.OnDestinationChangedListener { controller, destination, arguments ->
                val entryId = controller.currentBackStackEntry?.id ?: destination.id.toString()
                tracker.onDestinationChanged(entryId, destination.route) { name -> arguments?.getString(name) }
            },
        )
        return AppNavigator(this, tracker, PresentedSurfaceRegistry(), NavigationRequests())
    }

    @Test
    fun `two pushes from the same screen stack one screen`() {
        val nav = controller()
        val list = nav.top()

        nav.pushFrom(list, Routes.SETTINGS)
        nav.pushFrom(list, Routes.SETTINGS)

        assertThat(nav.routes()).containsExactly(Routes.CONVERSATIONS, Routes.SETTINGS).inOrder()
    }

    @Test
    fun `a push from the screen under an open sheet is ignored`() {
        val nav = controller()
        val list = nav.top()
        nav.navigate(SHEET)

        nav.pushFrom(list, Routes.SETTINGS)

        assertThat(nav.routes()).containsExactly(Routes.CONVERSATIONS, SHEET).inOrder()
    }

    @Test
    fun `a profile opened from another profile stacks over it`() {
        val nav = controller()
        nav.navigate(Routes.profile("a"))
        val profileA = nav.top()

        nav.pushFrom(profileA, Routes.profile("b"))

        assertThat(nav.top().arguments?.getString(USER_ARG)).isEqualTo("b")
        assertThat(nav.previousBackStackEntry?.arguments?.getString(USER_ARG)).isEqualTo("a")
    }

    @Test
    fun `two pops from the same screen leave the screen under it in place`() {
        val nav = controller()
        nav.navigate(Routes.SETTINGS)
        nav.navigate(SETTINGS_PAGE)
        val page = nav.top()

        nav.popFrom(page)
        nav.popFrom(page)

        assertThat(nav.routes()).containsExactly(Routes.CONVERSATIONS, Routes.SETTINGS).inOrder()
    }

    @Test
    fun `leaving a community reached without its list comes back to the conversations`() {
        val nav = controller()
        nav.navigate(Routes.SETTINGS)
        nav.navigate(CHANNEL)

        nav.popToOrRoot(nav.top(), CommunityRoutes.LIST)

        assertThat(nav.routes()).containsExactly(Routes.CONVERSATIONS)
    }

    @Test
    fun `leaving a community from a screen no longer on top changes nothing`() {
        val nav = controller()
        nav.navigate(CHANNEL)
        val channel = nav.top()
        nav.navigate(SHEET)

        nav.popToOrRoot(channel, CommunityRoutes.LIST)

        assertThat(nav.routes()).containsExactly(Routes.CONVERSATIONS, CHANNEL, SHEET).inOrder()
    }

    @Test
    fun `a guest join replaced by the login keeps a single login`() {
        val nav = controller()
        nav.navigate(Routes.LOGIN)
        nav.navigate(Routes.guestJoin("abc"))

        nav.pushFrom(nav.top(), Routes.LOGIN) {
            popUpTo(Routes.GUEST_JOIN) { inclusive = true }
            launchSingleTop = true
        }

        assertThat(nav.routes().count { it == Routes.LOGIN }).isEqualTo(1)
        assertThat(nav.routes()).doesNotContain(Routes.GUEST_JOIN)
    }

    @Test
    fun `a hub reached from a screen already above it pops back to it`() {
        val nav = controller()
        val navigator = nav.navigator()
        nav.navigate(Routes.SETTINGS)
        nav.navigate(SETTINGS_PAGE)

        navigator.navigateFrom(nav.top(), Routes.SETTINGS)

        assertThat(nav.routes()).containsExactly(Routes.CONVERSATIONS, Routes.SETTINGS).inOrder()
    }

    @Test
    fun `a navigation from a screen no longer on top is ignored by the router`() {
        val nav = controller()
        val navigator = nav.navigator()
        val list = nav.top()
        nav.navigate(SHEET)

        navigator.navigateFrom(list, Routes.SETTINGS)
        navigator.openConversationFrom(list, "b")

        assertThat(nav.routes()).containsExactly(Routes.CONVERSATIONS, SHEET).inOrder()
    }

    @Test
    fun `a conversation opened from another conversation stacks over it`() {
        val nav = controller()
        val navigator = nav.navigator()
        navigator.openConversation("a")

        navigator.openConversation("b")

        assertThat(nav.routes()).containsExactly(Routes.CONVERSATIONS, Routes.CHAT, Routes.CHAT).inOrder()
        assertThat(nav.top().arguments?.getString(ChatViewModel.CONVERSATION_ID_ARG)).isEqualTo("b")
        assertThat(nav.previousBackStackEntry?.arguments?.getString(ChatViewModel.CONVERSATION_ID_ARG)).isEqualTo("a")
    }

    @Test
    fun `a conversation touched twice from the same screen opens once`() {
        val nav = controller()
        val navigator = nav.navigator()
        val list = nav.top()

        navigator.openConversationFrom(list, "a")
        navigator.openConversationFrom(list, "a")

        assertThat(nav.routes()).containsExactly(Routes.CONVERSATIONS, Routes.CHAT).inOrder()
    }

    @Test
    fun `an event-driven navigation lands even when a sheet sits on top`() {
        val nav = controller()
        nav.navigate(SHEET)

        nav.navigateSingleTop(Routes.SETTINGS)
        nav.navigateSingleTop(Routes.SETTINGS)

        assertThat(nav.routes().last()).isEqualTo(Routes.SETTINGS)
        assertThat(nav.routes().count { it == Routes.SETTINGS }).isEqualTo(1)
    }

    private companion object {
        const val SETTINGS_PAGE = "settings/privacy"
        const val CHANNEL = "communities/{communityId}/channel"
        const val SHEET = "sheet"
        const val USER_ARG = "userId"
    }
}
