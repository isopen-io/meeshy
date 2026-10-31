package me.meeshy.app.game.progression

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import me.meeshy.app.game.reveal.toGameMaterial
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.engagement.BadgeGuideResolver
import me.meeshy.sdk.model.game.engagement.BadgeRungState
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.game.GameBadgeShape
import me.meeshy.ui.component.game.GameBadgeState
import me.meeshy.ui.component.game.GameBadgeView
import me.meeshy.ui.component.game.GameBounceButton
import me.meeshy.ui.component.game.GameMaterial
import me.meeshy.ui.component.game.GameMedalFamily
import me.meeshy.ui.component.game.GameMedalGlyph
import me.meeshy.ui.component.game.GameMedalState
import me.meeshy.ui.component.game.GameMedalView
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * LA FEUILLE DE PRÉCISIONS d'une médaille, d'un défi ou d'une ligne de donnée (miroir de `GameElementSheet`, iOS) : une feuille du bas, ajustée
 * à son contenu, poignée visible ; elle se ferme en la glissant vers le bas, au toucher du voile ou par « Fermer ».
 * L'emblème entre en grand avec un ressort (un fondu sous « réduire les animations »), puis le nom, l'état, la jauge,
 * et pour une médaille ses étoiles, sa matière et pourquoi, ce qu'elle suit, la prochaine étoile et ses sept paliers.
 * « Comprendre les médailles » referme la feuille avant d'ouvrir le carnet des règles.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun GameElementSheet(detail: GameElementDetail, onDismiss: () -> Unit, onOpenBadgesGuide: (() -> Unit)? = null) {
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    val closeThen: (() -> Unit) -> Unit = { after ->
        scope.launch { state.hide() }.invokeOnCompletion {
            onDismiss()
            after()
        }
    }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = state, containerColor = MeeshyTheme.tokens.backgroundPrimary) {
        key(detail.id) {
            GameElementSheetContent(
                detail = detail,
                onClose = { closeThen {} },
                onOpenBadgesGuide = onOpenBadgesGuide?.takeIf { detail is GameElementDetail.Badge }?.let { open -> { closeThen(open) } },
            )
        }
    }
}

@Composable
private fun GameElementSheetContent(detail: GameElementDetail, onClose: () -> Unit, onOpenBadgesGuide: (() -> Unit)?) {
    val res = LocalContext.current.resources
    val locale = LocalConfiguration.current.locales[0]
    val tokens = MeeshyTheme.tokens
    val texts = remember(detail, res, locale) { GameElementTexts.of(res, locale, detail) }
    Column(
        Modifier
            .testTag(GAME_DETAIL_TAG)
            .fillMaxWidth()
            .widthIn(max = SHEET_MAX_WIDTH)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.lg)
            .navigationBarsPadding()
            .padding(bottom = MeeshySpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        ElementEmblem(detail)
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            Text(
                texts.name,
                Modifier.semantics { heading() },
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = tokens.textPrimary,
                textAlign = TextAlign.Center,
            )
            StatusLine(detail.status, texts.status)
        }
        detail.progress?.let { ConceptGauge(it.toFloat(), detail.concept.tint()) }
        if (texts.stars != null && texts.starsSpoken != null && detail is GameElementDetail.Badge) {
            StarsLine(detail.guide.stars, texts.stars, texts.starsSpoken)
        }
        texts.reason?.let {
            Text(it, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium, color = tokens.textPrimary, textAlign = TextAlign.Center)
        }
        SheetSection(texts.whatTitle, texts.what)
        texts.how?.let { SheetSection(texts.howTitle, it) }
        if (texts.ladder.isNotEmpty()) Ladder(texts.ladder)
        if (texts.facts.isNotEmpty()) Facts(texts.facts)
        onOpenBadgesGuide?.let { BadgeGuideLink(it) }
        CloseButton(onClose)
    }
}

/** L'emblème en grand, DÉCORATIF (le nom voisin dit tout) ; désaturé quand l'élément est verrouillé. */
@Composable
private fun ElementEmblem(detail: GameElementDetail) {
    val tokens = MeeshyTheme.tokens
    val reduce = LocalReduceMotion.current
    val scale = remember { Animatable(if (reduce) 1f else ENTRANCE_SCALE) }
    val alpha = remember { Animatable(ENTRANCE_ALPHA) }
    LaunchedEffect(Unit) {
        launch { alpha.animateTo(1f, tween(ENTRANCE_FADE_MILLIS)) }
        if (!reduce) scale.animateTo(1f, spring(dampingRatio = ENTRANCE_DAMPING, stiffness = Spring.StiffnessMediumLow))
    }
    val modifier = Modifier
        .padding(top = MeeshySpacing.xl)
        .width(EMBLEM)
        .graphicsLayer {
            scaleX = scale.value
            scaleY = scale.value
            this.alpha = alpha.value
        }
        .saturation(if (detail.lockedLook) LOCKED_SATURATION else 1f)
        .clearAndSetSemantics {}
    when (detail) {
        is GameElementDetail.Badge -> GameMedalView(
            family = GameMedalFamily.of(detail.axis.family),
            glyph = GameMedalGlyph.of(detail.axis),
            material = detail.material.toGameMaterial(),
            state = if (detail.lit) GameMedalState.Lit else GameMedalState.Imprint,
            progress = detail.emblemProgress,
            surface = tokens.backgroundPrimary,
            muted = tokens.textMuted,
            modifier = modifier,
        )
        is GameElementDetail.Challenge -> GameBadgeView(
            material = GameMaterial.SILVER,
            shape = GameBadgeShape.Record,
            state = if (detail.entry.unlocked) GameBadgeState.Lit else GameBadgeState.Imprint,
            surface = tokens.backgroundPrimary,
            muted = tokens.textMuted,
            modifier = modifier,
        )
        is GameElementDetail.Fact -> ProgressionConceptEmblem(detail.concept, game = null, modifier = modifier, size = EMBLEM)
    }
}

