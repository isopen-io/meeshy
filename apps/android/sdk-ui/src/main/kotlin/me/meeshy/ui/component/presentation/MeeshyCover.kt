package me.meeshy.ui.component.presentation

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import kotlinx.coroutines.flow.first
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.motion.meeshyContentTransform
import me.meeshy.ui.motion.meeshyEnter
import me.meeshy.ui.motion.meeshyExit

/** La durée de la montée et de la descente d'un plein écran (iOS `.fullScreenCover`). */
public const val COVER_MILLIS: Int = 300

/** Le plein écran qui monte du bas en [COVER_MILLIS], ou le fondu court sous « Réduire les animations ». */
public fun meeshyCoverEnter(reduce: Boolean): EnterTransition =
    meeshyEnter(reduce, slideInVertically(tween(COVER_MILLIS)) { it })

/** Le plein écran qui redescend, ou le fondu court sous « Réduire les animations ». */
public fun meeshyCoverExit(reduce: Boolean): ExitTransition =
    meeshyExit(reduce, slideOutVertically(tween(COVER_MILLIS)) { it })

/**
 * Ce que le contenu d'un [MeeshyCoverDialog] peut faire : [dismiss], la fermeture qui laisse le plein écran redescendre
 * AVANT de rendre la main.
 */
@Stable
public class MeeshyCoverScope internal constructor(private val leave: () -> Unit) {
    /** Joue la sortie, puis appelle `onDismissRequest` une fois ; un second appel pendant la sortie est ignoré. */
    public fun dismiss() {
        leave()
    }
}

/**
 * **Le plein écran Meeshy dans sa propre fenêtre** (visionneuses) : il monte du bas et redescend, comme CoverSheet. La
 * fenêtre perd son animation système, si bien que seule la montée du contenu joue. Le retour système et
 * [MeeshyCoverScope.dismiss] jouent la sortie ; [onDismissRequest] n'est appelé qu'une fois la sortie au repos, et une
 * seule fois. `dismissOnBackPress = false` dans [properties] laisse le retour système sans effet. Un hôte qui retire le
 * dialogue de lui-même le coupe sans sortie.
 */
@Composable
public fun MeeshyCoverDialog(
    onDismissRequest: () -> Unit,
    properties: DialogProperties = DialogProperties(usePlatformDefaultWidth = false),
    enter: EnterTransition = meeshyCoverEnter(LocalReduceMotion.current),
    exit: ExitTransition = meeshyCoverExit(LocalReduceMotion.current),
    content: @Composable MeeshyCoverScope.() -> Unit,
) {
    val visibility = remember { MutableTransitionState(false).apply { targetState = true } }
    val scope = remember(visibility) { MeeshyCoverScope { visibility.targetState = false } }
    val dismissRequested by rememberUpdatedState(onDismissRequest)
    LaunchedEffect(visibility) {
        snapshotFlow { visibility.isIdle && !visibility.currentState && !visibility.targetState }.first { it }
        dismissRequested()
    }
    Dialog(onDismissRequest = scope::dismiss, properties = properties) {
        val window = (LocalView.current.parent as? DialogWindowProvider)?.window
        SideEffect { window?.setWindowAnimations(0) }
        BackHandler(enabled = properties.dismissOnBackPress, onBack = scope::dismiss)
        AnimatedVisibility(visibleState = visibility, enter = enter, exit = exit) {
            scope.content()
        }
    }
}

/**
 * Un plein écran posé DANS la fenêtre courante sur une valeur : il monte du bas quand [value] apparaît, redescend quand
 * elle repasse à null en peignant la dernière valeur, et se fond d'une valeur à l'autre. Le retour système appelle
 * [onBack] tant qu'une valeur est montrée ; sans [onBack], le retour n'est pas écouté.
 */
@Composable
public fun <T : Any> MeeshyCoverHost(value: T?, onBack: (() -> Unit)? = null, content: @Composable (T) -> Unit) {
    val reduce = LocalReduceMotion.current
    BackHandler(enabled = value != null && onBack != null) { onBack?.invoke() }
    AnimatedContent(
        targetState = value,
        transitionSpec = { coverTransform(initialState, targetState, reduce) },
        label = "MeeshyCoverHost",
    ) { shown ->
        if (shown != null) content(shown)
    }
}

private fun coverTransform(from: Any?, to: Any?, reduce: Boolean): ContentTransform {
    val transform = when {
        from == null -> meeshyCoverEnter(reduce) togetherWith ExitTransition.None
        to == null -> EnterTransition.None togetherWith meeshyCoverExit(reduce)
        else -> meeshyContentTransform(reduce, fadeIn(tween(COVER_MILLIS)) togetherWith fadeOut(tween(COVER_MILLIS)))
    }
    return ContentTransform(
        targetContentEnter = transform.targetContentEnter,
        initialContentExit = transform.initialContentExit,
        targetContentZIndex = if (to == null) -1f else 0f,
        sizeTransform = null,
    )
}
