package me.meeshy.app.stories

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerObjectTiming
import me.meeshy.ui.theme.MeeshySpacing
import java.util.Locale

/**
 * La fenêtre de l'objet posé, en DÉBUT et FIN (#13904, iOS `ComposerObjectTimingControls`) : sa famille, la phrase « De 1,0 s
 * à 3,0 s », une glissière par borne, et le retour à « Visible du début à la fin ». Le geste se lit en direct et ne
 * s'écrit qu'au lâcher — un cran d'historique par réglage, pas un par image.
 */
@Composable
internal fun ObjectTimeControls(
    window: ComposerObjectTiming,
    family: SceneObjectFamily,
    slideDurationSeconds: Double,
    onWindow: (ComposerObjectTiming) -> Unit,
) {
    val slide = maxOf(1.0, slideDurationSeconds)
    var live by remember(window) { mutableStateOf(window) }
    val phrase = live.end?.let { end -> stringResource(R.string.composer_object_editor_window, seconds(live.start), seconds(end)) }
        ?: stringResource(R.string.composer_object_editor_window_permanent, seconds(live.start))
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        Text(familyWord(family), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
        Text(phrase, style = MaterialTheme.typography.bodyMedium)
        TimeSlider(stringResource(R.string.composer_object_editor_start), live.start, slide, { live = live.moved(it, slide) }) { onWindow(live) }
        live.end?.let { end ->
            TimeSlider(stringResource(R.string.composer_object_editor_end), end, slide, { live = live.trimmingEnd(it, slide) }) { onWindow(live) }
        }
        PermanentSwitch(live.isPermanent) { permanent ->
            onWindow(if (permanent) live.madePermanent else live.trimmingEnd(slide, slide))
        }
    }
}

@Composable
private fun TimeSlider(title: String, value: Double, slide: Double, onChange: (Double) -> Unit, onDone: () -> Unit) {
    val shown = seconds(value)
    Column {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(title, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
            Text(shown, style = MaterialTheme.typography.bodySmall)
        }
        Slider(
            value = value.toFloat().coerceIn(0f, slide.toFloat()),
            onValueChange = { onChange(it.toDouble()) },
            onValueChangeFinished = onDone,
            valueRange = 0f..slide.toFloat(),
            modifier = Modifier.fillMaxWidth().semantics {
                contentDescription = title
                stateDescription = shown
            },
        )
    }
}

@Composable
private fun PermanentSwitch(permanent: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .toggleable(value = permanent, role = Role.Switch, onValueChange = onChange),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(stringResource(R.string.composer_object_editor_permanent), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        Spacer(Modifier.width(MeeshySpacing.xs))
        Switch(checked = permanent, onCheckedChange = null)
    }
}

/** « 1.5 s », comme iOS `ComposerObjectEditorCopy.seconds` — au dixième, séparateur de la langue de l'appareil. */
private fun seconds(value: Double): String = String.format(Locale.getDefault(), "%.1f s", value)

/** Le mot de la famille, celui de la frise iOS (`ComposerSceneFriseCopy`). */
@Composable
internal fun familyWord(family: SceneObjectFamily): String = stringResource(
    when (family) {
        SceneObjectFamily.TEXT -> R.string.composer_family_text
        SceneObjectFamily.STICKER -> R.string.stories_composer_add_sticker
        SceneObjectFamily.IMAGE -> R.string.composer_frise_media
        SceneObjectFamily.VIDEO -> R.string.composer_frise_video
        SceneObjectFamily.PLACE -> R.string.composer_frise_place
        SceneObjectFamily.SOUND -> R.string.composer_frise_sound
    },
)
