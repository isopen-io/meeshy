package me.meeshy.app.game.progression

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.absoluteOffset
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.app.game.gameString
import me.meeshy.app.game.pages.LeagueGem
import me.meeshy.app.game.reveal.rarityRim
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameNumberFormat
import me.meeshy.sdk.model.game.MeeshCoinFace
import me.meeshy.sdk.model.game.rules.AtlasFamily
import me.meeshy.sdk.model.game.rules.AtlasMedalShape
import me.meeshy.sdk.model.game.rules.AtlasPlate
import me.meeshy.sdk.model.game.rules.AtlasTrophyPlate
import me.meeshy.sdk.model.game.rules.GameRulesAtlas
import me.meeshy.sdk.model.game.rules.GuideSpeaker
import me.meeshy.ui.component.game.GameBadgeShape
import me.meeshy.ui.component.game.GameBadgeState
import me.meeshy.ui.component.game.GameBadgeView
import me.meeshy.ui.component.game.GameFigureSlot
import me.meeshy.ui.component.game.GameFigures
import me.meeshy.ui.component.game.GameMaterial
import me.meeshy.ui.component.game.GameTenantsLayer
import me.meeshy.ui.component.game.LevelRing
import me.meeshy.ui.component.game.MeeFigure
import me.meeshy.ui.component.game.MeeshCoin
import me.meeshy.ui.component.game.RankBlason
import me.meeshy.ui.component.game.SignatureMark
import me.meeshy.ui.component.game.drawGameCrown
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import java.time.Year
import me.meeshy.sdk.model.game.GameMaterial as ModelMaterial

/**
 * L'ATLAS ILLUSTRÉ DU CARNET (iOS `GameRulesAtlasView`, #9538) : neuf familles, chacune ouverte par Mee ou Meo qui disent
 * UNE ligne, puis la grille DESSINÉE de ses objets — les mêmes briques que partout dans l'app (anneau, pièce, blason,
 * Flamme, gemme, médaille, coupe, liseré). Rien ne s'y touche, tout s'y lit ; la loi ([GameRulesAtlas]) dit quoi montrer.
 */
@Composable
internal fun RulesAtlas(modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().testTag(RULES_ATLAS_TAG), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xl)) {
        GameRulesAtlas.families.forEach { family -> AtlasSection(family) }
    }
}

@Composable
private fun AtlasSection(family: AtlasFamily) {
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(MeeshyTheme.tokens.backgroundSecondary)
            .padding(MeeshySpacing.md)
            .testTag(atlasFamilyTag(family)),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        AtlasSpeaker(family)
        AtlasGrid(GameRulesAtlas.plates(family)) { plate -> AtlasCell(family, plate) }
        if (family == AtlasFamily.Tiers) AtlasLevelRules()
    }
}

/** Mee ou Meo — le colibri, puis le titre et UNE ligne. Meo est retourné pour regarder vers le texte. */
@Composable
private fun AtlasSpeaker(family: AtlasFamily) {
    val tokens = MeeshyTheme.tokens
    val copy = AtlasCopy.family(family)
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), verticalAlignment = Alignment.CenterVertically) {
        val meo = family.speaker == GuideSpeaker.Meo
        MeeFigure(
            filmId = if (meo) SPEAKER_MEO_FILM else SPEAKER_MEE_FILM,
            side = SPEAKER_SIDE,
            mirrored = meo,
            modifier = Modifier.clearAndSetSemantics {},
        )
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                stringResource(copy.title),
                Modifier.semantics { heading() },
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Bold,
                color = tokens.textPrimary,
            )
            Text(stringResource(copy.line), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, color = tokens.textMuted)
        }
    }
}

/** Une grille adaptative (iOS `GridItem(.adaptive(minimum: 84))`) : autant de colonnes que la largeur en tient. */
@Composable
private fun AtlasGrid(plates: List<AtlasPlate>, cell: @Composable (AtlasPlate) -> Unit) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val spacing = MeeshySpacing.md
        val columns = ((maxWidth + spacing) / (CELL_MIN + spacing)).toInt().coerceAtLeast(1)
        val width = (maxWidth - spacing * (columns - 1)) / columns
        Column(verticalArrangement = Arrangement.spacedBy(spacing)) {
            plates.chunked(columns).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(spacing), verticalAlignment = Alignment.Top) {
                    row.forEach { plate -> Box(Modifier.width(width)) { cell(plate) } }
                }
            }
        }
    }
}

