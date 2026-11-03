package me.meeshy.ui.component.game

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer

/** L'état d'un tampon d'Atlas. */
public enum class AtlasStampState {
    /** La langue est tamponnée : un échange dans les deux sens. */
    Stamped,

    /** Un sens manque encore : le cachet est dessiné, éteint, à moitié encré. */
    Pending,

    /** Une langue à découvrir : le contour en pointillé. */
    Undiscovered,
}

internal object AtlasStampPlan {
    const val PENDING_OPACITY: Float = 0.7f
    const val UNDISCOVERED_LABEL: String = "··"

    fun label(code: String): String = if (code.isEmpty()) UNDISCOVERED_LABEL else code.uppercase()

    fun usesTint(state: AtlasStampState): Boolean = state == AtlasStampState.Stamped

    fun opacity(state: AtlasStampState): Float = if (state == AtlasStampState.Pending) PENDING_OPACITY else 1f

    fun dashed(state: AtlasStampState): Boolean = state == AtlasStampState.Undiscovered
}

/**
 * Un tampon d'Atlas (miroir de `AtlasStampView`, iOS) : deux cercles, le code de la langue, la Signature à plat,
 * posé incliné de [tilt] degrés (la planche alterne −6 et 8). [tint] est l'encre de la langue ; [muted] la teinte
 * éteinte du tampon à moitié échangé ou à découvrir (contour en pointillé). [accessibilityLabel] nul : décoratif.
 */
@Composable
public fun AtlasStampView(
    code: String,
    tint: Color,
    muted: Color,
    modifier: Modifier = Modifier,
    state: AtlasStampState = AtlasStampState.Stamped,
    tilt: Float = -6f,
    accessibilityLabel: String? = null,
) {
    val measurer = rememberTextMeasurer()
    val typeFactor = rememberGameTypeScale().factor.coerceAtLeast(1f)
    val ink = if (AtlasStampPlan.usesTint(state)) tint else muted
    Canvas(
        modifier
            .aspectRatio(1f)
            .alpha(AtlasStampPlan.opacity(state))
            .gameAccessibility(accessibilityLabel),
    ) {
        val k = size.width / 72f
        withTransform({ scale(k, k, pivot = Offset.Zero) }) {
            rotate(tilt, pivot = Offset(36f, 36f)) {
                val dash = if (AtlasStampPlan.dashed(state)) PathEffect.dashPathEffect(floatArrayOf(4f, 4f)) else null
                drawCircle(ink, radius = 29f, center = Offset(36f, 36f), style = Stroke(width = 2.5f, pathEffect = dash))
                drawCircle(ink, radius = 23f, center = Offset(36f, 36f), style = Stroke(width = 1f))
                drawGameText(
                    measurer, AtlasStampPlan.label(code), Offset(36f, 38f), 15f * typeFactor, ink,
                    weight = FontWeight.ExtraBold, family = FontFamily.Default,
                )
                drawGameSignature(Offset(36f, 48f), 14f, ink, SignatureStyle.Flat, 120f)
            }
        }
    }
}
