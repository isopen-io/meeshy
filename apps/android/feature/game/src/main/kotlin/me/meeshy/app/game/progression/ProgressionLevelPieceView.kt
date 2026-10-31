package me.meeshy.app.game.progression

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.app.game.gameString
import me.meeshy.app.game.pages.count
import me.meeshy.app.game.pages.points
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.engagement.EngagementAxisFamily
import me.meeshy.sdk.model.game.engagement.EngagementElanProgress
import me.meeshy.sdk.model.game.progression.LevelEarnItem
import me.meeshy.sdk.model.game.progression.LevelStepLine
import me.meeshy.sdk.model.game.progression.ProgressionLevelPiece
import me.meeshy.sdk.model.game.progression.ProgressionPieceDetails
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.game.GameBounceButton
import me.meeshy.ui.component.game.GameMedalFamily
import me.meeshy.ui.component.game.LevelRing
import me.meeshy.ui.component.game.LevelTierPalette
import me.meeshy.ui.component.game.RankBlasonStage
import me.meeshy.ui.component.game.SignatureMark
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * L'ANNEAU DU NIVEAU, en tête de sa fiche (miroir de `GameHeroView`, iOS #5841) — OÙ J'EN SUIS puis COMMENT JE GAGNE :
 * l'anneau (il se touche et ouvre ses précisions), le palier, « Niveau N », ce qui sépare du suivant, la barre et la
 * prochaine épreuve ; les deux paires des étincelles ; le blason, le rang et la gloire (ils se touchent) ; une puce par
 * famille (elle se touche). Le fond prend la couleur du palier et la Signature en filigrane.
 *
 * Rien ne se joue au premier rendu : l'anneau et la barre glissent quand le niveau CHANGE (0,6 s en montée, 0,8 s à la
 * frappe), l'écu monte quand la marche est GAGNÉE ; sous « réduire les animations », tout se pose d'un coup.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun LevelPiece(game: GameBlock, elan: EngagementElanProgress?, modifier: Modifier = Modifier) {
    val piece = remember(game) { ProgressionLevelPiece.of(game) }
    val tokens = MeeshyTheme.tokens
    val tint = LevelTierPalette.color(piece.tier.ordinal + 1)
    val shape = RoundedCornerShape(MeeshyRadius.lg)
    var opened by remember { mutableStateOf<GameElementDetail?>(null) }
    Box(
        modifier
            .testTag(LEVEL_PIECE_TAG)
            .fillMaxWidth()
            .clip(shape)
            .background(tokens.backgroundSecondary)
            .background(tint.copy(alpha = FILL_ALPHA))
            .border(1.dp, tint.copy(alpha = STROKE_ALPHA), shape),
    ) {
        SignatureMark(
            color = tokens.textPrimary.copy(alpha = WATERMARK_ALPHA),
            modifier = Modifier.align(Alignment.TopEnd).size(WATERMARK).offset(x = 70.dp, y = (-60).dp),
        )
        Column(Modifier.padding(MeeshySpacing.lg), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg)) {
            LevelRow(piece, onOpenRing = { opened = GameElementDetails.levelRing(game) })
            SparkPairs(piece)
            RankRow(piece, onOpen = { opened = GameElementDetails.rank(game) })
            EarnChips(piece.earn) { family -> opened = GameElementDetails.elanFamily(family, elan) }
        }
    }
    opened?.let { detail -> GameElementSheet(detail, onDismiss = { opened = null }) }
}

/** L'anneau et la barre suivent le niveau : rien au premier rendu, une glissade quand il change. */
@Composable
private fun rememberShownProgress(level: Int, progress: Double): Float {
    val reduce = LocalReduceMotion.current
    val shown = remember { Animatable(progress.toFloat()) }
    var lastLevel by remember { mutableIntStateOf(level) }
    LaunchedEffect(level, progress, reduce) {
        val millis = if (level < lastLevel) LOSS_MILLIS else GAIN_MILLIS
        lastLevel = level
        if (reduce) shown.snapTo(progress.toFloat()) else shown.animateTo(progress.toFloat(), tween(millis))
    }
    return shown.value
}

