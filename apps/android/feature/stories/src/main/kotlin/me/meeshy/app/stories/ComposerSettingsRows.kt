package me.meeshy.app.stories

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.PersonRemove
import androidx.compose.material.icons.filled.Public
import androidx.compose.material3.Icon
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.StoryBackgroundPalette
import me.meeshy.sdk.model.StoryBackgroundValue
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.ui.theme.hexColor

/**
 * La pastille d'audience posée sur la scène — l'icône du mode et son mot, un tap ouvre la feuille
 * d'audience (jamais un menu : un menu liste des choix, pas leurs conséquences). Le nom accessible
 * reste « Audience » et la valeur est annoncée comme valeur.
 */
@Composable
internal fun AudiencePill(
    visibility: StoryVisibility,
    count: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val name = stringResource(R.string.composer_socle_audience)
    val label = stringResource(visibility.labelRes())
    val shown = if (visibility.requiresUserSelection && count > 0) "$label ($count)" else label
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable(onClick = onClick)
            .heightIn(min = 44.dp)
            .padding(horizontal = 14.dp)
            .semantics(mergeDescendants = true) {
                contentDescription = name
                stateDescription = shown
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(visibility.icon(), contentDescription = null, modifier = Modifier.size(18.dp))
        Text(shown, style = MaterialTheme.typography.labelLarge, maxLines = 1)
    }
}

internal fun StoryVisibility.icon(): ImageVector = when (this) {
    StoryVisibility.PUBLIC -> Icons.Filled.Public
    StoryVisibility.FRIENDS -> Icons.Filled.People
    StoryVisibility.COMMUNITY -> Icons.Filled.Groups
    StoryVisibility.ONLY -> Icons.Filled.PersonAdd
    StoryVisibility.EXCEPT -> Icons.Filled.PersonRemove
    StoryVisibility.PRIVATE -> Icons.Filled.Lock
}

internal fun StoryVisibility.labelRes(): Int = when (this) {
    StoryVisibility.PUBLIC -> R.string.stories_visibility_public
    StoryVisibility.FRIENDS -> R.string.stories_visibility_friends
    StoryVisibility.COMMUNITY -> R.string.stories_visibility_community
    StoryVisibility.PRIVATE -> R.string.stories_visibility_private
    StoryVisibility.ONLY -> R.string.stories_visibility_only
    StoryVisibility.EXCEPT -> R.string.stories_visibility_except
}

/**
 * The Effets drawer's background picker: a "None" chip (clears the backdrop), one
 * tappable swatch per [StoryBackgroundPalette] preset (solids and gradients), and a
 * "random pastel" swatch. Selecting hands the chosen [StoryBackgroundValue] straight
 * to the deck, which serialises it to `effects.background`; the reader paints it over
 * its accent→black fallback. Per-slide; the palette + parse rules live in the model,
 * so this stays glue. The random pastel is minted here (UI-side randomness) via the
 * pure [StoryBackgroundPalette.randomPastel].
 */
@Composable
internal fun BackgroundRow(
    selected: StoryBackgroundValue?,
    onSelect: (StoryBackgroundValue?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val label = stringResource(R.string.stories_composer_background)
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelMedium)
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            item {
                FilterChip(
                    selected = selected == null,
                    onClick = { onSelect(null) },
                    label = { Text(stringResource(R.string.stories_composer_background_none)) },
                )
            }
            items(StoryBackgroundPalette.presets()) { preset ->
                BackgroundSwatch(
                    brush = backgroundSwatchBrush(preset),
                    isSelected = preset == selected,
                    onClick = { onSelect(preset) },
                )
            }
            item {
                val randomLabel = stringResource(R.string.stories_composer_background_random)
                FilterChip(
                    selected = false,
                    onClick = { onSelect(StoryBackgroundPalette.randomPastel()) },
                    label = { Text(randomLabel) },
                )
            }
        }
    }
}

/** One tappable background swatch — a rounded chip painted with [brush], ringed when [isSelected]. */
@Composable
internal fun BackgroundSwatch(
    brush: Brush,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val ring = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant
    Box(
        modifier = modifier
            .size(32.dp)
            .clip(CircleShape)
            .background(brush)
            .border(BorderStroke(if (isSelected) 2.dp else 1.dp, ring), CircleShape)
            .clickable(onClick = onClick),
    )
}

