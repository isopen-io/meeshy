package me.meeshy.app.stories

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.scene.SceneExportState
import me.meeshy.ui.component.export.EXPORT_BAND_TAG
import me.meeshy.ui.component.export.ExportBandSurface
import me.meeshy.ui.component.export.ExportBandWindow
import me.meeshy.ui.theme.MeeshySpacing

/** Ce que la fin d'un export dit à l'auteur, comme le web et iOS : enregistré, partagé, ou l'échec qu'on peut retenter. */
internal enum class SceneExportOutcome {
    SAVED,
    SHARED,
    FAILED,
    ;

    companion object {
        /** La fin que [state] porte ; `null` tant que l'export tourne ou n'a pas commencé. */
        fun of(state: SceneExportState): SceneExportOutcome? = when (state) {
            SceneExportState.Saved -> SAVED
            is SceneExportState.Ready -> SHARED
            SceneExportState.Failed -> FAILED
            SceneExportState.Idle, is SceneExportState.Running -> null
        }
    }
}

internal const val SCENE_EXPORT_BAND_TAG = EXPORT_BAND_TAG

/**
 * **Le bandeau de l'export** (#13897, comme le web). Pendant le bake ([fraction] non nul), une bande posée en bas porte la
 * progression et « Annuler ». Elle vit dans la fenêtre du bandeau d'export ([ExportBandWindow]), qui ne prend ni le focus
 * ni les gestes et se tient au-dessus de la barre de navigation (#13951). [painting], la scène qu'on peint, voyage avec la
 * bande, à taille nulle. La FIN de l'export ne se dit pas ici : l'annonceur de l'application la porte, dans la même
 * surface, et elle survit au compositeur (#14557).
 *
 * Une fois le rendu fini ([verifying]), la bande dit « Vérification… » sur une barre qui défile : la relecture du fichier
 * dure, et une barre pleine immobile laissait croire l'export bloqué (#14088).
 */
@Composable
internal fun SceneExportBand(
    fraction: Float?,
    onCancel: () -> Unit,
    verifying: Boolean = false,
    painting: (@Composable () -> Unit)? = null,
) {
    if (fraction == null) return
    ExportBandWindow {
        SceneExportProgressBand(fraction = fraction, verifying = verifying, onCancel = onCancel)
        if (painting != null) Box(Modifier.size(0.dp)) { painting() }
    }
}

@Composable
private fun SceneExportProgressBand(fraction: Float, verifying: Boolean, onCancel: () -> Unit) {
    val label = stringResource(if (verifying) R.string.stories_scene_export_verifying else R.string.stories_scene_export_in_progress)
    ExportBandSurface {
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(vertical = MeeshySpacing.md)
                .semantics(mergeDescendants = true) {
                    contentDescription = label
                    liveRegion = LiveRegionMode.Polite
                    progressBarRangeInfo = if (verifying) ProgressBarRangeInfo.Indeterminate else ProgressBarRangeInfo(fraction, 0f..1f)
                },
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Text(label, style = MaterialTheme.typography.titleSmall)
            if (verifying) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            } else {
                LinearProgressIndicator(progress = { fraction }, modifier = Modifier.fillMaxWidth())
            }
        }
        TextButton(onClick = onCancel) { Text(stringResource(R.string.stories_composer_cancel)) }
    }
}
