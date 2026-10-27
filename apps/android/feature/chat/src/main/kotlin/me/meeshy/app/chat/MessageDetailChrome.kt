package me.meeshy.app.chat

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed

import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import kotlinx.coroutines.delay
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** « 14:30 » dans la langue de l'appareil : l'heure d'une version ou du premier lecteur. */
internal fun hourMinute(epochMillis: Long?): String =
    epochMillis?.let {
        DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withZone(ZoneId.systemDefault()).format(Instant.ofEpochMilli(it))
    }.orEmpty()

/** Entrée en cascade d'une ligne de fiche : fondu et léger glissement, décalés par rang (plafonnés). */
internal fun Modifier.staggeredAppear(index: Int): Modifier = composed {
    val progress = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        delay((index.coerceAtMost(8) * 30).toLong())
        progress.animateTo(1f, spring(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessMediumLow))
    }
    graphicsLayer {
        alpha = progress.value
        translationY = (1f - progress.value) * 16.dp.toPx()
    }
}

/** Bandeau de tête des fiches : icône, titre, détail et pastille de compte (miroir de `MessageDetailTimelineBanner`). */
@Composable
internal fun MessageDetailBanner(
    icon: ImageVector,
    title: String,
    detail: String,
    accent: Color,
    modifier: Modifier = Modifier,
    count: String? = null,
) {
    val shape = RoundedCornerShape(MeeshyRadius.smPlus)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(accent.copy(alpha = 0.06f))
            .border(0.5.dp, accent.copy(alpha = 0.15f), shape)
            .padding(MeeshySpacing.md)
            .semantics(mergeDescendants = true) { contentDescription = "$title, $detail" },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = accent, modifier = Modifier.size(18.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = MeeshyTheme.tokens.textPrimary)
            if (detail.isNotBlank()) {
                Text(detail, style = MaterialTheme.typography.labelSmall, color = MeeshyTheme.tokens.textMuted)
            }
        }
        if (count != null) {
            Text(
                count,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = accent,
                modifier = Modifier
                    .clearAndSetSemantics { }
                    .clip(CircleShape)
                    .background(accent.copy(alpha = 0.15f))
                    .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xxs),
            )
        }
    }
}

/** État vide des fiches : glyphe discret et phrase centrée (miroir de `MessageDetailEmptyState`). */
@Composable
internal fun MessageDetailEmpty(icon: ImageVector, text: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = MeeshySpacing.xxxl)
            .semantics(mergeDescendants = true) { contentDescription = text },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(icon, contentDescription = null, tint = MeeshyTheme.tokens.textMuted.copy(alpha = 0.4f), modifier = Modifier.size(28.dp))
        Text(text, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textMuted, textAlign = TextAlign.Center)
    }
}

