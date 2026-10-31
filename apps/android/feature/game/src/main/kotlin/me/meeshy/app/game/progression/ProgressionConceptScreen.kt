package me.meeshy.app.game.progression

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.game.gameString
import me.meeshy.app.game.gestures.ConceptGestures
import me.meeshy.app.game.gestures.GameGesturesViewModel
import me.meeshy.app.game.gestures.conceptHasGestures
import me.meeshy.feature.game.R
import me.meeshy.app.game.pages.GameHiddenCard
import me.meeshy.app.game.pages.rememberGameHidden
import me.meeshy.sdk.model.game.pages.GamePage
import me.meeshy.sdk.model.game.pages.GamePageLinks
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.sdk.model.game.progression.GameSparksHead
import me.meeshy.sdk.model.game.progression.ProgressionConceptCard
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.game.GameBounceButton
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * LA FICHE D'UN CONCEPT — le deuxième niveau du jeu. Un gabarit UNIQUE pour les quinze concepts : la tête (emblème
 * en grand, valeur, ligne, jauge vers l'étape suivante), « C'est quoi ? », « Comment en gagner », « Comment m'en
 * servir ». La page est AUTONOME dans la pile : atteinte par un lien ou une notification, elle lit sa propre
 * progression, cache d'abord — aucun spinner ne s'ajoute.
 *
 * « À toi de jouer » range les GESTES du concept (changer un acte, ouvrir l'Offrande, frapper, protéger ou rallumer la
 * Flamme), pilotés par `GameGesturesViewModel` : une intention, la réponse de la passerelle, jamais un solde calculé ici.
 * [onOpenBadgesGuide] ouvre le carnet des règles à ses médailles ; nul, l'étagère ne montre pas le lien.
 */
@Composable
fun ProgressionConceptScreen(
    concept: ProgressionConcept,
    onBack: () -> Unit,
    onOpenConcept: (ProgressionConcept) -> Unit,
    onOpenPage: (GamePage) -> Unit = {},
    onOpenSection: (ProgressionSection) -> Unit = {},
    onOpenBadgesGuide: (() -> Unit)? = null,
    viewModel: ProgressionViewModel = hiltViewModel(),
    gestures: GameGesturesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val hidden = rememberGameHidden()
    val snapshot = state.snapshot
    val card = snapshot?.cards?.firstOrNull { it.concept == concept }

    GamePageScaffold(
        title = stringResource(ConceptCopy.name(concept)),
        onBack = onBack,
        isRefreshing = state.isRefreshing,
        onRefresh = viewModel::refresh,
    ) {
        state.plan.notices.filterNot { it == me.meeshy.sdk.model.game.progression.ProgressionNotice.Empty }
            .forEach { notice -> ProgressionNoticeView(notice, onRetry = viewModel::refresh) }
        if (hidden.hidden) {
            GameHiddenCard(onSettings = { onOpenPage(GamePage.Settings) })
            return@GamePageScaffold
        }
        if (state.plan.showsSkeleton) ProgressionSkeleton()
        if (snapshot != null) {
            val sparksGame = snapshot.game?.takeIf { concept == ProgressionConcept.Points }
            when {
                // TA LUMIÈRE (iOS `GameSparksHeadView`) : la poche en grand, le « depuis toujours » en petit.
                sparksGame != null -> GameSparksHeadView(GameSparksHead.of(sparksGame.level), sparksGame)
                card != null -> ConceptHero(card, snapshot.game)
            }
            FicheSection(stringResource(R.string.game_fiche_what)) {
                Sentence(stringResource(ConceptCopy.what(concept)))
                Sentence(stringResource(ConceptCopy.why(concept)), strong = true)
                Sentence(stringResource(ConceptCopy.how(concept)))
            }
            FicheSection(stringResource(R.string.game_fiche_earn)) {
                Sentence(stringResource(ConceptCopy.tip1(concept)))
                Sentence(stringResource(ConceptCopy.tip2(concept)))
            }
            FicheSection(stringResource(R.string.game_fiche_use)) {
                Sentence(stringResource(ConceptCopy.use(concept)))
            }
            val game = snapshot.game
            val acts = game != null && conceptHasGestures(concept, game)
            if (acts || conceptHasRevealPiece(concept)) {
                FicheSection(stringResource(R.string.game_concept_section_act)) {
                    if (acts && game != null) ConceptGestures(concept, game, gestures)
                    // Les médailles et le dernier haut fait se TOUCHENT : ils s'ouvrent en grand, en consultation.
                    ConceptRevealPiece(concept, snapshot.progress, game, hidden.hidden, onOpenBadgesGuide)
                }
            }
            if (concept == ProgressionConcept.Points) {
                ConceptLink(stringResource(R.string.game_fiche_light_to_heritage)) { onOpenConcept(ProgressionConcept.Meesh) }
            }
            val pages = GamePageLinks.of(concept)
            val sections = ProgressionSection.of(concept)
            if (pages.isNotEmpty() || sections.isNotEmpty()) {
                FicheSection(stringResource(R.string.game_fiche_more)) {
                    sections.forEach { section -> ConceptLink(stringResource(sectionLinkTitle(section))) { onOpenSection(section) } }
                    pages.forEach { page -> ConceptLink(stringResource(pageLinkTitle(page))) { onOpenPage(page) } }
                }
            }
        }
    }
}

