package me.meeshy.app.stories

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import me.meeshy.sdk.model.StoryTextEffect
import me.meeshy.sdk.model.StoryTextEffectInk

/**
 * Projects the pure [StoryTextEffect] table onto a Compose [Shadow] for a text painted at
 * [fontSizePx] in [textColor] — the ONE place the composer preview and the viewer both read,
 * so the author and the reader agree on what glows (#4870). `null` for [StoryTextEffect.NONE]:
 * `TextStyle.shadow` accepts it and paints nothing.
 */
fun StoryTextEffect.composeShadow(fontSizePx: Float, textColor: Color): Shadow? {
    val spec = shadow ?: return null
    val base = when (val ink = spec.ink) {
        StoryTextEffectInk.Text -> textColor
        StoryTextEffectInk.Dark -> Color.Black
        StoryTextEffectInk.Light -> Color.White
        // La teinte d'un effet colore (2026-09-05) : une couleur PROPRE a
        // l'effet, opaque — l'opacite de la table s'applique en dessous,
        // comme pour les trois autres encres. Miroir de `hexToRgb` (web) et
        // `UIColor(effectHex:)` (iOS) : RVB seul, pas d'alpha dans le hex.
        is StoryTextEffectInk.Tint -> Color(0xFF000000L or ink.hex.toLong(16))
    }
    return Shadow(
        color = base.copy(alpha = spec.opacity.toFloat()),
        offset = Offset(
            (spec.offsetXEm * fontSizePx).toFloat(),
            (spec.offsetYEm * fontSizePx).toFloat(),
        ),
        blurRadius = (spec.blurEm * fontSizePx).toFloat(),
    )
}
