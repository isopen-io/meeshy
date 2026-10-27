package me.meeshy.app.conversations

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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.InviteLanguageShare
import me.meeshy.sdk.model.LanguageData
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor
import java.text.NumberFormat

/**
 * Une barre de proportions par langue et sa légende — chaque langue écrite dans SA langue. Miroir de
 * `LanguageShareBar` (iOS). Une légende ne montre un pourcentage que si la part est MESURÉE. La barre se
 * déploie à l'apparition (sauf mouvement réduit).
 */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
internal fun ShareLinkLanguageShareBar(shares: List<InviteLanguageShare>, modifier: Modifier = Modifier) {
    val visible = remember(shares) { InviteLanguageShare.visible(shares) }
    val reduceMotion = LocalReduceMotion.current
    var shown by remember { mutableStateOf(reduceMotion) }
    LaunchedEffect(Unit) { shown = true }
    val reveal by animateFloatAsState(if (shown) 1f else 0f, tween(450), label = "languageBar")
    val percent = remember { NumberFormat.getPercentInstance() }
    val labels = remember(visible) {
        visible.map { share ->
            val name = if (share.code.isEmpty()) "…" else LanguageData.autonym(share.code)
            name to (if (share.isMeasured) percent.format(share.fraction) else null)
        }
    }
    val spoken = remember(labels) { labels.joinToString(", ") { (name, pct) -> listOfNotNull(name, pct).joinToString(" ") } }
    Column(
        modifier = modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = spoken },
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().height(10.dp).clip(CircleShape).graphicsLayer { scaleX = reveal; transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0f, 0.5f) },
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            visible.forEach { share ->
                Box(Modifier.weight(share.fraction.toFloat().coerceAtLeast(0.01f)).height(10.dp).background(colorOf(share)))
            }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            visible.forEachIndexed { index, share ->
                Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(8.dp).clip(CircleShape).background(colorOf(share)))
                    Text(labels[index].first, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = MeeshyTheme.tokens.textPrimary, maxLines = 1)
                    labels[index].second?.let {
                        Text(it, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = MeeshyTheme.tokens.textPrimary, maxLines = 1)
                    }
                }
            }
        }
    }
}

private fun colorOf(share: InviteLanguageShare) =
    if (share.code.isEmpty()) MeeshyPalette.Neutral400 else hexColor(LanguageData.colorHex(share.code), MeeshyPalette.Neutral400)
