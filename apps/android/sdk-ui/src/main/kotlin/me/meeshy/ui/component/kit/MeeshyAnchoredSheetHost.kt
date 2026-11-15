package me.meeshy.ui.component.kit

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion

/**
 * **Pose une feuille ancrée par-dessus son hôte** (K15) : à poser dans la boîte de l'hôte, après son contenu. L'entrée et
 * la sortie sont une translation depuis le bas avec fondu, immédiates sous « Réduire les animations » ; le contenu n'est
 * monté que feuille ouverte, et démonté après la sortie. [open] est ce que la feuille montre : `null`, rien n'est rendu et
 * la place publiée est nulle — dès l'instant où l'hôte referme, pas à la fin de la sortie, pour que la réduction du
 * contenu reparte avec elle. Une autre valeur remplace la feuille (la sortante part, l'entrante vient) et rend sa place à
 * l'hôte sans trou.
 *
 * Les paramètres sont ceux de [MeeshyAnchoredSheet] ; [content] et [trailing] reçoivent ce que la feuille montre.
 * L'hôte lit [MeeshyAnchoredSheetState.footprintPx] de [state].
 *
 * Pendant iOS : `.meeshyAnchoredSheet(item:)`.
 */
@Composable
public fun <T : Any> MeeshyAnchoredSheetHost(
    open: T?,
    onDismissRequest: () -> Unit,
    modifier: Modifier = Modifier,
    title: String? = null,
    accessibilityLabel: String? = null,
    height: MeeshyAnchoredSheetHeight = MeeshyAnchoredSheetHeight.Content,
    maximumFraction: Float = MeeshyAnchoredSheetMetrics.MAXIMUM_FRACTION,
    showsHandle: Boolean = true,
    isDragDismissEnabled: Boolean = true,
    closeLabel: String? = stringResource(R.string.kit_anchored_sheet_close),
    surface: MeeshyAnchoredSheetSurface = MeeshyAnchoredSheetSurface.Theme,
    outside: MeeshyAnchoredSheetOutside = MeeshyAnchoredSheetOutside.Dismisses,
    scrim: Boolean = false,
    maxWidth: Dp? = null,
    state: MeeshyAnchoredSheetState = rememberMeeshyAnchoredSheetState(),
    trailing: (@Composable (T) -> Unit)? = null,
    content: @Composable (T) -> Unit,
) {
    val reduceMotion = LocalReduceMotion.current
    val motion = remember(reduceMotion) { MeeshyAnchoredSheetMetrics.motion(reduceMotion) }
    LaunchedEffect(open == null) { if (open == null) state.clear() }
    AnimatedContent(
        targetState = open,
        modifier = modifier.fillMaxSize(),
        transitionSpec = {
            val slide = if (motion.isImmediate) {
                EnterTransition.None togetherWith ExitTransition.None
            } else {
                val spec = tween<Float>(durationMillis = motion.durationMilliseconds, easing = FastOutSlowInEasing)
                val slideSpec = tween<IntOffset>(durationMillis = motion.durationMilliseconds, easing = FastOutSlowInEasing)
                (slideInVertically(slideSpec) { it } + fadeIn(spec)) togetherWith (slideOutVertically(slideSpec) { it } + fadeOut(spec))
            }
            slide using SizeTransform(clip = false)
        },
        label = "meeshyAnchoredSheetHost",
    ) { item ->
        if (item != null) {
            val slot: (@Composable () -> Unit)? = if (trailing != null) ({ trailing(item) }) else null
            MeeshyAnchoredSheet(
                onDismissRequest = onDismissRequest,
                title = title,
                accessibilityLabel = accessibilityLabel,
                height = height,
                maximumFraction = maximumFraction,
                showsHandle = showsHandle,
                isDragDismissEnabled = isDragDismissEnabled,
                closeLabel = closeLabel,
                surface = surface,
                outside = outside,
                scrim = scrim,
                maxWidth = maxWidth,
                state = state,
                trailing = slot,
                content = { content(item) },
            )
        }
    }
}

/**
 * **La place d'une feuille SYSTÈME de hauteur fixe** (`ModalBottomSheet`), publiée comme celle d'une feuille ancrée : rien
 * ne s'y dessine et rien ne s'y touche. L'hôte réduit son contenu au-dessus d'elle sans que la feuille soit la sienne. À
 * poser dans la boîte de l'hôte tant que la feuille système est ouverte.
 *
 * Pendant iOS : `MeeshyAnchoredSheetPlaceholder`.
 */
@Composable
public fun MeeshyAnchoredSheetPlaceholder(
    height: MeeshyAnchoredSheetHeight,
    state: MeeshyAnchoredSheetState,
    modifier: Modifier = Modifier,
    maximumFraction: Float = MeeshyAnchoredSheetMetrics.MAXIMUM_FRACTION,
) {
    val density = LocalDensity.current.density
    val owner = remember { Any() }
    DisposableEffect(state, owner) { onDispose { state.release(owner) } }
    BoxWithConstraints(modifier.fillMaxSize().clearAndSetSemantics {}) {
        val rest = MeeshyAnchoredSheetMetrics.height(height, content = 0f, available = maxHeight.value, maximumFraction = maximumFraction)
        LaunchedEffect(rest) { state.publish(owner, rest * density) }
    }
}
