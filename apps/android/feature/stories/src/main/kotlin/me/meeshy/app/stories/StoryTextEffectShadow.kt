package me.meeshy.app.stories

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import me.meeshy.sdk.model.StoryTextEffect

/**
 * Projects the pure [StoryTextEffect] table onto a Compose [Shadow] for a text painted at
 * [fontSizePx] in [textColor] — the ONE place the composer preview and the viewer both read,
 * so the author and the reader agree on what glows (#4870). `null` for [StoryTextEffect.NONE]:
 * `TextStyle.shadow` accepts it and paints nothing.
 */
fun StoryTextEffect.composeShadow(fontSizePx: Float, textColor: Color): Shadow? {
    val spec = shadow ?: return null
    val base = if (spec.usesTextColor) textColor else Color.Black
    return Shadow(
        color = base.copy(alpha = spec.opacity.toFloat()),
        offset = Offset(
            (spec.offsetXEm * fontSizePx).toFloat(),
            (spec.offsetYEm * fontSizePx).toFloat(),
        ),
        blurRadius = (spec.blurEm * fontSizePx).toFloat(),
    )
}
