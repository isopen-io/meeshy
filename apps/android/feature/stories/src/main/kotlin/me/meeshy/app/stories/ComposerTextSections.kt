package me.meeshy.app.stories

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.width
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import java.util.Locale
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.scene.StoryTextFrame
import me.meeshy.sdk.model.scene.StoryTextFrameShape
import me.meeshy.sdk.model.scene.StoryTextLanguage
import me.meeshy.sdk.model.scene.StoryTextOutline
import me.meeshy.ui.haptics.rememberMeeshyHaptics

/**
 * Les gestes des trois sections que la colonne droite sert en plus de celles de la rangée : cadre, bordure, langue
 * (iOS `TextEditTool.frame / border / language`). Chaque lambda part vers un réducteur testé ; [publishLanguage] est
 * la langue que porte un texte dont l'auteur n'a rien choisi, pour que la pastille juste soit déjà allumée.
 */
internal class TextSectionIntents(
    val onFrameShape: (StoryTextFrameShape) -> Unit = {},
    val onFramePadding: (Float) -> Unit = {},
    val onFrameBorder: (Float) -> Unit = {},
    val onFrameColor: (String) -> Unit = {},
    val onOutlineWidth: (Float) -> Unit = {},
    val onOutlineColor: (String) -> Unit = {},
    val onLanguage: (String) -> Unit = {},
    val publishLanguage: String? = null,
)

internal fun StoryTextFrameShape.labelRes(): Int = when (this) {
    StoryTextFrameShape.NONE -> R.string.stories_composer_bg_none
    StoryTextFrameShape.ROUNDED -> R.string.composer_text_frame_rounded
    StoryTextFrameShape.PILL -> R.string.composer_text_frame_pill
    StoryTextFrameShape.RECTANGLE -> R.string.composer_text_frame_rectangle
    StoryTextFrameShape.DIAMOND -> R.string.composer_text_frame_diamond
    StoryTextFrameShape.CLOUD -> R.string.composer_text_frame_cloud
    StoryTextFrameShape.SPEECH -> R.string.composer_text_frame_speech
}

/** Cadre : la forme, la marge (×0…3) puis le liseré (0…12) et sa couleur — l'ordre d'iOS `frameOptions`. */
@Composable
internal fun TextFrameSection(frame: StoryTextFrame, intents: TextSectionIntents) {
    val haptics = rememberMeeshyHaptics()
    StoryTextFrameShape.offered.forEach { shape ->
        FilterChip(
            selected = frame.shape == shape,
            onClick = {
                haptics.light()
                intents.onFrameShape(shape)
            },
            label = { Text(stringResource(shape.labelRes())) },
        )
    }
    val padding = stringResource(R.string.composer_column_text_frame)
    ValueSlider(
        label = padding,
        value = frame.resolvedPaddingScale,
        range = 0f..StoryTextFrame.MAX_PADDING,
        steps = 29,
        shown = "×%.1f".format(Locale.ROOT, frame.resolvedPaddingScale),
        onChange = intents.onFramePadding,
    )
    ValueSlider(
        label = stringResource(R.string.stories_composer_outline),
        value = frame.borderWidth,
        range = 0f..StoryTextFrame.MAX_BORDER,
        steps = 23,
        shown = "%.1f".format(Locale.ROOT, frame.borderWidth),
        onChange = intents.onFrameBorder,
    )
    STORY_TEXT_COLORS.forEach { hex ->
        ColorSwatch(hex = hex, selected = frame.borderColor.equals(hex, ignoreCase = true), onClick = {
            haptics.light()
            intents.onFrameColor(hex)
        })
    }
}

/** Bordure : le contour des glyphes, curseur continu 0…12 puis la palette (iOS `borderOptions`). */
@Composable
internal fun TextBorderSection(outline: StoryTextOutline, intents: TextSectionIntents) {
    val haptics = rememberMeeshyHaptics()
    ValueSlider(
        label = stringResource(R.string.stories_composer_outline),
        value = outline.width,
        range = 0f..StoryTextOutline.MAX_WIDTH,
        steps = 23,
        shown = "%.1f".format(Locale.ROOT, outline.width),
        onChange = intents.onOutlineWidth,
    )
    STORY_TEXT_COLORS.forEach { hex ->
        ColorSwatch(hex = hex, selected = outline.color.equals(hex, ignoreCase = true), onClick = {
            haptics.light()
            intents.onOutlineColor(hex)
        })
    }
}

/** Langue : la langue dans laquelle ce texte est ÉCRIT — la base de toute traduction (iOS `languageOptions`). */
@Composable
internal fun TextLanguageSection(sourceLanguage: String?, intents: TextSectionIntents) {
    val haptics = rememberMeeshyHaptics()
    val effective = StoryTextLanguage.normalised(sourceLanguage ?: intents.publishLanguage)
    StoryTextLanguage.choices(sourceLanguage ?: intents.publishLanguage).forEach { code ->
        val selected = effective == code
        val name = Locale.forLanguageTag(code).getDisplayName(Locale.getDefault()).ifBlank { code }
        FilterChip(
            selected = selected,
            onClick = {
                haptics.light()
                intents.onLanguage(code)
            },
            label = { Text(code.uppercase(Locale.ROOT)) },
            modifier = Modifier.semantics { contentDescription = name },
        )
    }
}

@Composable
private fun ValueSlider(
    label: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    steps: Int,
    shown: String,
    onChange: (Float) -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Slider(
            value = value.coerceIn(range),
            onValueChange = onChange,
            valueRange = range,
            steps = steps,
            modifier = Modifier.width(132.dp).semantics {
                contentDescription = label
                stateDescription = shown
            },
        )
        Text(shown, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
