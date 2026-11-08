package me.meeshy.ui.component.bubble

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.BubbleSecondaryPanel
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

/**
 * Le panneau SECONDAIRE sous le texte (iOS `BubbleSecondaryContent`) : le séparateur trait-point-trait à la couleur
 * de la langue (traits à 0,4), le drapeau et le nom de la langue, puis la traduction — plus discrète que le texte
 * principal (opacité intense) — dont mentions, hashtags et liens sont teintés. Réduire les animations : fondu seul.
 */
@Composable
internal fun BubbleSecondaryContent(
    panel: BubbleSecondaryPanel?,
    onColor: Color,
    tint: Color,
    decor: BubbleTextDecor,
    linksActive: Boolean,
    modifier: Modifier = Modifier,
) {
    val reduceMotion = LocalReduceMotion.current
    AnimatedVisibility(
        visible = panel != null,
        enter = if (reduceMotion) fadeIn() else fadeIn() + expandVertically(),
        exit = if (reduceMotion) fadeOut() else fadeOut() + shrinkVertically(),
        modifier = modifier,
    ) {
        if (panel != null) SecondaryPanelBody(panel, onColor, tint, decor, linksActive)
    }
}

@Composable
private fun SecondaryPanelBody(
    panel: BubbleSecondaryPanel,
    onColor: Color,
    tint: Color,
    decor: BubbleTextDecor,
    linksActive: Boolean,
) {
    val langColor = panel.colorHex?.let { hexColor(it, onColor) } ?: onColor
    Column(modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.xs)) {
        SecondarySeparator(langColor)
        Column(
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            modifier = Modifier
                .fillMaxWidth()
                .background(langColor.copy(alpha = MeeshyOpacity.light))
                .padding(vertical = MeeshySpacing.sm),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs), verticalAlignment = Alignment.CenterVertically) {
                panel.flag?.let { Text(text = it, style = MaterialTheme.typography.labelSmall) }
                panel.name?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = langColor,
                    )
                }
            }
            RichMessageText(
                text = panel.text,
                color = onColor.copy(alpha = MeeshyOpacity.intense),
                style = MaterialTheme.typography.bodySmall,
                linkColor = tint,
                mentionColor = tint,
                hashtagColor = tint,
                mentionDisplayNames = decor.mentionDisplayNames,
                trackedLinks = decor.trackedLinks.takeIf { linksActive },
            )
        }
    }
}

/** Trait, point, trait : la signature de la langue du panneau. */
@Composable
private fun SecondarySeparator(langColor: Color) {
    val line = langColor.copy(alpha = BubbleSecondaryPanel.SEPARATOR_LINE_ALPHA)
    Row(
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Box(Modifier.weight(1f).height(1.dp).background(line))
        Box(Modifier.size(4.dp).clip(CircleShape).background(langColor))
        Box(Modifier.weight(1f).height(1.dp).background(line))
    }
}
