package me.meeshy.ui.component.viewer

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

/**
 * Ce que l'application pose AU-DESSUS de toute visionneuse plein écran, en haut au centre : la pastille de l'appel réduit
 * (P18.8, `docs/product/appels-vue-finale.md`). Une visionneuse est un `Dialog`, donc une fenêtre qui recouvre celle de
 * l'application et tout ce qu'elle porte ; ce qui doit rester atteignable se redessine DANS la fenêtre. `null` : rien à poser.
 */
public val LocalViewerTopOverlay: ProvidableCompositionLocal<(@Composable () -> Unit)?> =
    compositionLocalOf { null }

/**
 * La fenêtre d'une visionneuse plein écran ([viewerDialogProperties]) : son [content], puis par-dessus lui
 * [LocalViewerTopOverlay] quand l'hôte en fournit un.
 */
@Composable
public fun ViewerDialog(
    onDismissRequest: () -> Unit,
    properties: DialogProperties,
    content: @Composable () -> Unit,
) {
    Dialog(onDismissRequest = onDismissRequest, properties = properties) {
        Box(modifier = Modifier.fillMaxSize()) {
            content()
            LocalViewerTopOverlay.current?.let { overlay ->
                Box(modifier = Modifier.align(Alignment.TopCenter)) { overlay() }
            }
        }
    }
}
