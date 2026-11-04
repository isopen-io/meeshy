package me.meeshy.ui.component.chrome

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.rememberTextMeasurer
import me.meeshy.sdk.model.appearance.ConversationBackgroundPlan
import me.meeshy.ui.theme.MeeshyTheme

private const val DECOR_ALPHA = 0.12f
private val DARK_STOPS = listOf(Color(0xFF0F0C29), Color(0xFF24243E))
private val LIGHT_BASE = Color.White

/**
 * Le fond Signature d'une conversation (miroir de `ConversationAnimatedBackground`, iOS) : un substrat OPAQUE teinté
 * de l'accent, la composition du type, les surcouches de chiffrement et de drapeaux, le tout à 0,12 d'opacité. STATIQUE
 * (décision produit iOS : batterie) ; entièrement décoratif, donc muet pour TalkBack. [accent] et [secondary] viennent
 * de l'appelant (palette de la conversation).
 */
@Composable
public fun ConversationAnimatedBackground(
    plan: ConversationBackgroundPlan,
    accent: Color,
    secondary: Color,
    modifier: Modifier = Modifier,
) {
    val dark = MeeshyTheme.isDark
    val measurer = rememberTextMeasurer()
    Canvas(modifier.fillMaxSize().clipToBounds().clearAndSetSemantics { }) {
        val base = if (dark) DARK_STOPS.first() else LIGHT_BASE
        drawRect(base)
        drawRect(
            Brush.linearGradient(
                if (dark) listOf(DARK_STOPS[0], accent.copy(alpha = 0.12f), DARK_STOPS[1])
                else listOf(accent.copy(alpha = 0.08f), LIGHT_BASE, accent.copy(alpha = 0.05f)),
            ),
        )
    }
    Canvas(modifier.fillMaxSize().clipToBounds().graphicsLayer { alpha = DECOR_ALPHA }.clearAndSetSemantics { }) {
        drawSignatureBase(plan, accent, secondary)
        if (plan.showsEncryptionOverlay) drawEncryptionOverlay(plan.encryption, accent)
        if (plan.showsMultilingualOverlay) drawFlagsOverlay(plan.flags, measurer)
    }
}