@Composable
private fun LevelRow(piece: ProgressionLevelPiece, onOpenRing: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    val locale = LocalConfiguration.current.locales[0]
    val progress = rememberShownProgress(piece.level, piece.progress)
    val ringLabel = gameString(GameCopyLaws.levelRingAccessibility(piece.level, piece.tier))
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.lg), verticalAlignment = Alignment.CenterVertically) {
        GameBounceButton(onClick = onOpenRing, modifier = Modifier.testTag(LEVEL_RING_TAG).semantics { contentDescription = ringLabel }) {
            LevelRing(
                level = piece.level,
                progress = progress,
                tier = piece.tier,
                prestige = piece.prestige,
                recordMarker = if (piece.belowRecord) 1f else null,
                trackColor = tokens.textMuted.copy(alpha = TRACK_ALPHA),
                inkColor = tokens.textPrimary,
                discColor = tokens.backgroundPrimary,
                modifier = Modifier.width(RING),
            )
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Text(
                gameString(piece.tierName).uppercase(locale),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = tokens.textMuted,
            )
            Text(
                gameString(piece.title),
                Modifier.semantics { heading() },
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = tokens.textPrimary,
            )
            Text(gameString(piece.toNext), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, color = tokens.textMuted)
            LevelBar(progress, LevelTierPalette.color(piece.tier.ordinal + 1), piece.belowRecord)
            piece.step?.let { StepRow(it) }
        }
    }
}

/** La barre du niveau ; redescendu, le repère FANTÔME du record à son bout. */
@Composable
private fun LevelBar(progress: Float, tint: androidx.compose.ui.graphics.Color, belowRecord: Boolean) {
    val tokens = MeeshyTheme.tokens
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
        Box(
            Modifier
                .fillMaxWidth()
                .heightIn(min = BAR_HEIGHT, max = BAR_HEIGHT)
                .clip(CircleShape)
                .background(tokens.textMuted.copy(alpha = TRACK_ALPHA)),
        ) {
            Box(
                Modifier
                    .fillMaxWidth(progress.coerceIn(0f, 1f))
                    .heightIn(min = BAR_HEIGHT, max = BAR_HEIGHT)
                    .clip(CircleShape)
                    .background(tint),
            )
        }
        if (belowRecord) {
            Box(
                Modifier
                    .size(width = 8.dp, height = 12.dp)
                    .border(1.5.dp, tokens.textPrimary.copy(alpha = GHOST_ALPHA), CircleShape),
            )
        }
    }
}

/** La prochaine épreuve des niveaux (iOS `GameLevelStepRow`) : faite (coche) ou à faire (cercle) et où elle en est. */
@Composable
private fun StepRow(step: LevelStepLine) {
    val tokens = MeeshyTheme.tokens
    val tone = if (step.met) MeeshyPalette.Success else tokens.textMuted
    val line = gameString(step.line)
    val state = gameString(step.state)
    Row(
        Modifier.heightIn(min = 44.dp).semantics(mergeDescendants = true) { contentDescription = "$line, $state" },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(if (step.met) MeeshyIcons.CheckCircleFilled else MeeshyIcons.RadioUnchecked, contentDescription = null, tint = tone, modifier = Modifier.size(16.dp))
        Text(line, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, color = tokens.textPrimary)
        Text(state, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold, color = tone, maxLines = 1)
    }
}

/** Les deux paires des étincelles (iOS `GameSparkPairsRow`) : ce qu'on possède en grand, le « depuis toujours » dessous. */
@Composable
private fun SparkPairs(piece: ProgressionLevelPiece) {
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        Pair(stringResource(R.string.game_sparks_pocket_label), gameString(piece.pocket), gameString(piece.cumul), Modifier.weight(1f))
        Pair(stringResource(R.string.game_sparks_level_label), gameString(piece.levelShown), gameString(piece.levelRecord), Modifier.weight(1f))
    }
}