/** La tête générique : l'emblème en grand, la valeur, la ligne, la jauge qui se remplit à l'ouverture. */
@Composable
private fun ConceptHero(card: ProgressionConceptCard, game: me.meeshy.sdk.model.game.GameBlock?) {
    val tokens = MeeshyTheme.tokens
    val value = card.value?.let { gameString(it) }.orEmpty()
    val line = card.line?.let { gameString(it) }
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.lg))
            .background(tokens.backgroundSecondary)
            .padding(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.lg), verticalAlignment = Alignment.CenterVertically) {
            ProgressionConceptEmblem(card.concept, game, size = HERO_EMBLEM)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
                GameValueRoll(
                    value = value,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = tokens.textPrimary,
                )
                if (line != null) {
                    Text(
                        line,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = if (card.urgent) tokens.textPrimary else tokens.textMuted,
                    )
                }
            }
        }
        card.gauge?.let { ConceptGauge(it.toFloat(), card.concept.tint()) }
    }
}

/**
 * La jauge vers l'étape suivante : elle se remplit une fois à l'ouverture (0,6 s, comme l'anneau du niveau) et
 * glisse quand la valeur change. La fraction est lue À LA PEINTURE : aucune recomposition pendant l'animation.
 */
@Composable
internal fun ConceptGauge(target: Float, tint: Color) {
    val reduce = LocalReduceMotion.current
    val tokens = MeeshyTheme.tokens
    val goal = target.coerceIn(0f, 1f)
    val fill = remember { Animatable(if (reduce) goal else 0f) }
    LaunchedEffect(goal, reduce) {
        if (reduce) fill.snapTo(goal) else fill.animateTo(goal, tween(GAUGE_MILLIS))
    }
    val track = tokens.textMuted.copy(alpha = TRACK_ALPHA)
    Canvas(Modifier.fillMaxWidth().height(GAUGE_HEIGHT)) {
        val radius = CornerRadius(size.height / 2f)
        drawRoundRect(track, size = size, cornerRadius = radius)
        val shown = fill.value
        if (shown > 0f) drawRoundRect(tint, size = Size(size.width * shown, size.height), cornerRadius = radius)
    }
}

@Composable
private fun FicheSection(title: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Text(
            title.uppercase(),
            Modifier.semantics { heading() },
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textMuted,
        )
        content()
    }
}

@Composable
private fun Sentence(text: String, strong: Boolean = false) {
    Text(
        text,
        style = MaterialTheme.typography.bodyMedium,
        fontWeight = if (strong) FontWeight.SemiBold else FontWeight.Normal,
        color = MeeshyTheme.tokens.textPrimary,
    )
}

/**
 * Une ligne simple vers une autre page : un pictogramme facultatif, un titre, un chevron, 44 dp au moins, et le rebond
 * du jeu (iOS `ProgressionConceptRow`).
 */
@Composable
internal fun ConceptLink(title: String, leading: ImageVector? = null, onClick: () -> Unit) {
    GameBounceButton(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(MeeshyTheme.tokens.backgroundSecondary)
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm)
                .heightIn(min = 44.dp),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            leading?.let { Icon(it, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(20.dp)) }
            Text(
                title,
                Modifier.weight(1f),
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            Icon(MeeshyIcons.ChevronForward, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(20.dp))
        }
    }
}

private val HERO_EMBLEM = 72.dp
private val GAUGE_HEIGHT = 8.dp
private const val GAUGE_MILLIS = 600
private const val TRACK_ALPHA = 0.2f

/** Le titre du lien « Aller plus loin » d'une sous-page (iOS `ProgressionConceptLink.title`). */
@androidx.annotation.StringRes
private fun pageLinkTitle(page: GamePage): Int = when (page) {
    GamePage.League -> R.string.game_concept_link_league
    GamePage.Season -> R.string.game_concept_link_season
    GamePage.Prestige -> R.string.game_concept_link_prestige
    GamePage.Showcase -> R.string.game_concept_link_showcase
    GamePage.Atlas -> R.string.game_concept_link_atlas
    GamePage.Settings -> R.string.game2_door_settings
}
