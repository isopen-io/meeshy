package me.meeshy.app.stories

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalAccessibilityManager
import androidx.compose.ui.platform.testTag
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
import kotlinx.coroutines.delay
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.scene.SceneExportState
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

internal object SceneExportBandTiming {
    /** Le temps où l'issue reste à l'écran — allongé par le système pour qui lit à l'aide de TalkBack. */
    const val OUTCOME_MILLIS = 4_000L
}

internal const val SCENE_EXPORT_BAND_TAG = "scene-export-band"

/**
 * **Le bandeau de l'export** (#13897, comme le web). Pendant le bake ([fraction] non nul), une bande posée en bas porte la
 * progression et « Annuler » ; à la fin ([outcome]), la même bande dit l'issue — « Enregistré », « Partagé », ou l'échec
 * avec « Réessayer » — puis rend la main par [onOutcomeShown]. Elle vit dans une fenêtre qui ne prend ni le focus ni les
 * gestes : l'écran reste utilisable, le retour système lui appartient. [painting], la scène qu'on peint, voyage avec la
 * bande, à taille nulle.
 *
 * Une fois le rendu fini ([verifying]), la bande dit « Vérification… » sur une barre qui défile : la relecture du fichier
 * dure, et une barre pleine immobile laissait croire l'export bloqué (#14088).
 *
 * #13951 : la fenêtre du bandeau ne reçoit pas les encarts de l'écran — un `navigationBarsPadding()` posé dedans valait zéro
 * et la bande passait SOUS la barre de navigation. Les encarts se lisent donc chez l'HÔTE, puis se portent dans la fenêtre.
 */
@Composable
internal fun SceneExportBand(
    fraction: Float?,
    onCancel: () -> Unit,
    verifying: Boolean = false,
    outcome: SceneExportOutcome? = null,
    onRetry: () -> Unit = {},
    onOutcomeShown: () -> Unit = {},
    painting: (@Composable () -> Unit)? = null,
) {
    if (fraction == null && outcome == null) return
    val hostNavigation = WindowInsets.navigationBars
    if (fraction == null && outcome != null) OutcomeTimeout(outcome, onOutcomeShown)
    Popup(
        alignment = Alignment.BottomCenter,
        properties = PopupProperties(focusable = false, dismissOnBackPress = false, dismissOnClickOutside = false),
    ) {
        Column(
            modifier = Modifier.windowInsetsPadding(hostNavigation.union(WindowInsets.navigationBars)),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (fraction != null) {
                SceneExportProgressBand(fraction = fraction, verifying = verifying, onCancel = onCancel)
                if (painting != null) Box(Modifier.size(0.dp)) { painting() }
            } else if (outcome != null) {
                SceneExportOutcomeBand(outcome = outcome, onRetry = onRetry)
            }
        }
    }
}

@Composable
private fun OutcomeTimeout(outcome: SceneExportOutcome, onOutcomeShown: () -> Unit) {
    val accessibility = LocalAccessibilityManager.current
    val shown by rememberUpdatedState(onOutcomeShown)
    LaunchedEffect(outcome) {
        val millis = accessibility?.calculateRecommendedTimeoutMillis(
            originalTimeoutMillis = SceneExportBandTiming.OUTCOME_MILLIS,
            containsIcons = false,
            containsText = true,
            containsControls = outcome == SceneExportOutcome.FAILED,
        ) ?: SceneExportBandTiming.OUTCOME_MILLIS
        delay(millis)
        shown()
    }
}

@Composable
private fun SceneExportProgressBand(fraction: Float, verifying: Boolean, onCancel: () -> Unit) {
    val label = stringResource(if (verifying) R.string.stories_scene_export_verifying else R.string.stories_scene_export_in_progress)
    BandSurface {
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

@Composable
private fun SceneExportOutcomeBand(outcome: SceneExportOutcome, onRetry: () -> Unit) {
    val label = stringResource(
        when (outcome) {
            SceneExportOutcome.SAVED -> R.string.stories_scene_export_saved
            SceneExportOutcome.SHARED -> R.string.stories_scene_export_shared
            SceneExportOutcome.FAILED -> R.string.stories_scene_export_failed
        },
    )
    val failed = outcome == SceneExportOutcome.FAILED
    BandSurface {
        Text(
            text = label,
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier
                .weight(1f)
                .padding(vertical = MeeshySpacing.lg)
                .semantics { liveRegion = if (failed) LiveRegionMode.Assertive else LiveRegionMode.Polite },
        )
        if (failed) TextButton(onClick = onRetry) { Text(stringResource(R.string.stories_viewer_retry)) }
    }
}

@Composable
private fun BandSurface(content: @Composable RowScope.() -> Unit) {
    Surface(
        shape = RoundedCornerShape(BAND_RADIUS),
        color = MaterialTheme.colorScheme.surfaceVariant,
        tonalElevation = BAND_ELEVATION,
        shadowElevation = BAND_ELEVATION,
        modifier = Modifier
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md)
            .fillMaxWidth()
            .testTag(SCENE_EXPORT_BAND_TAG),
    ) {
        Row(
            modifier = Modifier.padding(start = MeeshySpacing.lg, end = MeeshySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            content = content,
        )
    }
}

private val BAND_RADIUS = 16.dp
private val BAND_ELEVATION = 6.dp
