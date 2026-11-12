package me.meeshy.ui.component.viewer

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
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

/**
 * Ce que l'application pose AU-DESSUS de toute visionneuse plein écran : la pastille de l'appel réduit (P18.8,
 * `docs/product/appels-vue-finale.md`). Une visionneuse est un `Dialog`, donc une fenêtre qui recouvre celle de
 * l'application et tout ce qu'elle porte ; ce qui doit rester atteignable se redessine DANS la fenêtre. `null` : rien à poser.
 * Le contenu fourni prend lui-même la barre d'état (`statusBarsPadding`), comme la pastille de l'application.
 */
public val LocalViewerTopOverlay: ProvidableCompositionLocal<(@Composable () -> Unit)?> =
    compositionLocalOf { null }

/**
 * La fenêtre d'une visionneuse plein écran ([viewerDialogProperties]). Quand l'hôte fournit [LocalViewerTopOverlay], il
 * se pose en haut et POUSSE la visionneuse dessous, exactement comme la pastille pousse la destination dans l'application :
 * posé par-dessus, il couvrirait ✕ et ⋯. La visionneuse reçoit alors la barre d'état déjà prise.
 */
@Composable
public fun ViewerDialog(
    onDismissRequest: () -> Unit,
    properties: DialogProperties,
    content: @Composable () -> Unit,
) {
    Dialog(onDismissRequest = onDismissRequest, properties = properties) {
        val overlay = LocalViewerTopOverlay.current
        Column(modifier = Modifier.fillMaxSize()) {
            overlay?.invoke()
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .then(if (overlay != null) Modifier.consumeWindowInsets(WindowInsets.statusBars) else Modifier),
            ) {
                content()
            }
        }
    }
}
