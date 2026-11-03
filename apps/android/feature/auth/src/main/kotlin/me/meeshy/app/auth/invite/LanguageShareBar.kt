package me.meeshy.app.auth.invite

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.InviteLanguageShare
import me.meeshy.sdk.model.LanguageShareLegend
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

/**
 * Une barre de proportions par langue (capsule de 10 dp, six segments au plus) et sa légende en
 * grille adaptative de 140 dp. Le nom (autonyme) et le pourcentage sont DEUX textes, pour que
 * l'arabe ne réordonne pas « % 7 ». Miroir de `LanguageShareBar` (iOS).
 */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
internal fun LanguageShareBar(shares: List<InviteLanguageShare>, isDark: Boolean, modifier: Modifier = Modifier) {
    val locale = LocalConfiguration.current.locales[0]
    val legend = remember(shares, locale) { LanguageShareLegend.from(shares, locale) }
    val reduceMotion = LocalReduceMotion.current
    var shown by remember { mutableStateOf(reduceMotion) }
    LaunchedEffect(Unit) { shown = true }
    val reveal by animateFloatAsState(if (shown) 1f else 0f, tween(if (reduceMotion) 0 else 450), label = "languageBar")
    Column(
        modifier = modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = legend.accessibilitySummary },
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().height(10.dp).clip(CircleShape)
                .graphicsLayer { scaleX = reveal; transformOrigin = TransformOrigin(0f, 0.5f) },
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            legend.entries.forEach { entry ->
                Box(Modifier.weight(entry.fraction.toFloat().coerceAtLeast(0.01f)).height(10.dp).background(segmentColor(entry.colorHex)))
            }
        }
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            legend.entries.forEach { entry ->
                Row(
                    modifier = Modifier.widthIn(min = 140.dp),
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(8.dp).clip(CircleShape).background(segmentColor(entry.colorHex)))
                    Text(entry.name, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = InviteInk.title(isDark), maxLines = 1)
                    entry.percentLabel?.let {
                        Text(it, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = InviteInk.title(isDark), maxLines = 1)
                    }
                }
            }
        }
    }
}

private fun segmentColor(hex: String?) = hex?.let { hexColor(it, MeeshyPalette.Neutral400) } ?: MeeshyPalette.Neutral400