/** « Obtenu le … » au sceau vert, ou « Pas encore obtenu · … » au cadenas : lus d'un trait. */
@Composable
private fun StatusLine(status: GameElementStatus, line: String) {
    if (status is GameElementStatus.Value) {
        Text(line, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MeeshyTheme.tokens.textPrimary, textAlign = TextAlign.Center)
        return
    }
    val obtained = status is GameElementStatus.Obtained
    val color = if (obtained) MeeshyPalette.Success else MeeshyTheme.tokens.textMuted
    Row(
        Modifier.clearAndSetSemantics { contentDescription = line },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(if (obtained) MeeshyIcons.VerifiedFilled else MeeshyIcons.LockFilled, contentDescription = null, tint = color, modifier = Modifier.size(16.dp))
        Text(line, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, color = color, textAlign = TextAlign.Center)
    }
}

/** Les étoiles allumées sur sept, dites en toutes lettres (iOS `GameBadgeStarsView`). */
@Composable
private fun StarsLine(lit: Int, ratio: String, spoken: String) {
    Row(
        Modifier.clearAndSetSemantics { contentDescription = spoken },
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        repeat(BadgeGuideResolver.STARS_MAX) { index ->
            Icon(
                MeeshyIcons.StarFilled,
                contentDescription = null,
                tint = MeeshyPalette.Indigo500.copy(alpha = if (index < lit) 1f else STAR_OFF_ALPHA),
                modifier = Modifier.size(14.dp),
            )
        }
        Text(ratio, Modifier.padding(start = MeeshySpacing.xxs), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = MeeshyTheme.tokens.textMuted)
    }
}

@Composable
private fun SheetSectionTitle(title: String) {
    Text(
        title.uppercase(LocalConfiguration.current.locales[0]),
        Modifier.fillMaxWidth().semantics { heading() },
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.SemiBold,
        color = MeeshyTheme.tokens.textMuted,
    )
}

@Composable
private fun SheetSection(title: String, text: String) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        SheetSectionTitle(title)
        Text(text, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textPrimary)
    }
}

/** L'échelle entière : les sept paliers, chacun lu en UNE phrase ; la prochaine étoile en indigo (iOS `GameBadgeLadderView`). */
@Composable
private fun Ladder(rungs: List<GameRungText>) {
    val tokens = MeeshyTheme.tokens
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        SheetSectionTitle(stringResource(R.string.game_badge_ladder_title))
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            rungs.forEach { rung ->
                val reached = rung.state == BadgeRungState.Reached
                val next = rung.state == BadgeRungState.Next
                Row(
                    Modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = rung.spoken },
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    MaterialSwatch(rung.material, lit = reached, size = SWATCH)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(rung.title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = if (reached) tokens.textPrimary else tokens.textMuted)
                        Text(
                            rung.line,
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = if (next) FontWeight.SemiBold else FontWeight.Normal,
                            color = if (next) MeeshyPalette.Indigo500 else tokens.textMuted,
                        )
                    }
                }
            }
        }
    }
}

/** Les données de l'élément, en lignes libellé → valeur (iOS `ProgressionConceptFacts`). */
@Composable
private fun Facts(facts: List<GameFactText>) {
    val tokens = MeeshyTheme.tokens
    ProgressionCardFrame {
        facts.forEachIndexed { index, fact ->
            if (index > 0) RowDivider()
            Row(
                Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(fact.label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = tokens.textMuted)
                Text(fact.value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = tokens.textPrimary)
            }
        }
    }
}

/** « Fermer », en retrait (iOS `GameQuietButton`) : le geste vers le bas en est le double. */
@Composable
private fun CloseButton(onClose: () -> Unit) {
    GameBounceButton(onClick = onClose, modifier = Modifier.fillMaxWidth()) {
        Box(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(MeeshyTheme.tokens.textMuted.copy(alpha = CLOSE_FILL_ALPHA)),
            contentAlignment = Alignment.Center,
        ) {
            Text(stringResource(R.string.game_detail_close), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = MeeshyTheme.tokens.textPrimary)
        }
    }
}

/** Désature ce qui est dessiné (iOS `.saturation`) ; à 1, rien ne change et aucun calque n'est posé. */
private fun Modifier.saturation(amount: Float): Modifier = if (amount >= 1f) {
    this
} else {
    drawWithContent {
        val paint = Paint().apply { colorFilter = ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(amount) }) }
        drawIntoCanvas { canvas ->
            canvas.saveLayer(Rect(Offset.Zero, size), paint)
            drawContent()
            canvas.restore()
        }
    }
}

/** L'identifiant de la feuille (iOS `game.detail`) : ses témoins la distinguent de la page qu'elle recouvre. */
internal const val GAME_DETAIL_TAG = "game.detail"

private val SHEET_MAX_WIDTH = 560.dp
private val EMBLEM = 112.dp
private val SWATCH = 18.dp
private const val ENTRANCE_SCALE = 0.6f
private const val ENTRANCE_ALPHA = 0.2f
private const val ENTRANCE_DAMPING = 0.52f
private const val ENTRANCE_FADE_MILLIS = 250
private const val LOCKED_SATURATION = 0.2f
private const val STAR_OFF_ALPHA = 0.25f
private const val CLOSE_FILL_ALPHA = 0.12f
