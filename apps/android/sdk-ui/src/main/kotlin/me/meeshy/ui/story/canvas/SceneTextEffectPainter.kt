package me.meeshy.ui.story.canvas

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import me.meeshy.sdk.model.StoryTextEffect
import me.meeshy.sdk.model.StoryTextEffectInk

/**
 * Projette la table PURE des vingt-cinq effets ([StoryTextEffect]) sur une [Shadow] Compose pour un texte peint à
 * [fontSizePx] en [textColor] : le décalage et le flou sont des fractions de la taille de police RÉELLE, donc un texte
 * agrandi garde un halo net et proportionné. `null` pour [StoryTextEffect.NONE]. Site UNIQUE, lu par la scène, le
 * lecteur et le composeur.
 */
public fun StoryTextEffect.toComposeShadow(fontSizePx: Float, textColor: Color): Shadow? {
    val spec = shadow ?: return null
    val base = when (val ink = spec.ink) {
        StoryTextEffectInk.Text -> textColor
        StoryTextEffectInk.Dark -> Color.Black
        StoryTextEffectInk.Light -> Color.White
        is StoryTextEffectInk.Tint -> Color(0xFF000000L or (ink.hex.toLongOrNull(16) ?: 0L))
    }
    return Shadow(
        color = base.copy(alpha = spec.opacity.toFloat()),
        offset = Offset((spec.offsetXEm * fontSizePx).toFloat(), (spec.offsetYEm * fontSizePx).toFloat()),
        blurRadius = (spec.blurEm * fontSizePx).toFloat(),
    )
}
