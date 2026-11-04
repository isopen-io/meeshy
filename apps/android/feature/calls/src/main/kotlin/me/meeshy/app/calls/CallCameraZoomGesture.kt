package me.meeshy.app.calls

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import java.util.Locale
import me.meeshy.feature.calls.R
import me.meeshy.sdk.call.camera.CallCameraZoom
import me.meeshy.sdk.model.call.camera.CameraZoomAdjust
import me.meeshy.sdk.model.call.camera.CameraZoomPolicy

/**
 * L'élément ajustable de TalkBack pour le zoom de ma caméra (iOS `CallCameraZoomAccessibilityElement`) :
 * incrémenter / décrémenter passe au cran suivant / précédent et annonce le facteur. Rien tant que la
 * caméra n'est pas zoomable.
 */
@Composable
internal fun Modifier.callCameraZoomAdjustable(zoom: CallCameraZoom): Modifier {
    val state by zoom.state.collectAsState()
    val profile = state.profile ?: return this
    val locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()
    val label = stringResource(R.string.call_zoom_label)
    val current = CameraZoomAdjust.currentIndex(profile, state.displayFactor)
    val value = CameraZoomPolicy.label(state.displayFactor, locale)
    return semantics {
        contentDescription = label
        stateDescription = value
        progressBarRangeInfo = ProgressBarRangeInfo(current.toFloat(), 0f..profile.stops.lastIndex.toFloat(), (profile.stops.size - 2).coerceAtLeast(0))
        setProgress { requested ->
            val step = CameraZoomAdjust.step(CameraZoomAdjust.currentIndex(profile, zoom.state.value.displayFactor), requested)
            if (step != null) zoom.step(step)
            step != null
        }
    }
}
