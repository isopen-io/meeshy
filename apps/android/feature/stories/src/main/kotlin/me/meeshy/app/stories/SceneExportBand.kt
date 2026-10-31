package me.meeshy.app.stories

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import me.meeshy.feature.stories.R
import me.meeshy.ui.theme.MeeshySpacing

/**
 * **Le bandeau de l'export** (#13897, comme le web) : `fraction == null` ⇒ rien. Pendant le bake, une bande posée en bas
 * porte la progression et « Annuler », dans une fenêtre qui ne prend ni le focus ni les gestes : l'écran reste utilisable,
 * le retour système lui appartient. [painting], la scène qu'on peint, voyage avec la bande, à taille nulle — elle
 * s'enregistre dans son calque sans jamais se montrer ni s'étendre sur l'écran.
 */
@Composable
internal fun SceneExportBand(fraction: Float?, onCancel: () -> Unit, painting: (@Composable () -> Unit)? = null) {
    if (fraction == null) return
    Popup(
        alignment = Alignment.BottomCenter,
        properties = PopupProperties(focusable = false, dismissOnBackPress = false, dismissOnClickOutside = false),
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            SceneExportProgressBand(fraction = fraction, onCancel = onCancel)
            if (painting != null) Box(Modifier.size(0.dp)) { painting() }
        }
    }
}

@Composable
private fun SceneExportProgressBand(fraction: Float, onCancel: () -> Unit) {
    val label = stringResource(R.string.stories_scene_export_in_progress)
    Surface(
        shape = RoundedCornerShape(BAND_RADIUS),
        color = MaterialTheme.colorScheme.surfaceVariant,
        tonalElevation = BAND_ELEVATION,
        shadowElevation = BAND_ELEVATION,
        modifier = Modifier
            .navigationBarsPadding()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md)
            .fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(start = MeeshySpacing.lg, end = MeeshySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(vertical = MeeshySpacing.md)
                    .semantics(mergeDescendants = true) {
                        contentDescription = label
                        liveRegion = LiveRegionMode.Polite
                        progressBarRangeInfo = ProgressBarRangeInfo(fraction, 0f..1f)
                    },
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            ) {
                Text(label, style = MaterialTheme.typography.titleSmall)
                LinearProgressIndicator(progress = { fraction }, modifier = Modifier.fillMaxWidth())
            }
            TextButton(onClick = onCancel) { Text(stringResource(R.string.stories_composer_cancel)) }
        }
    }
}

private val BAND_RADIUS = 16.dp
private val BAND_ELEVATION = 6.dp
