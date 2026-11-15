package me.meeshy.app.stories

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.scene.CanvasViewportZoomPolicy
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons

/**
 * Le zoom du viewport de la scène (pincement à trois doigts), tenu par l'hôte pour que la barre du haut se masque tant que
 * la scène est zoomée (iOS `isCanvasZoomed`). C'est un état de VUE : il n'entre ni dans le brouillon ni dans l'historique.
 */
@Stable
internal class ComposerViewportZoom {
    var scale by mutableFloatStateOf(1f)
        private set

    val zoomed: Boolean get() = CanvasViewportZoomPolicy.isZoomed(scale)

    fun set(value: Float) {
        scale = value
    }

    fun reset() {
        scale = 1f
    }
}

@Composable
internal fun rememberComposerViewportZoom(): ComposerViewportZoom = remember { ComposerViewportZoom() }

/** Le bouton qui remet la scène à l'échelle 1, posé dans son coin haut tant qu'elle est zoomée. */
@Composable
internal fun ViewportZoomResetButton(zoom: ComposerViewportZoom, modifier: Modifier = Modifier) {
    if (!zoom.zoomed) return
    val haptics = rememberMeeshyHaptics()
    SceneRoundButton(
        icon = MeeshyIcons.Undo,
        label = stringResource(R.string.story_timeline_transport_zoomReset),
        onClick = { haptics.light(); zoom.reset() },
        modifier = modifier,
    )
}