/** Un objet : son dessin, son nom, une ligne discrète — UN seul élément pour le lecteur d'écran. */
@Composable
private fun AtlasCell(family: AtlasFamily, plate: AtlasPlate) {
    val tokens = MeeshyTheme.tokens
    val legend = AtlasCopy.legend(plate)
    Column(
        Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}.testTag(atlasPlateTag(family, plate)),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Box(Modifier.clearAndSetSemantics {}, contentAlignment = Alignment.Center) { AtlasArt(plate) }
        Text(legend.name, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, color = tokens.textPrimary, textAlign = TextAlign.Center)
        legend.detail?.let {
            Text(it, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Medium, color = tokens.textMuted, textAlign = TextAlign.Center)
        }
    }
}

@Composable
private fun AtlasArt(plate: AtlasPlate) {
    val tokens = MeeshyTheme.tokens
    when (plate) {
        is AtlasPlate.Tier -> LevelRing(
            level = plate.firstLevel,
            progress = 1f,
            tier = plate.tier,
            modifier = Modifier.size(64.dp),
            trackColor = tokens.textMuted.copy(alpha = TRACK_ALPHA),
            inkColor = tokens.textPrimary,
            discColor = tokens.backgroundPrimary,
        )
        is AtlasPlate.Coin -> MeeshCoin(Modifier.size(84.dp), face = coinFace(plate), edition = plate.plate.edition)
        is AtlasPlate.Treasury -> TreasuryPile(plate.pile)
        is AtlasPlate.Rank -> RankBlason(rank = plate.rank, division5 = plate.division5, modifier = Modifier.width(84.dp), title = gameString(GameCopyLaws.rankName(plate.rank)))
        is AtlasPlate.Flame -> FlameEmblem(plate.form, Modifier.size(64.dp))
        is AtlasPlate.League -> LeagueGem(plate.league, 58.dp)
        is AtlasPlate.MedalShape -> GameBadgeView(
            material = plate.shape.material.toUi(),
            modifier = Modifier.size(64.dp),
            shape = badgeShape(plate.shape),
            label = plate.shape.label,
            surface = tokens.backgroundSecondary,
            muted = tokens.textMuted,
        )
        is AtlasPlate.MedalMaterial -> GameBadgeView(
            material = plate.material.toUi(),
            modifier = Modifier.size(64.dp),
            label = GameNumberFormat.formatCount(plate.threshold, LocalConfiguration.current.locales[0]),
            surface = tokens.backgroundSecondary,
            muted = tokens.textMuted,
        )
        AtlasPlate.MedalImprint -> GameBadgeView(
            material = GameMaterial.GOLD,
            modifier = Modifier.size(64.dp),
            state = GameBadgeState.Imprint,
            label = AtlasMedalShape.IMPRINT_LABEL,
            surface = tokens.backgroundSecondary,
            muted = tokens.textMuted,
        )
        is AtlasPlate.Trophy -> if (plate.plate.crowned) CrownedTrophy(plate.plate) else CupEmblem(plate.plate.material.toUi(), Modifier.height(64.dp))
        is AtlasPlate.Rarity -> Box(
            Modifier
                .size(56.dp)
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(tokens.backgroundPrimary)
                .rarityRim(plate.border, RoundedCornerShape(MeeshyRadius.md))
                .padding(14.dp),
        ) { SignatureMark(color = tokens.textMuted, strokeWidth = 100f) }
    }
}

@Composable
private fun coinFace(plate: AtlasPlate.Coin): MeeshCoinFace {
    val year = remember { Year.now().value }
    return if (plate.plate.isReverse) MeeshCoinFace.Reverse(plate.plate.number, year) else MeeshCoinFace.Obverse
}

private fun badgeShape(shape: AtlasMedalShape): GameBadgeShape = when (shape) {
    AtlasMedalShape.Accumulation -> GameBadgeShape.Accumulation
    AtlasMedalShape.Record -> GameBadgeShape.Record
    AtlasMedalShape.Collection -> GameBadgeShape.Collection(AtlasMedalShape.COLLECTION_FILLED, AtlasMedalShape.COLLECTION_TOTAL)
}

