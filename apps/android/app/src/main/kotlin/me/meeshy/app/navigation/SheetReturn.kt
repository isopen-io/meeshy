package me.meeshy.app.navigation

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavGraph
import androidx.navigation.NavHostController

/**
 * Une feuille qui ouvre un écran empilé y revient au retour (#13371), comme le `.sheet` d'iOS qui reste dessous.
 * Navigation Compose retire toute destination `dialog` du sommet de la pile quand on empile un `composable` ;
 * ce suivi note la feuille ainsi retirée puis la rouvre (même route, mêmes arguments) quand l'écran empilé
 * repart et que l'écran d'origine redevient le sommet.
 *
 * Seules les feuilles de [returningSheetRoutes] sont rouvertes : une feuille dont l'écran suivant la remplace
 * (nouvelle conversation → conversation) ne doit pas revenir.
 */
internal val returningSheetRoutes: Set<String> = setOf(Routes.USER_POSTS, Routes.MY_STORIES, Routes.DASHBOARD)

internal data class StackEntry(
    val id: String,
    val isSheet: Boolean,
    val route: String,
    val returnsOnPop: Boolean,
)

internal class SheetReturnMemory {
    private data class Owed(val route: String, val belowId: String)

    private val owed = mutableMapOf<String, Owed>()

    /** Rend la route de la feuille à rouvrir, ou `null`, à chaque changement de pile. */
    fun onStackChanged(previous: List<StackEntry>, current: List<StackEntry>): String? {
        noteSheetReplacedByScreen(previous, current)
        val reopened = owed.entries.firstOrNull { (screenId, due) ->
            current.none { it.id == screenId } && current.lastOrNull()?.id == due.belowId
        }
        owed.keys.retainAll { screenId -> previous.any { it.id == screenId } || current.any { it.id == screenId } }
        owed.entries.removeAll { (screenId, _) -> current.none { it.id == screenId } }
        return reopened?.value?.route
    }

    private fun noteSheetReplacedByScreen(previous: List<StackEntry>, current: List<StackEntry>) {
        val sheet = previous.lastOrNull()?.takeIf { it.isSheet && it.returnsOnPop } ?: return
        val screen = current.lastOrNull() ?: return
        val below = previous.getOrNull(previous.lastIndex - 1) ?: return
        val replacedInPlace = current.dropLast(1).map { it.id } == previous.dropLast(1).map { it.id }
        if (replacedInPlace && !screen.isSheet && previous.none { it.id == screen.id }) {
            owed[screen.id] = Owed(route = sheet.route, belowId = below.id)
        }
    }
}

private fun NavBackStackEntry.toStackEntry(): StackEntry? {
    if (destination is NavGraph) return null
    val pattern = destination.route.orEmpty()
    val filled = Regex("\\{([^}]+)}").replace(pattern) { match ->
        Uri.encode(arguments?.get(match.groupValues[1])?.toString().orEmpty())
    }
    return StackEntry(
        id = id,
        isSheet = destination.navigatorName == NAVIGATOR_DIALOG,
        route = filled,
        returnsOnPop = pattern in returningSheetRoutes,
    )
}

private const val NAVIGATOR_DIALOG = "dialog"

/** Les routes de feuille à rouvrir, au fil des changements de pile de [this]. */
internal fun NavHostController.sheetReturns(): Flow<String> = flow {
    val memory = SheetReturnMemory()
    var previous = emptyList<StackEntry>()
    currentBackStack.collect { entries ->
        val current = entries.mapNotNull { it.toStackEntry() }
        val route = memory.onStackChanged(previous, current)
        previous = current
        if (route != null) emit(route)
    }
}

@Composable
internal fun SheetReturnEffect(navController: NavHostController) {
    LaunchedEffect(navController) {
        navController.sheetReturns().collect { route -> navController.navigate(route) { launchSingleTop = true } }
    }
}