@Composable
private fun Pair(label: String, big: String, small: String, modifier: Modifier) {
    val tokens = MeeshyTheme.tokens
    val locale = LocalConfiguration.current.locales[0]
    Column(
        modifier
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(tokens.textMuted.copy(alpha = PAIR_ALPHA))
            .padding(MeeshySpacing.sm)
            .semantics(mergeDescendants = true) { contentDescription = "$label $big, $small" },
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
    ) {
        Text(label.uppercase(locale), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = tokens.textMuted)
        Text(big, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = tokens.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(small, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, color = tokens.textMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Le blason et la division : l'écu monte quand la marche est GAGNÉE (jamais au premier rendu). */
@Composable
private fun RankRow(piece: ProgressionLevelPiece, onOpen: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    var seen by rememberSaveable { mutableIntStateOf(piece.standingOrder) }
    var play by rememberSaveable { mutableIntStateOf(0) }
    LaunchedEffect(piece.standingOrder) {
        if (piece.standingOrder > seen) play += 1
        seen = piece.standingOrder
    }
    val label = gameString(piece.rankLabel)
    GameBounceButton(onClick = onOpen, modifier = Modifier.testTag(LEVEL_RANK_TAG)) {
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md), verticalAlignment = Alignment.CenterVertically) {
            RankBlasonStage(
                rank = piece.rank,
                division5 = piece.division5,
                play = play,
                level = piece.level,
                mythic = piece.mythic,
                title = label,
                modifier = Modifier.width(BLASON),
            )
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(label, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = tokens.textPrimary)
                Text(gameString(piece.glory), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, color = tokens.textMuted)
            }
        }
    }
}

/** « Comment gagner » (iOS `GameHeroEarn`) : une puce par famille ; elle se touche et ouvre les précisions de SA famille. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EarnChips(items: List<LevelEarnItem>, onOpen: (EngagementAxisFamily) -> Unit) {
    val tokens = MeeshyTheme.tokens
    val locale = LocalConfiguration.current.locales[0]
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        Text(
            stringResource(R.string.game_hero_earn_title).uppercase(locale),
            Modifier.semantics { heading() },
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = tokens.textMuted,
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
            items.forEach { item -> EarnChip(item) { onOpen(item.family) } }
        }
    }
}

@Composable
private fun EarnChip(item: LevelEarnItem, onClick: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    val tint = GameMedalFamily.of(item.family).enamel
    val title = stringResource(familyTitle(item.family))
    val spoken = stringResource(R.string.game_hero_earn_a11y, title, points(item.weight))
    GameBounceButton(onClick = onClick, modifier = Modifier.semantics { contentDescription = spoken }) {
        Row(
            Modifier
                .heightIn(min = 44.dp)
                .padding(vertical = MeeshySpacing.xxs)
                .clip(CircleShape)
                .background(tint.copy(alpha = CHIP_ALPHA))
                .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(familyIcon(item.family), contentDescription = null, tint = tint, modifier = Modifier.size(14.dp))
            Text(title, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Medium, color = tokens.textPrimary, maxLines = 1)
            Text(
                stringResource(R.string.game_hero_earn_chip, count(item.weight)),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = tokens.textPrimary,
                maxLines = 1,
            )
        }
    }
}

private fun familyIcon(family: EngagementAxisFamily): ImageVector = when (family) {
    EngagementAxisFamily.CONTENT -> MeeshyIcons.Edit
    EngagementAxisFamily.COMMENT -> MeeshyIcons.Quote
    EngagementAxisFamily.CONVERSATION -> MeeshyIcons.Forum
    EngagementAxisFamily.TOOL -> MeeshyIcons.MagicWand
    EngagementAxisFamily.SOCIAL -> MeeshyIcons.Link
}

/** Les précisions de l'anneau et du blason, dérivées de la loi partagée. */
internal fun GameElementDetails.levelRing(game: GameBlock): GameElementDetail.Piece = GameElementDetail.Piece(
    ProgressionPieceDetails.levelRing(game.level),
    PieceEmblem.Ring(game.level.shown.level, game.level.shown.tier, game.level.shown.progress),
)

internal fun GameElementDetails.rank(game: GameBlock): GameElementDetail.Piece = GameElementDetail.Piece(
    ProgressionPieceDetails.rank(game.glory),
    PieceEmblem.Blason(game.glory.rank, game.glory.shownDivision, game.glory.mythicSeat),
)

internal const val LEVEL_PIECE_TAG = "game.hero"
internal const val LEVEL_RING_TAG = "game.hero.level"
internal const val LEVEL_RANK_TAG = "game.hero.rank"
private val RING = 88.dp
private val BLASON = 64.dp
private val WATERMARK = 240.dp
private val BAR_HEIGHT = 8.dp
private const val FILL_ALPHA = 0.12f
private const val STROKE_ALPHA = 0.28f
private const val WATERMARK_ALPHA = 0.07f
private const val TRACK_ALPHA = 0.22f
private const val GHOST_ALPHA = 0.55f
private const val PAIR_ALPHA = 0.08f
private const val CHIP_ALPHA = 0.16f
private const val GAIN_MILLIS = 600
private const val LOSS_MILLIS = 800
