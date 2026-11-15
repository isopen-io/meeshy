package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.ConflictTier
import me.meeshy.sdk.model.HealthTier
import me.meeshy.sdk.model.ParticipantProfileView
import me.meeshy.sdk.model.TraitBar
import me.meeshy.sdk.model.TraitCategory
import me.meeshy.sdk.model.TraitCategoryView
import me.meeshy.sdk.model.TraitTier
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun FlowChips(content: @Composable () -> Unit) {
    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        content()
    }
}

@Composable
internal fun LabelChip(text: String, tint: Color) {
    Text(
        text,
        style = MaterialTheme.typography.bodySmall,
        color = MeeshyTheme.tokens.textPrimary,
        fontWeight = FontWeight.Medium,
        modifier = Modifier
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(tint.copy(alpha = 0.14f))
            .padding(horizontal = MeeshySpacing.md, vertical = 6.dp),
    )
}

@Composable
internal fun LevelChip(text: String, tint: Color) {
    Text(
        text,
        style = MaterialTheme.typography.labelMedium,
        color = tint,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier
            .clip(RoundedCornerShape(MeeshyRadius.md))
            .background(tint.copy(alpha = 0.12f))
            .padding(horizontal = MeeshySpacing.md, vertical = 6.dp),
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ParticipantPersonaCard(profile: ParticipantProfileView, accentColor: Color) {
    val seedColor = hexColor(DynamicColorGenerator.colorForName(profile.name))
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = MeeshySpacing.sm)
            .height(IntrinsicSize.Min)
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(MeeshyTheme.tokens.backgroundSecondary),
    ) {
        Box(
            modifier = Modifier
                .width(4.dp)
                .fillMaxHeight()
                .background(seedColor),
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(MeeshySpacing.md),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            ) {
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .clip(CircleShape)
                        .background(seedColor),
                )
                Text(
                    profile.name,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MeeshyTheme.tokens.textPrimary,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f),
                )
                profile.confidencePercent?.let {
                    Text(
                        stringResource(R.string.conversation_analysis_persona_confidence, it),
                        style = MaterialTheme.typography.labelSmall,
                        color = MeeshyTheme.tokens.textMuted,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier
                            .clip(RoundedCornerShape(MeeshyRadius.md))
                            .background(accentColor.copy(alpha = 0.10f))
                            .padding(horizontal = MeeshySpacing.sm, vertical = 2.dp),
                    )
                }
            }

            profile.personaSummary?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                    fontStyle = FontStyle.Italic,
                )
            }

            if (profile.tone != null || profile.vocabularyLevel != null) {
                FlowChips {
                    profile.tone?.let { LabelChip(it, accentColor) }
                    profile.vocabularyLevel?.let { LabelChip(it, accentColor) }
                }
            }

            profile.categories.forEach { TraitCategoryBars(it, accentColor) }

            if (profile.catchphrases.isNotEmpty()) {
                Text(
                    profile.catchphrases.joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textMuted,
                    fontStyle = FontStyle.Italic,
                )
            }

            if (profile.topics.isNotEmpty() || profile.commonEmojis.isNotEmpty()) {
                FlowChips {
                    profile.topics.forEach { LabelChip(it, MeeshyPalette.Info) }
                    if (profile.commonEmojis.isNotEmpty()) {
                        Text(
                            profile.commonEmojis.joinToString(""),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TraitCategoryBars(category: TraitCategoryView, accentColor: Color) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            stringResource(traitCategoryLabel(category.category)),
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyTheme.tokens.textMuted,
            fontWeight = FontWeight.Bold,
        )
        category.bars.forEach { TraitBarRow(it, accentColor) }
    }
}

@Composable
private fun TraitBarRow(bar: TraitBar, accentColor: Color) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            bar.label,
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyTheme.tokens.textSecondary,
            maxLines = 1,
            modifier = Modifier.width(84.dp),
        )
        Box(
            modifier = Modifier
                .weight(1f)
                .height(4.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(accentColor.copy(alpha = 0.10f)),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(bar.score / 100f)
                    .height(4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(accentColor.copy(alpha = 0.7f)),
            )
        }
        Text(
            "${bar.score}",
            style = MaterialTheme.typography.labelSmall,
            color = traitTierColor(bar.tier, accentColor),
            fontWeight = FontWeight.Bold,
            modifier = Modifier.width(24.dp),
        )
    }
}

internal fun healthTierColor(tier: HealthTier?): Color = when (tier) {
    HealthTier.GOOD -> MeeshyPalette.Success
    HealthTier.FAIR -> MeeshyPalette.Warning
    HealthTier.POOR -> MeeshyPalette.Error
    null -> MeeshyPalette.Info
}

internal fun conflictTierColor(tier: ConflictTier?): Color = when (tier) {
    ConflictTier.HIGH -> MeeshyPalette.Error
    ConflictTier.MEDIUM -> MeeshyPalette.Warning
    ConflictTier.LOW -> MeeshyPalette.Success
    null -> MeeshyPalette.Info
}

private fun traitTierColor(tier: TraitTier, accentColor: Color): Color = when (tier) {
    TraitTier.GOOD -> MeeshyPalette.Success
    TraitTier.MID -> accentColor
    TraitTier.LOW -> MeeshyPalette.Neutral400
}

private fun traitCategoryLabel(category: TraitCategory): Int = when (category) {
    TraitCategory.COMMUNICATION -> R.string.conversation_analysis_trait_communication
    TraitCategory.PERSONALITY -> R.string.conversation_analysis_trait_personality
    TraitCategory.INTERPERSONAL -> R.string.conversation_analysis_trait_interpersonal
    TraitCategory.EMOTIONAL -> R.string.conversation_analysis_trait_emotional
}
