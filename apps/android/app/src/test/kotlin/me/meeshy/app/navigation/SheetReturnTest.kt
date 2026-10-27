package me.meeshy.app.navigation

import androidx.lifecycle.ViewModelStore
import androidx.navigation.NavHostController
import androidx.navigation.compose.ComposeNavigator
import androidx.navigation.compose.DialogNavigator
import androidx.navigation.compose.composable
import androidx.navigation.createGraph
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.robolectric.RuntimeEnvironment
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** #13371 — une feuille qui ouvre un écran empilé revient au retour, comme sur iOS. */
@RunWith(RobolectricTestRunner::class)
class SheetReturnTest {

    private fun entry(id: String, sheet: Boolean = false, route: String = id, returns: Boolean = false) =
        StackEntry(id = id, isSheet = sheet, route = route, returnsOnPop = returns)

    private val home = entry("home")
    private val posts = entry("p1", sheet = true, route = "profile/u1/posts", returns = true)
    private val post = entry("d1")

    @Test
    fun `the sheet comes back when the screen it opened is popped`() {
        val memory = SheetReturnMemory()
        assertThat(memory.onStackChanged(listOf(home, posts), listOf(home, post))).isNull()
        assertThat(memory.onStackChanged(listOf(home, post), listOf(home))).isEqualTo("profile/u1/posts")
    }

    @Test
    fun `a sheet simply closed does not come back`() {
        val memory = SheetReturnMemory()
        assertThat(memory.onStackChanged(listOf(home, posts), listOf(home))).isNull()
    }

    @Test
    fun `a sheet not declared as returning stays gone`() {
        val memory = SheetReturnMemory()
        val plain = entry("s1", sheet = true, route = "new-conversation")
        memory.onStackChanged(listOf(home, plain), listOf(home, post))
        assertThat(memory.onStackChanged(listOf(home, post), listOf(home))).isNull()
    }

    @Test
    fun `a screen replaced by another does not bring the sheet back`() {
        val memory = SheetReturnMemory()
        memory.onStackChanged(listOf(home, posts), listOf(home, post))
        val other = entry("o1")
        assertThat(memory.onStackChanged(listOf(home, post), listOf(home, other))).isNull()
        assertThat(memory.onStackChanged(listOf(home, other), listOf(home))).isNull()
    }

    @Test
    fun `a sheet reopened then closed by back does not come back again`() {
        val memory = SheetReturnMemory()
        memory.onStackChanged(listOf(home, posts), listOf(home, post))
        memory.onStackChanged(listOf(home, post), listOf(home))
        val reopened = entry("p2", sheet = true, route = "profile/u1/posts", returns = true)
        assertThat(memory.onStackChanged(listOf(home), listOf(home, reopened))).isNull()
        assertThat(memory.onStackChanged(listOf(home, reopened), listOf(home))).isNull()
    }

    @Test
    fun `a replaced screen frees the kept state of its sheet`() {
        val memory = SheetReturnMemory()
        val kept = posts.copy(destinationId = 42)
        memory.decide(listOf(home, kept), listOf(home, post))
        val decision = memory.decide(listOf(home, post), listOf(home, entry("o1")))
        assertThat(decision.reopen).isNull()
        assertThat(decision.forget).containsExactly(42)
    }

    private fun navigation(): NavHostController =
        NavHostController(RuntimeEnvironment.getApplication()).apply {
            navigatorProvider.addNavigator(ComposeNavigator())
            navigatorProvider.addNavigator(DialogNavigator())
            setViewModelStore(ViewModelStore())
            val self = this
            graph = createGraph(startDestination = "root") {
                composable("root") {}
                composable("detail") {}
                sheetComposable(Routes.DASHBOARD, self) { _, _ -> }
            }
        }

    private fun NavHostController.followSheetReturns() =
        CoroutineScope(Dispatchers.Unconfined).launch { sheetReturns().collect { applySheetReturn(it) } }

    @Test
    fun `real navigation - sheet to screen and back shows the sheet again`() {
        val nav = navigation()
        val job = nav.followSheetReturns()
        nav.navigate(Routes.DASHBOARD)
        nav.navigate("detail")
        assertThat(nav.currentDestination?.route).isEqualTo("detail")

        nav.popBackStack()

        assertThat(nav.currentDestination?.route).isEqualTo(Routes.DASHBOARD)
        nav.popBackStack()
        assertThat(nav.currentDestination?.route).isEqualTo("root")
        job.cancel()
    }

    @Test
    fun `real navigation - the sheet comes back in the same state`() {
        val nav = navigation()
        val job = nav.followSheetReturns()
        nav.navigate(Routes.DASHBOARD)
        val before = nav.currentBackStackEntry!!
        before.savedStateHandle["scroll"] = 12

        nav.navigateKeepingSheet("detail")
        assertThat(nav.currentDestination?.route).isEqualTo("detail")
        nav.popBackStack()

        val after = nav.currentBackStackEntry!!
        assertThat(after.destination.route).isEqualTo(Routes.DASHBOARD)
        assertThat(after.viewModelStore).isSameInstanceAs(before.viewModelStore)
        assertThat(after.savedStateHandle.get<Int>("scroll")).isEqualTo(12)
        job.cancel()
    }
}
