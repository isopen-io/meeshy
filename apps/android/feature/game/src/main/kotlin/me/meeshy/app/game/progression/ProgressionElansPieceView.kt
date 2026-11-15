package me.meeshy.app.game.progression

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.engagement.EngagementAxisFamily
import me.meeshy.sdk.model.game.engagement.EngagementElanProgress
import me.meeshy.sdk.model.game.progression.ElansLine
import me.meeshy.sdk.model.game.progression.ProgressionElansPiece
import me.meeshy.ui.component.game.GameBounceButton
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * LA PIÈCE DES ÉLANS, en tête de leur fiche (miroir de `ProgressionElansHero`, iOS) : le titre (« Tes élans » ou
 * « Élan ×2 »), les familles ACTIVES de la fenêtre servie — chacune rebondit au toucher et ouvre ses précisions —, puis
 * la phrase qui dit ce qui porte l'élan. Rien n'y est animé hors du rebond, déjà figé sous « réduire les animations ».
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ElansPiece(elan: EngagementElanProgress?, modifier: Modifier = Modifier) {
    val piece = remember(elan) { ProgressionElansPiece.of(elan) }
    val tokens = MeeshyTheme.tokens
    val shape = RoundedCornerShape(MeeshyRadius.lg)
    var opened by rememberSaveable { mutableStateOf<EngagementAxisFamily?>(null) }
    Column(
        modifier
            .testTag(ELANS_PIECE_TAG)
            .fillMaxWidth()
            .clip(shape)
            .background(MeeshyPalette.Indigo500.copy(alpha = FILL_ALPHA))
            .border(1.dp, MeeshyPalette.Indigo500.copy(alpha = STROKE_ALPHA), shape)
            .padding(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), verticalAlignment = Alignment.CenterVertically) {
            Icon(MeeshyIcons.MagicWand, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(20.dp))
            Text(
                piece.factor?.let { stringResource(R.string.progression_elan_factor, it) } ?: stringResource(R.string.progression_elans_title),
                Modifier.semantics { heading() },
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Bold,
                color = tokens.textPrimary,
            )
        }
        if (piece.families.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
                piece.families.forEach { family -> FamilyChip(family) { opened = family } }
            }
        }
        Text(elansLine(piece.line), style = MaterialTheme.typography.bodySmall, color = tokens.textMuted)
    }
    opened?.let { family -> GameElementSheet(GameElementDetails.elanFamily(family, elan), onDismiss = { opened = null }) }
}

@Composable
private fun FamilyChip(family: EngagementAxisFamily, onClick: () -> Unit) {
    GameBounceButton(onClick = onClick) {
        Box(
            Modifier
                .heightIn(min = 44.dp)
                .clip(CircleShape)
                .background(MeeshyPalette.Indigo500.copy(alpha = CHIP_ALPHA))
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                stringResource(familyTitle(family)),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
            )
        }
    }
}

/** La phrase sous les familles, composée comme iOS `ProgressionCopy.elan` : base, assise, puis l'effet. */
@Composable
private fun elansLine(line: ElansLine): String {
    val res = LocalContext.current.resources
    return when (line) {
        ElansLine.Empty -> res.getString(R.string.progression_elans_empty)
        ElansLine.Hint -> res.getString(R.string.progression_elans_hint)
        is ElansLine.Explained -> {
            val families = if (line.families == 1) {
                res.getString(R.string.progression_elan_family_one)
            } else {
                res.getString(R.string.progression_elan_family_many, line.families)
            }
            val base = res.getString(R.string.progression_elan_base, line.factor, families, line.windowDays)
            val standing = if (line.standing) res.getString(R.string.progression_elan_standing) else ""
            "$base$standing. " + res.getString(R.string.progression_elan_effect, line.factor)
        }
    }
}

internal const val ELANS_PIECE_TAG = "progression.concept.piece.elans"
private const val FILL_ALPHA = 0.10f
private const val STROKE_ALPHA = 0.24f
private const val CHIP_ALPHA = 0.16f
