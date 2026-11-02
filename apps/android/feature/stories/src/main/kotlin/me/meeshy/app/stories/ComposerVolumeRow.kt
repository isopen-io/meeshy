package me.meeshy.app.stories

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import me.meeshy.feature.stories.R
import me.meeshy.ui.theme.MeeshySpacing

internal const val COMPOSER_VOLUME_TAG = "composer-volume"

/** Le pourcentage affiché d'un niveau sonore, celui que lit TalkBack : « 40 % ». */
internal fun volumePercent(volume: Float): String = "${(volume * 100).roundToInt()} %"

/**
 * Le niveau d'un son ou d'une vidéo posés, de 0 à 100 % comme sur iOS : le curseur écrit la valeur à chaque image, et
 * la valeur se LIT à côté de lui ; [trailing] pose ce qui le suit (Muet d'une vidéo).
 */
@Composable
internal fun ComposerVolumeRow(volume: Float, onVolume: (Float) -> Unit, trailing: @Composable RowScope.() -> Unit = {}) {
    val label = stringResource(R.string.composer_edit_volume)
    val percent = volumePercent(volume)
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Slider(
            value = volume,
            onValueChange = onVolume,
            valueRange = 0f..1f,
            colors = SliderDefaults.colors(thumbColor = MaterialTheme.colorScheme.primary, activeTrackColor = MaterialTheme.colorScheme.primary),
            modifier = Modifier.weight(1f).defaultMinSize(minHeight = 48.dp).testTag(COMPOSER_VOLUME_TAG).semantics {
                contentDescription = label
                stateDescription = percent
            },
        )
        Text(
            text = percent,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.End,
            modifier = Modifier.widthIn(min = 48.dp),
        )
        trailing()
    }
}