/**
 * The paint for a preview swatch — a solid fill or a two-colour gradient — reusing the
 * same `hexColor` SSOT the reader paints with, so the swatch matches what publishes.
 */
internal fun backgroundSwatchBrush(value: StoryBackgroundValue): Brush = when (value) {
    is StoryBackgroundValue.Hex -> SolidColor(hexColor(value.hex))
    is StoryBackgroundValue.Gradient -> Brush.linearGradient(
        listOf(hexColor(value.start), hexColor(value.end)),
    )
}

/**
 * The Effets drawer's photo-filter picker: a "None" chip plus one chip per
 * [StoryFilter] preset (selecting toggles the slide's filter), and — only while a
 * filter is active — a strength slider. All per-slide; the deck holds the state and
 * the colour math lives in [StoryFilterMatrix], so this stays glue.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun FilterRow(
    selected: StoryFilter?,
    intensity: Float,
    onSelect: (StoryFilter?) -> Unit,
    onIntensityChange: (Float) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            item {
                FilterChip(
                    selected = selected == null,
                    onClick = { onSelect(null) },
                    label = { Text(stringResource(R.string.stories_composer_filter_none)) },
                )
            }
            items(StoryFilter.entries) { filter ->
                FilterChip(
                    selected = filter == selected,
                    onClick = { onSelect(filter) },
                    label = { Text(stringResource(filter.labelRes())) },
                )
            }
        }
        if (selected != null) {
            val intensityLabel = stringResource(R.string.stories_composer_filter_intensity)
            Slider(
                value = intensity,
                onValueChange = onIntensityChange,
                valueRange = 0f..1f,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = intensityLabel },
            )
        }
    }
}

/**
 * The per-slide duration control in the Effets band — a labelled slider that pins how
 * long the selected slide stays on screen (parity with iOS's timeline "pin duration").
 * The slider spans the practical [DURATION_SLIDER_MIN_SECONDS]..[DURATION_SLIDER_MAX_SECONDS]
 * range; the value it emits is bounded to the iOS `[2, 600]`s range by the pure
 * `StoryDurationPin` in the ViewModel, and rides to the reader as `effects.timelineDuration`.
 * Rounded to whole seconds so the pin is a clean value and the label reads simply.
 */
@Composable
internal fun DurationRow(
    seconds: Double,
    onSecondsChange: (Double) -> Unit,
    modifier: Modifier = Modifier,
) {
    val whole = seconds.roundToInt()
    val label = stringResource(R.string.stories_composer_slide_duration)
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(label, style = MaterialTheme.typography.labelMedium)
            Text(
                stringResource(R.string.stories_composer_slide_duration_value, whole),
                style = MaterialTheme.typography.labelMedium,
            )
        }
        Slider(
            value = whole.toFloat().coerceIn(DURATION_SLIDER_MIN_SECONDS, DURATION_SLIDER_MAX_SECONDS),
            onValueChange = { onSecondsChange(it.roundToInt().toDouble()) },
            valueRange = DURATION_SLIDER_MIN_SECONDS..DURATION_SLIDER_MAX_SECONDS,
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = label },
        )
    }
}

/** Practical lower bound of the duration slider (matches the model's `StoryDurationPin.MIN_SECONDS`). */
internal const val DURATION_SLIDER_MIN_SECONDS: Float = 2f

/** Practical upper bound of the duration slider — most story slides live well under a minute. */
internal const val DURATION_SLIDER_MAX_SECONDS: Float = 60f

internal fun StoryFilter.labelRes(): Int = when (this) {
    StoryFilter.VINTAGE -> R.string.stories_composer_filter_vintage
    StoryFilter.BW -> R.string.stories_composer_filter_bw
    StoryFilter.WARM -> R.string.stories_composer_filter_warm
    StoryFilter.COOL -> R.string.stories_composer_filter_cool
    StoryFilter.DRAMATIC -> R.string.stories_composer_filter_dramatic
    StoryFilter.VIVID -> R.string.stories_composer_filter_vivid
    StoryFilter.FADE -> R.string.stories_composer_filter_fade
    StoryFilter.CHROME -> R.string.stories_composer_filter_chrome
}
