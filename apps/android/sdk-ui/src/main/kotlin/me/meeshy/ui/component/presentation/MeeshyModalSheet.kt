package me.meeshy.ui.component.presentation

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * Ce que le contenu d'une [MeeshyModalSheet] peut faire en plus d'une colonne : [dismiss], la fermeture qui laisse la
 * feuille redescendre AVANT de rendre la main.
 */
@Stable
public class MeeshySheetScope internal constructor(
    column: ColumnScope,
    private val onDismissRequest: () -> Unit,
    private val leave: (then: () -> Unit) -> Unit,
) : ColumnScope by column {
    /**
     * Joue la descente de la feuille, puis appelle [then] UNE fois. Un second appel pendant la descente est ignoré ;
     * une descente interrompue (la feuille remonte) réarme la fermeture.
     */
    public fun dismiss(then: () -> Unit = onDismissRequest) {
        leave(then)
    }
}

/**
 * **La feuille SYSTÈME de Meeshy** : un `ModalBottomSheet` de Material dont la fermeture joue sa descente jusqu'au
 * bout. Retirée de la composition, une feuille Material disparaît d'un coup ; ici, un bouton ferme par
 * [MeeshySheetScope.dismiss] (`hide()` puis le rappel, une seule fois), et un hôte qui monte la feuille sur un état
 * l'enveloppe dans [MeeshySheetPresence] pour qu'elle redescende quand l'état repasse à null.
 *
 * Distincte de la feuille ancrée du kit (K15, `MeeshyAnchoredSheet`), qui laisse les feuilles système au système :
 * l'animation propre de la feuille Material est celle du composant, et ne se réduit pas.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
public fun MeeshyModalSheet(
    onDismissRequest: () -> Unit,
    modifier: Modifier = Modifier,
    sheetState: SheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    containerColor: Color = BottomSheetDefaults.ContainerColor,
    dragHandle: (@Composable () -> Unit)? = { BottomSheetDefaults.DragHandle() },
    contentWindowInsets: @Composable () -> WindowInsets = { BottomSheetDefaults.windowInsets },
    content: @Composable MeeshySheetScope.() -> Unit,
) {
    val scope = rememberCoroutineScope()
    val dismissRequested by rememberUpdatedState(onDismissRequest)
    val exit = remember(sheetState, scope) { SheetExit(sheetState, scope) }
    val departure = LocalSheetDeparture.current
    if (departure != null) {
        DisposableEffect(departure) {
            departure.sheets += 1
            onDispose { departure.sheets -= 1 }
        }
        LaunchedEffect(departure.departing) {
            if (!departure.departing) return@LaunchedEffect
            sheetState.hide()
            departure.left()
        }
    }
    ModalBottomSheet(
        onDismissRequest = { if (departure?.departing != true) dismissRequested() },
        modifier = modifier,
        sheetState = sheetState,
        containerColor = containerColor,
        dragHandle = dragHandle,
        contentWindowInsets = contentWindowInsets,
    ) {
        val sheetScope = remember(this, exit) { MeeshySheetScope(this, { dismissRequested() }, exit::leaveThen) }
        CompositionLocalProvider(LocalSheetDeparture provides null) { sheetScope.content() }
    }
}

/**
 * L'hôte d'une feuille montée sur un état (`pending?.let`, `if (open)`) : il garde le dernier [item] non nul et, quand
 * l'item repasse à null, laisse la [MeeshyModalSheet] descendante redescendre SANS rappeler son `onDismissRequest`
 * (l'état est déjà fermé), puis la démonte. Un contenu sans feuille Meeshy part à l'image suivante, comme un `if`.
 */
@Composable
public fun <T : Any> MeeshySheetPresence(item: T?, content: @Composable (T) -> Unit) {
    val departure = remember { SheetDeparture() }
    var held by remember { mutableStateOf(item) }
    var generation by remember { mutableIntStateOf(0) }
    LaunchedEffect(item) {
        when {
            item != null -> {
                if (departure.departing) generation += 1
                departure.departing = false
                held = item
            }
            departure.sheets == 0 -> held = null
            else -> {
                departure.onLeft = { held = null; departure.departing = false }
                departure.departing = true
            }
        }
    }
    val shown = item ?: held ?: return
    key(generation) {
        CompositionLocalProvider(LocalSheetDeparture provides departure) { content(shown) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
private class SheetExit(private val state: SheetState, private val scope: CoroutineScope) {
    private var leaving = false

    fun leaveThen(then: () -> Unit) {
        if (leaving) return
        leaving = true
        scope.launch { state.hide() }.invokeOnCompletion { cause ->
            leaving = false
            if (cause == null) then()
        }
    }
}

@Stable
internal class SheetDeparture {
    var departing by mutableStateOf(false)
    var sheets = 0
    var onLeft: () -> Unit = {}

    fun left() = onLeft()
}

internal val LocalSheetDeparture = staticCompositionLocalOf<SheetDeparture?> { null }
