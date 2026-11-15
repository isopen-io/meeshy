package me.meeshy.ui.component.viewer

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.statusBars
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.window.DialogProperties
import me.meeshy.sdk.model.call.CallShareCapsuleMotion
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.presentation.MeeshyCoverDialog
import me.meeshy.ui.component.presentation.MeeshyCoverScope
import me.meeshy.ui.motion.rememberHeldPresence

/**
 * Ce que l'application pose AU-DESSUS de toute visionneuse plein écran : la pastille de l'appel réduit (P18.8,
 * `docs/product/appels-vue-finale.md`). Une visionneuse est un `Dialog`, donc une fenêtre qui recouvre celle de
 * l'application et tout ce qu'elle porte ; ce qui doit rester atteignable se redessine DANS la fenêtre. `null` : rien à poser.
 * Le contenu fourni prend lui-même la barre d'état (`statusBarsPadding`), comme la pastille de l'application.
 */
public val LocalViewerTopOverlay: ProvidableCompositionLocal<(@Composable () -> Unit)?> =
    compositionLocalOf { null }

/**
 * La fenêtre d'une visionneuse plein écran ([viewerDialogProperties]) : elle monte du bas et redescend
 * ([MeeshyCoverDialog]). Le contenu ferme par `dismiss()`, qui joue la sortie puis appelle [onDismissRequest] ; le retour
 * système fait de même. Quand l'hôte fournit [LocalViewerTopOverlay], il se pose en haut et POUSSE la visionneuse dessous,
 * exactement comme la pastille pousse la destination dans l'application : posé par-dessus, il couvrirait ✕ et ⋯. Il
 * entre et sort en fondu et échelle (les valeurs de la capsule d'appel), en peignant sa dernière forme pendant la sortie.
 */
@Composable
public fun ViewerDialog(
    onDismissRequest: () -> Unit,
    properties: DialogProperties,
    content: @Composable MeeshyCoverScope.() -> Unit,
) {
    MeeshyCoverDialog(onDismissRequest = onDismissRequest, properties = properties) {
        val overlay = rememberHeldPresence(LocalViewerTopOverlay.current)
        val reduce = LocalReduceMotion.current
        Column(modifier = Modifier.fillMaxSize()) {
            AnimatedVisibility(
                visibleState = overlay.visibleState,
                enter = overlayEnter(reduce),
                exit = overlayExit(reduce),
            ) {
                overlay.value?.invoke()
            }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .then(if (!overlay.isGone) Modifier.consumeWindowInsets(WindowInsets.statusBars) else Modifier),
            ) {
                content()
            }
        }
    }
}

private fun overlayEnter(reduce: Boolean): EnterTransition {
    val fade = fadeIn(tween(CallShareCapsuleMotion.windowFadeMillis(reduce, appearing = true)))
    return if (reduce) fade else fade + scaleIn(
        tween(CallShareCapsuleMotion.windowFadeMillis(reduce, appearing = true)),
        initialScale = CallShareCapsuleMotion.startScale(reduce),
    )
}

private fun overlayExit(reduce: Boolean): ExitTransition {
    val fade = fadeOut(tween(CallShareCapsuleMotion.windowFadeMillis(reduce, appearing = false)))
    return if (reduce) fade else fade + scaleOut(
        tween(CallShareCapsuleMotion.windowFadeMillis(reduce, appearing = false)),
        targetScale = CallShareCapsuleMotion.startScale(reduce),
    )
}