internal fun ModelMaterial.toUi(): GameMaterial = when (this) {
    ModelMaterial.Copper -> GameMaterial.COPPER
    ModelMaterial.Bronze -> GameMaterial.BRONZE
    ModelMaterial.Silver -> GameMaterial.SILVER
    ModelMaterial.Gold -> GameMaterial.GOLD
    ModelMaterial.Platinum -> GameMaterial.PLATINUM
    ModelMaterial.Obsidian -> GameMaterial.OBSIDIAN
    ModelMaterial.Prism -> GameMaterial.PRISM
    ModelMaterial.Flame -> GameMaterial.FLAME
}

/** Une pile de pièces d'argent, une de plus à chaque palier, posée comme la planche : trois par rangée, en escalier. */
@Composable
private fun TreasuryPile(count: Int) {
    val k = PILE_SIDE.value / PILE_BOX
    Box(Modifier.size(PILE_SIDE)) {
        repeat(count) { index ->
            val x = (4f + (index % 3) * 17f) * k
            val y = (42f - (index / 3) * 18f - (index % 3) * 4f) * k
            MeeshCoin(Modifier.absoluteOffset(x.dp, y.dp).size((PILE_COIN * k).dp))
        }
    }
}

/** Le trophée de renaissance : la coupe prisme entre Mee et Meo couronnés (iOS `TrophyView(figures: .standard)`, boîte 170 × 124). */
@Composable
private fun CrownedTrophy(plate: AtlasTrophyPlate) {
    Box(Modifier.width(CROWNED_WIDTH).aspectRatio(CROWNED_BOX_WIDTH / CROWNED_BOX_HEIGHT)) {
        CupEmblem(
            plate.material.toUi(),
            Modifier.fillMaxSize().padding(horizontal = CROWNED_WIDTH * (CUP_OFFSET / CROWNED_BOX_WIDTH)),
        )
        GameTenantsLayer(
            figures = GameFigures.standard,
            viewBoxWidth = CROWNED_BOX_WIDTH,
            mee = GameFigureSlot(TENANT_MEE_X, TENANT_Y, TENANT_SIDE),
            meo = GameFigureSlot(TENANT_MEO_X, TENANT_Y, TENANT_SIDE),
        )
        Canvas(Modifier.fillMaxSize()) {
            val k = size.width / CROWNED_BOX_WIDTH
            listOf(TENANT_MEE_X, TENANT_MEO_X).forEach { x ->
                drawGameCrown(Offset(x * k, (TENANT_Y - TENANT_SIDE * CROWN_HEAD) * k), CROWN_SCALE * k)
            }
        }
    }
}

/** La règle des niveaux sous la grille des paliers : plafonds par rang, renaissance facultative, Gloire du premier passage. */
@Composable
private fun AtlasLevelRules() {
    Column(Modifier.testTag(RULES_ATLAS_LEVEL_RULES_TAG), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        GameRulesAtlas.levelRules.forEach { rule ->
            Text(AtlasCopy.levelRule(rule), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium, color = MeeshyTheme.tokens.textMuted)
        }
    }
}

private const val SPEAKER_MEE_FILM = "mee-sourire"
private const val SPEAKER_MEO_FILM = "meo-salut"
private val SPEAKER_SIDE = 48.dp
private val CELL_MIN: Dp = 84.dp
private const val TRACK_ALPHA = 0.22f
private val PILE_SIDE = 66.dp
private const val PILE_BOX = 76f
private const val PILE_COIN = 32.4f
private val CROWNED_WIDTH = 92.dp
private const val CROWNED_BOX_WIDTH = 170f
private const val CROWNED_BOX_HEIGHT = 124f
private const val CUP_OFFSET = 25f
private const val TENANT_MEE_X = 30f
private const val TENANT_MEO_X = 140f
private const val TENANT_Y = 88f
private const val TENANT_SIDE = 60f
private const val CROWN_HEAD = 0.27f
private const val CROWN_SCALE = 1.1f

internal const val RULES_ATLAS_TAG = "game.rules.atlas"
internal const val RULES_ATLAS_LEVEL_RULES_TAG = "game.rules.atlas.tiers.rules"

internal fun atlasFamilyTag(family: AtlasFamily): String = "game.rules.atlas.${family.wire}"

internal fun atlasPlateTag(family: AtlasFamily, plate: AtlasPlate): String = "game.rules.atlas.${family.wire}.${plate.id}"
