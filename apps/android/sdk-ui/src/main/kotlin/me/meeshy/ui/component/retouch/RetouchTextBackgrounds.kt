package me.meeshy.ui.component.retouch

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.composer.look.ComposerRetouchTextBoard
import me.meeshy.sdk.model.scene.StoryTextBackground
import me.meeshy.ui.R
import me.meeshy.ui.theme.hexColor

/**
 * **LE FOND DU TEXTE** (iOS `StoryTextEditProfile.bakedIntoMedia`, #12754) : les douze fonds du composer, dans
 * son ordre — aucun, Verre, puis les pleins. Une pastille de 48 dp par fond, bouton radio pour TalkBack ; le fond
 * choisi est cerclé, et « Aucun » porte le libellé d'iOS (`StoryTextBackgroundPresets.label`).
 */
@Composable
internal fun RetouchTextBackgroundRow(current: StoryTextBackground, onChoose: (StoryTextBackground) -> Unit) {
    val groupLabel = stringResource(R.string.retouch_text_background)
    Row(
        Modifier
            .fillMaxWidth()
            .selectableGroup()
            .semantics { contentDescription = groupLabel }
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        ComposerRetouchTextBoard.BACKGROUNDS.forEach { option ->
            val label = stringResource(backgroundName(option))
            val chosen = option == current
            Box(
                Modifier
                    .size(48.dp)
                    .selectable(selected = chosen, role = Role.RadioButton) { onChoose(option) }
                    .semantics { contentDescription = label },
                contentAlignment = Alignment.Center,
            ) {
                Swatch(option, chosen)
            }
        }
    }
}

@Composable
private fun Swatch(option: StoryTextBackground, chosen: Boolean) {
    val ring = Modifier.size(28.dp).clip(CircleShape)
    val rim = Modifier.border(if (chosen) 3.dp else 1.dp, Color.White, CircleShape)
    when (option) {
        is StoryTextBackground.Solid -> Box(ring.background(hexColor(option.hex, Color.Black)).then(rim))
        is StoryTextBackground.Glass -> Box(ring.background(Color.White.copy(alpha = 0.28f)).then(rim))
        StoryTextBackground.None -> Canvas(ring.then(rim)) {
            drawLine(Color.White, Offset(size.width * 0.2f, size.height * 0.8f), Offset(size.width * 0.8f, size.height * 0.2f), strokeWidth = 2.dp.toPx())
        }
    }
}

private fun backgroundName(option: StoryTextBackground): Int = when (option) {
    StoryTextBackground.None -> R.string.retouch_effect_none
    is StoryTextBackground.Glass -> R.string.retouch_text_bg_glass
    is StoryTextBackground.Solid -> when (option.hex.uppercase()) {
        "000000" -> R.string.retouch_text_bg_black
        "000000A6" -> R.string.retouch_text_bg_black65
        "FFFFFF" -> R.string.retouch_text_bg_white
        "FFFFFFA6" -> R.string.retouch_text_bg_white65
        "6366F1" -> R.string.retouch_text_bg_indigo
        "6366F1A6" -> R.string.retouch_text_bg_indigo65
        "F472B6" -> R.string.retouch_text_bg_pink
        "34D399" -> R.string.retouch_text_bg_green
        "FBBF24" -> R.string.retouch_text_bg_amber
        else -> R.string.retouch_text_bg_red
    }
}
