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
 *
 * L'état de la feuille revient avec elle quand l'écran est empilé par [navigateKeepingSheet] : la feuille est
 * retirée en GARDANT son état (ViewModel, état sauvegardé, défilement) et la réouverture le restaure, comme le
 * `.sheet` iOS resté monté. Si l'écran empilé est remplacé, l'état gardé est libéré.
 */
internal val returningSheetRoutes: Set<String> = setOf(Routes.USER_POSTS, Routes.MY_STORIES, Routes.DASHBOARD)

internal data class StackEntry(
    val id: String,
    val isSheet: Boolean,
    val route: String,
    val returnsOnPop: Boolean,
    val destinationId: Int = 0,
)

/** Ce que la pile demande après un changement : rouvrir une feuille, et/ou libérer l'état gardé de feuilles perdues. */
internal data class SheetReturnDecision(val reopen: String?, val forget: List<Int>) {
    companion object {
        val NONE = SheetReturnDecision(reopen = null, forget = emptyList())
    }
}

internal class SheetReturnMemory {
    private data class Owed(val route: String, val belowId: String, val sheetDestinationId: Int)

    private val owed = mutableMapOf<String, Owed>()

    /** Rend la route de la feuille à rouvrir, ou `null`, à chaque changement de pile. */
    fun onStackChanged(previous: List<StackEntry>, current: List<StackEntry>): String? = decide(previous, current).reopen

    /** La décision complète : la feuille à rouvrir et l'état gardé des feuilles qui ne reviendront plus. */
    fun decide(previous: List<StackEntry>, current: List<StackEntry>): SheetReturnDecision {
        noteSheetReplacedByScreen(previous, current)
        val gone = owed.filterKeys { screenId -> current.none { it.id == screenId } }
        if (gone.isEmpty()) return SheetReturnDecision.NONE
        owed.keys.removeAll(gone.keys)
        val reopened = gone.values.firstOrNull { due -> current.lastOrNull()?.id == due.belowId }
        val forgotten = gone.values.filter { it !== reopened }.map { it.sheetDestinationId }
        return SheetReturnDecision(reopen = reopened?.route, forget = forgotten)
    }

    private fun noteSheetReplacedByScreen(previous: List<StackEntry>, current: List<StackEntry>) {
        val sheet = previous.lastOrNull()?.takeIf { it.isSheet && it.returnsOnPop } ?: return
        val screen = current.lastOrNull() ?: return
        val below = previous.getOrNull(previous.lastIndex - 1) ?: return
        val replacedInPlace = current.dropLast(1).map { it.id } == previous.dropLast(1).map { it.id }
        if (replacedInPlace && !screen.isSheet && previous.none { it.id == screen.id }) {
            owed[screen.id] = Owed(route = sheet.route, belowId = below.id, sheetDestinationId = sheet.destinationId)
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
        destinationId = destination.id,
    )
}

private const val NAVIGATOR_DIALOG = "dialog"

/** Les décisions de retour de feuille, au fil des changements de pile de [this]. */
internal fun NavHostController.sheetReturns(): Flow<SheetReturnDecision> = flow {
    val memory = SheetReturnMemory()
    var previous = emptyList<StackEntry>()
    currentBackStack.collect { entries ->
        val current = entries.mapNotNull { it.toStackEntry() }
        val decision = memory.decide(previous, current)
        previous = current
        if (decision != SheetReturnDecision.NONE) emit(decision)
    }
}

/** Applique une décision : libère l'état gardé des feuilles perdues, rouvre la feuille due en restaurant le sien. */
internal fun NavHostController.applySheetReturn(decision: SheetReturnDecision) {
    decision.forget.forEach { clearBackStack(it) }
    decision.reopen?.let { route ->
        navigate(route) {
            launchSingleTop = true
            restoreState = true
        }
    }
}

/**
 * Empile [route] (un écran, jamais une autre feuille) depuis la feuille au sommet. Si c'est une feuille qui revient,
 * elle est retirée en gardant son état, que [SheetReturnEffect] restaure au retour ; sinon c'est un `navigate` simple.
 */
internal fun NavHostController.navigateKeepingSheet(route: String) {
    val sheet = currentBackStackEntry?.takeIf {
        it.destination.navigatorName == NAVIGATOR_DIALOG && it.destination.route in returningSheetRoutes
    }
    navigate(route) {
        if (sheet != null) {
            popUpTo(sheet.destination.id) {
                inclusive = true
                saveState = true
            }
        }
    }
}

@Composable
internal fun SheetReturnEffect(navController: NavHostController) {
    LaunchedEffect(navController) {
        navController.sheetReturns().collect { decision -> navController.applySheetReturn(decision) }
    }
}
