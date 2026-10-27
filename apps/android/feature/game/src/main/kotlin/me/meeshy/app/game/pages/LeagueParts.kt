package me.meeshy.app.game.pages

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import java.time.LocalDateTime
import kotlinx.coroutines.delay
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.LeagueCup
import me.meeshy.sdk.model.game.LeagueCurrent
import me.meeshy.sdk.model.game.LeagueKey
import me.meeshy.sdk.model.game.LeagueWeekEntry
import me.meeshy.sdk.model.game.LeagueZone
import me.meeshy.sdk.model.game.pages.LeagueGap
import me.meeshy.sdk.model.game.pages.LeagueStandings
import me.meeshy.ui.component.game.GameMaterial
import me.meeshy.ui.component.game.SignatureMark
import me.meeshy.ui.component.game.SignatureStyle
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** La couleur de la gemme — les huit teintes de la planche, du gris de Quartz à l'irisé du Prisme (iOS `gemColor`). */
internal fun gemColor(league: LeagueKey): Color = when (league) {
    LeagueKey.Quartz -> MeeshyPalette.Neutral400
    LeagueKey.Ambre -> MeeshyPalette.Amber500
    LeagueKey.Jade -> MeeshyPalette.SuccessDeep
    LeagueKey.Saphir -> MeeshyPalette.Blue500
    LeagueKey.Rubis -> MeeshyPalette.ErrorStrong
    LeagueKey.Amethyste -> MeeshyPalette.Purple600
    LeagueKey.Diamant -> MeeshyPalette.TileSky
    LeagueKey.Prisme -> MeeshyPalette.Purple500
}

/** La couleur d'une zone : montée en vert, maintien en retrait, descente en rouge — et le mot la dit aussi. */
@Composable
internal fun zoneColor(zone: LeagueZone): Color = when (zone) {
    LeagueZone.Promotion -> MeeshyPalette.Success
    LeagueZone.Safe -> MeeshyTheme.tokens.textMuted
    LeagueZone.Relegation -> MeeshyPalette.Error
}

/** La gemme d'une ligue : une taille de diamant, sa table, et la signature gravée. DÉCORATIVE — le texte voisin dit tout. */
@Composable
internal fun LeagueGem(league: LeagueKey, size: Dp, modifier: Modifier = Modifier) {
    val fill = gemColor(league)
    val prism = league == LeagueKey.Prisme
    Box(modifier.size(size).clearAndSetSemantics { }, contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(size)) {
            val k = this.size.width / GEM_BOX
            val cut = Path().apply {
                moveTo(36f * k, 6f * k)
                lineTo(62f * k, 26f * k)
                lineTo(36f * k, 68f * k)
                lineTo(10f * k, 26f * k)
                close()
            }
            if (prism) {
                drawPath(cut, GameMaterial.PRISM.brush(androidx.compose.ui.geometry.Rect(Offset(10f * k, 6f * k), androidx.compose.ui.geometry.Size(52f * k, 62f * k))))
            } else {
                drawPath(cut, fill)
            }
            drawPath(cut, Color.Black.copy(alpha = GEM_EDGE_ALPHA), style = Stroke(width = k))
            drawLine(Color.White.copy(alpha = GEM_TABLE_ALPHA), Offset(10f * k, 26f * k), Offset(62f * k, 26f * k), strokeWidth = 1.4f * k)
        }
        SignatureMark(
            color = MeeshyPalette.Violet950,
            style = SignatureStyle.Engraved,
            modifier = Modifier.size(size * (SIGNATURE_SIDE / GEM_BOX)).offset(y = size * (SIGNATURE_DROP / GEM_BOX)),
        )
    }
}

/** Le temps qui passe, à la minute : la fermeture de la semaine se redit sans secondes qui défilent. */
@Composable
internal fun rememberMinuteClock(): State<LocalDateTime> = produceState(LocalDateTime.now()) {
    while (true) {
        delay(MINUTE_MILLIS)
        value = LocalDateTime.now()
    }
}

/** Ce qui sépare de la montée, habillé. */
@Composable
internal fun gapText(current: LeagueCurrent): String = when (val gap = LeagueStandings.gap(current)) {
    LeagueGap.AtTop -> stringResource(R.string.game2_league_at_top)
    LeagueGap.InPromotion -> stringResource(R.string.game2_league_in_promotion)
    is LeagueGap.ToPromotion -> stringResource(R.string.game2_league_to_promotion, points(gap.points))
}

/** L'étiquette d'une zone qui s'ouvre au-dessus de sa première ligne. */
@Composable
internal fun ZoneLabel(zone: LeagueZone, modifier: Modifier = Modifier) {
    Text(
        stringResource(zoneRes(zone)).uppercase(),
        modifier.padding(top = MeeshySpacing.sm).clearAndSetSemantics { },
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.SemiBold,
        color = zoneColor(zone),
    )
}

@Composable
private fun cupTint(cup: LeagueCup): Color = when (cup) {
    LeagueCup.Gold -> GameMaterial.GOLD.lineColor
    LeagueCup.Silver -> GameMaterial.SILVER.lineColor
    LeagueCup.Bronze -> GameMaterial.BRONZE.lineColor
}

/**
 * Une ligne du classement PUBLIC : le rang, le pseudonyme servi, ma pastille, la coupe, le total de la semaine.
 * Jamais d'avatar, de drapeau ni de langue, jamais de présence : la passerelle ne sert aucun identifiant ici (A-6).
 */
@Composable
internal fun LeagueStandingRow(entry: LeagueWeekEntry, modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    val me = stringResource(R.string.game2_league_me)
    val zone = stringResource(zoneRes(entry.zone))
    val cup = entry.cup?.let { stringResource(cupRes(it)) }
    val total = points(entry.weekPoints)
    val rank = count(entry.rank)
    val spoken = listOfNotNull(rank, entry.displayName, me.takeIf { entry.isMe }, zone, cup, total).joinToString(", ")
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(if (entry.isMe) MeeshyPalette.Indigo500.copy(alpha = ME_ALPHA) else Color.Transparent)
            .semantics(mergeDescendants = true) { contentDescription = spoken },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Box(
            Modifier
                .padding(vertical = MeeshySpacing.xs)
                .width(3.dp)
                .fillMaxHeight()
                .clip(CircleShape)
                .background(zoneColor(entry.zone)),
        )
        Text(
            rank,
            Modifier.width(RANK_WIDTH),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Bold,
            color = tokens.textMuted,
        )
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs), verticalAlignment = Alignment.CenterVertically) {
            Text(
                entry.displayName,
                Modifier.weight(1f, fill = false),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = tokens.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (entry.isMe) GameChip(me)
        }
        entry.cup?.let {
            Icon(MeeshyIcons.Trophy, contentDescription = null, tint = cupTint(it), modifier = Modifier.size(24.dp))
        }
        Text(
            total,
            Modifier.padding(end = MeeshySpacing.md),
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.SemiBold,
            color = tokens.textPrimary,
        )
    }
}

private const val GEM_BOX = 72f
private const val SIGNATURE_SIDE = 26f
private const val SIGNATURE_DROP = 2f
private const val GEM_EDGE_ALPHA = 0.3f
private const val GEM_TABLE_ALPHA = 0.6f
private const val MINUTE_MILLIS = 60_000L
private const val ME_ALPHA = 0.14f
private val RANK_WIDTH = 28.dp
