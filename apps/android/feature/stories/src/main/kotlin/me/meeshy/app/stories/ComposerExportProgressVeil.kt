package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R

/**
 * **Le voile de progression du bake** (miroir de `ComposerExportProgressVeil` iOS, #4996) : `fraction == null` ⇒ aucun
 * voile. Il intercepte tout geste — la scène ne se modifie pas pendant qu'on la grave — et offre la sortie que le bake,
 * long, exige : annuler. Annoncé comme une valeur qui se met à jour.
 */
@Composable
internal fun ComposerExportProgressVeil(fraction: Float?, onCancel: () -> Unit, modifier: Modifier = Modifier) {
    if (fraction == null) return
    val label = stringResource(R.string.stories_scene_export_in_progress)
    Box(
        modifier = modifier
            .background(Color.Black.copy(alpha = VEIL_ALPHA))
            .pointerInput(Unit) { detectTapGestures { } },
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.surfaceVariant,
            modifier = Modifier.semantics(mergeDescendants = true) {
                contentDescription = label
                liveRegion = LiveRegionMode.Polite
                progressBarRangeInfo = ProgressBarRangeInfo(fraction, 0f..1f)
            },
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                LinearProgressIndicator(progress = { fraction }, modifier = Modifier.width(180.dp))
                Text(label, style = MaterialTheme.typography.titleSmall)
                TextButton(onClick = onCancel) { Text(stringResource(R.string.stories_composer_cancel)) }
            }
        }
    }
}

private const val VEIL_ALPHA = 0.55f
