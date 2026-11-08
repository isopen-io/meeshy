package me.meeshy.ui.component.bubble

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.model.BubbleInk
import me.meeshy.sdk.model.BubbleSkinLaw
import me.meeshy.sdk.model.BubbleSkinSpec
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.hexColor

/**
 * La peau des bulles d'une conversation, posée par le fil (port d'iOS `EnvironmentValues.bubbleSkin`).
 * Valeur immuable et égalitaire : un changement d'apparence la remplace et repeint les bulles ; sans
 * changement, la même instance est relue et rien ne se recompose.
 */
@Immutable
public data class BubbleSkin(public val spec: BubbleSkinSpec) {
    public val sentFill: Color = hexColor(spec.sentFillHex, MeeshyPalette.Indigo500)
    public val ink: Color = if (spec.sentInk == BubbleInk.BLACK) Color.Black else Color.White

    public fun ink(alpha: Float): Color = ink.copy(alpha = alpha)

    public companion object {
        public val Brand: BubbleSkin = BubbleSkin(BubbleSkinSpec.BRAND)

        public fun of(personalAccentHex: String?): BubbleSkin =
            if (personalAccentHex == null) Brand else BubbleSkin(BubbleSkinSpec.resolve(personalAccentHex))
    }
}

public val LocalBubbleSkin = compositionLocalOf { BubbleSkin.Brand }

/** Le fond OPAQUE et le liseré d'une bulle reçue, depuis la loi du modèle. */
internal class ReceivedBubbleTint(val fill: Color, val stroke: Color) {
    companion object {
        fun of(senderColorHex: String?, isDark: Boolean): ReceivedBubbleTint {
            val accent = BubbleSkinLaw.receivedAccentHex(senderColorHex)
            return ReceivedBubbleTint(
                fill = hexColor(BubbleSkinLaw.receivedFillHex(accent, isDark), MeeshyPalette.Indigo50),
                stroke = hexColor(accent, MeeshyPalette.Indigo500).copy(alpha = BubbleSkinLaw.receivedStrokeAlpha(isDark)),
            )
        }
    }
}
