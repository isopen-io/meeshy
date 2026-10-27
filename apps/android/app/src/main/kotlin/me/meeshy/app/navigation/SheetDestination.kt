package me.meeshy.app.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetState
import androidx.compose.material3.Surface
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.tween
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.snapshotFlow
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.first
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import androidx.navigation.NamedNavArgument
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavDeepLink
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.dialog
import kotlinx.coroutines.launch
import me.meeshy.ui.component.chrome.LocalPresentedAsSheet
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Comment une destination se présente par-dessus l'écran qui l'ouvre (#13369) :
 *  - [PAGE]   : `.sheet` iOS, détente « large » — une feuille à coins arrondis qui laisse voir l'écran dessous ;
 *  - [COVER]  : `.fullScreenCover` iOS — plein écran, qui ne se ferme qu'avec sa croix ou le retour système.
 */
internal enum class SheetStyle(val topGapDp: Int) {
    PAGE(topGapDp = PAGE_TOP_GAP_DP),
    COVER(topGapDp = 0),
}

private const val PAGE_TOP_GAP_DP = 8
private const val PAGE_CORNER_DP = 20

/**
 * Une destination présentée en FEUILLE, pendant du `.sheet` / `.fullScreenCover` d'iOS (règle porteur 2026-10-27) :
 * l'écran qui l'ouvre reste dessous (une destination `dialog` ne le retire pas de la composition), la feuille
 * monte et redescend animée, le glissé vers le bas la ferme, le retour système aussi. La route, ses arguments et
 * ses liens profonds sont ceux d'un `composable` : un lien profond ouvre la feuille par-dessus la racine.
 *
 * [content] reçoit `dismiss`, à brancher sur la croix / le bouton de fin : il redescend la feuille avec son
 * animation PUIS dépile la destination. Un écran qui part ailleurs (`navigate { popUpTo }`) retire la feuille
 * sans animation de sortie, la navigation qui suit étant la transition.
 */
internal fun NavGraphBuilder.sheetComposable(
    route: String,
    navController: NavHostController,
    style: SheetStyle = SheetStyle.PAGE,
    arguments: List<NamedNavArgument> = emptyList(),
    deepLinks: List<NavDeepLink> = emptyList(),
    content: @Composable (entry: NavBackStackEntry, dismiss: () -> Unit) -> Unit,
) = dialog(
    route = route,
    arguments = arguments,
    deepLinks = deepLinks,
    dialogProperties = DialogProperties(
        dismissOnBackPress = false,
        dismissOnClickOutside = false,
        usePlatformDefaultWidth = false,
        decorFitsSystemWindows = false,
    ),
) { entry ->
    PresentedSheet(style = style, onClosed = { navController.popBackStack() }) { dismiss -> content(entry, dismiss) }
}

@Composable
internal fun PresentedSheet(
    style: SheetStyle,
    onClosed: () -> Unit,
    content: @Composable (dismiss: () -> Unit) -> Unit,
) {
    val surface = MeeshyTheme.tokens.backgroundPrimary
    when (style) {
        SheetStyle.PAGE -> PageSheet(surface, onClosed, content)
        SheetStyle.COVER -> CoverSheet(surface, onClosed, content)
    }
}

/**
 * `.sheet` : la feuille de Material (glissé vers le bas, scrim, retour système, animations d'entrée et de sortie
 * du composant). Les insets sont à ZÉRO côté composant : la feuille pose elle-même son cran de scrim sous la barre
 * d'état et déclare l'inset consommé, de sorte que l'écran dedans n'ajoute pas un second espace.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PageSheet(surface: Color, onClosed: () -> Unit, content: @Composable (dismiss: () -> Unit) -> Unit) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    val dismiss = remember(sheetState, onClosed) { { scope.launchHide(sheetState, onClosed) } }
    ModalBottomSheet(
        onDismissRequest = onClosed,
        sheetState = sheetState,
        shape = RectangleShape,
        containerColor = Color.Transparent,
        dragHandle = null,
        contentWindowInsets = { WindowInsets(0, 0, 0, 0) },
    ) {
        CompositionLocalProvider(LocalPresentedAsSheet provides true) {
            Column(Modifier.fillMaxSize()) {
                Spacer(Modifier.windowInsetsTopHeight(WindowInsets.statusBars))
                Spacer(Modifier.height(SheetStyle.PAGE.topGapDp.dp))
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = surface,
                    shape = RoundedCornerShape(topStart = PAGE_CORNER_DP.dp, topEnd = PAGE_CORNER_DP.dp),
                ) {
                    Box(Modifier.fillMaxSize().consumeWindowInsets(WindowInsets.statusBars)) { content(dismiss) }
                }
            }
        }
    }
}

/**
 * `.fullScreenCover` : plein écran qui monte du bas et redescend, sans glissé (iOS n'en offre pas), fermé par la
 * croix ou le retour système. La destination est déjà une fenêtre plein écran : aucune feuille Material dessus.
 */
@Composable
private fun CoverSheet(surface: Color, onClosed: () -> Unit, content: @Composable (dismiss: () -> Unit) -> Unit) {
    val visibility = remember { MutableTransitionState(false).apply { targetState = true } }
    val dismiss = remember(visibility) { { visibility.targetState = false } }
    LaunchedEffect(visibility) {
        snapshotFlow { visibility.isIdle && !visibility.currentState }.first { it }
        onClosed()
    }
    BackHandler(onBack = dismiss)
    AnimatedVisibility(
        visibleState = visibility,
        enter = slideInVertically(tween(COVER_MILLIS)) { it },
        exit = slideOutVertically(tween(COVER_MILLIS)) { it },
    ) {
        CompositionLocalProvider(LocalPresentedAsSheet provides true) {
            Box(Modifier.fillMaxSize().background(surface)) { content(dismiss) }
        }
    }
}

private const val COVER_MILLIS = 300

@OptIn(ExperimentalMaterial3Api::class)
private fun CoroutineScope.launchHide(state: SheetState, onClosed: () -> Unit) {
    launch { state.hide() }.invokeOnCompletion { if (!state.isVisible) onClosed() }
}
