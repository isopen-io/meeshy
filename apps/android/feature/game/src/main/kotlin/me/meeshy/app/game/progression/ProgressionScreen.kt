package me.meeshy.app.game.progression

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.app.game.notebook.photoMomentTitle
import me.meeshy.ui.component.game.GameBounceButton
import me.meeshy.app.game.photo.GamePhotoCoordinator
import me.meeshy.app.game.photo.GamePhotoFlowDialog
import me.meeshy.sdk.model.game.photo.GamePhotoMoment
import me.meeshy.sdk.model.game.photo.GamePhotoMoments
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshyTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.game.pages.GameDoorRow
import me.meeshy.app.game.pages.GameHiddenCard
import me.meeshy.app.game.pages.GameSettingsDoor
import me.meeshy.app.game.pages.rememberGameHidden
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.guide.GuideCard
import me.meeshy.sdk.model.game.guide.GuideDestination
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.motion.staggeredAppear
import me.meeshy.ui.theme.MeeshySpacing

/**
 * L'ÉCRAN « PROGRESSION » — la PREMIÈRE PAGE du jeu (iOS `ProgressionView`). Elle ne porte que des CARTES, une par
 * concept servi, dans l'ordre que [me.meeshy.sdk.model.game.progression.ProgressionConcepts] déclare pour tous les
 * clients ; dans l'en-tête, à droite du titre, le blason de rang et le compteur de Meeshes. La carte entière ouvre la
 * FICHE du concept. **Aucun geste du jeu ne vit dans la liste.** En dessous, « La Chronique », « Comment ça marche » et Réglages, en lignes
 * de la même forme ([ProgressionDoors]).
 *
 * Ce que l'écran REFUSE : peindre un spinner (squelette à froid, instantané sinon) ; voiler l'instantané hors ligne
 * (il reste affiché avec son avis). Les cartes entrent en scène une fois, l'une après l'autre.
 */
@Composable
fun ProgressionScreen(
    onBack: () -> Unit,
    onOpenConcept: (ProgressionConcept) -> Unit,
    onOpenSettings: () -> Unit = {},
    onOpenRules: () -> Unit = {},
    onOpenNotebook: () -> Unit = {},
    onOpenConversations: () -> Unit = {},
    viewModel: ProgressionViewModel = hiltViewModel(),
    guideViewModel: ProgressionGuideViewModel = hiltViewModel(),
    photos: GamePhotoCoordinator = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snapshot = state.snapshot
    val hidden = rememberGameHidden()
    val guide by guideViewModel.state.collectAsStateWithLifecycle()
    val offers by photos.offers.collectAsStateWithLifecycle()
    val taking by photos.active.collectAsStateWithLifecycle()
    LaunchedEffect(snapshot?.game) {
        snapshot?.game?.let {
            guideViewModel.observe(it)
            photos.observe(it)
        }
    }
    val open = ProgressionGuideRoutes(onOpenConcept, onOpenConversations) { card ->
        snapshot?.game?.let { GamePhotoMoments.ofCard(card, it) }?.let(photos::start)
    }

    GamePageScaffold(
        title = stringResource(R.string.game_progression_title),
        onBack = onBack,
        isRefreshing = state.isRefreshing,
        onRefresh = viewModel::refresh,
        trailing = {
            snapshot?.standing?.takeUnless { it.isEmpty || hidden.hidden }?.let {
                ProgressionHeaderStanding(
                    standing = it,
                    onOpenRank = { onOpenConcept(ProgressionConcept.Glory) },
                    onOpenMeesh = { onOpenConcept(ProgressionConcept.Meesh) },
                )
            }
        },
    ) {
        if (hidden.hidden) {
            GameHiddenCard(onSettings = onOpenSettings)
            return@GamePageScaffold
        }
        state.plan.notices.forEach { notice -> ProgressionNoticeView(notice, onRetry = viewModel::refresh) }
        if (state.plan.showsSkeleton) ProgressionSkeleton()
        if (snapshot != null) {
            Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                val game = snapshot.game
                val card = guide?.takeIf { game != null }
                val cardPhoto = game?.let { served -> card?.takeIf { it.photo }?.let { GamePhotoMoments.ofCard(it, served) } }
                card?.let {
                    ProgressionGuide(
                        it, open,
                        onDismiss = guideViewModel::dismiss,
                        onSkipAll = guideViewModel::skipAll,
                        onPhoto = cardPhoto?.let { moment -> { photos.start(moment) } },
                    )
                }
                if (game != null) {
                    offers.filterNot { it.id == cardPhoto?.id }.forEach { offer -> PhotoOfferRow(offer, onOpen = { photos.start(offer) }) }
                }
                snapshot.cards.forEachIndexed { index, card ->
                    key(card.concept) {
                        ProgressionConceptCardView(
                            card = card,
                            game = snapshot.game,
                            onOpen = { onOpenConcept(card.concept) },
                            modifier = Modifier.staggeredAppear(minOf(index, MAX_STAGGER_RANK)),
                        )
                    }
                }
                ProgressionDoors(
                    hasGame = snapshot.game != null,
                    onOpenNotebook = onOpenNotebook,
                    onOpenRules = onOpenRules,
                    onOpenSettings = onOpenSettings,
                )
            }
        }
    }
    taking?.let { moment -> GamePhotoFlowDialog(moment, photos.notebook, onClose = photos::close) }
}

/** Une proposition de photo (iOS `ProgressionConceptRow` « Immortaliser ce moment ») : le moment en sous-titre. */
@Composable
internal fun PhotoOfferRow(moment: GamePhotoMoment, onOpen: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    GameBounceButton(onClick = onOpen, modifier = Modifier.fillMaxWidth().testTag("$PHOTO_OFFER_TAG.${moment.id}")) {
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .background(tokens.backgroundSecondary)
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm)
                .heightIn(min = 44.dp),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(MeeshyIcons.Camera, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(22.dp))
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.game_concept_photo_offer), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = tokens.textPrimary)
                Text(photoMomentTitle(moment.emblem), style = MaterialTheme.typography.bodySmall, color = tokens.textMuted)
            }
            Icon(MeeshyIcons.ChevronForward, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(20.dp))
        }
    }
}

internal const val PHOTO_OFFER_TAG = "game.photo.offer"

/** Où mène le bouton d'une carte de Mee (iOS `ProgressionFrontList.act(on:)`) : une fiche, les conversations, ou l'atelier photo. */
internal data class ProgressionGuideRoutes(
    val concept: (ProgressionConcept) -> Unit,
    val conversations: () -> Unit,
    /** Le déroulé photo du moment que la carte dit — la photo de départ pour l'étape du rang. */
    val photo: (GuideCard) -> Unit,
) {
    fun open(card: GuideCard) = when (val destination = card.destination) {
        is GuideDestination.Concept -> concept(destination.concept)
        GuideDestination.Conversations -> conversations()
        GuideDestination.Photo -> photo(card)
    }

    /** Le bouton d'une carte : l'écarter, PUIS ouvrir ce qu'elle vise (iOS `ProgressionFrontList.act(on:)`). */
    fun act(card: GuideCard, onDismiss: () -> Unit) {
        onDismiss()
        open(card)
    }
}

/**
 * Mee sur la première page (iOS `ProgressionFrontList`) : la ligne courte, et au toucher la feuille de la carte
 * entière. Le bouton ferme la feuille, écarte la carte, puis ouvre ce qu'elle vise — dans cet ordre, comme iOS.
 */
@Composable
internal fun ProgressionGuide(
    card: GuideCard,
    routes: ProgressionGuideRoutes,
    onDismiss: () -> Unit,
    onSkipAll: () -> Unit,
    onPhoto: (() -> Unit)? = null,
) {
    var sheet by rememberSaveable(card.key) { mutableStateOf(false) }
    ProgressionGuideLine(card, onOpen = { sheet = true })
    if (sheet) {
        ProgressionGuideSheet(
            card = card,
            onClose = { sheet = false },
            onAction = { routes.act(card, onDismiss) },
            onDismiss = onDismiss,
            onSkipAll = onSkipAll,
            onPhoto = onPhoto,
        )
    }
}

/**
 * Les PORTES du bas de la première page (iOS `ProgressionFrontList`) : « La Chronique », puis « Comment ça marche » qui
 * ouvre le carnet des règles, puis Réglages. La Chronique et le carnet ne s'offrent qu'avec le bloc de jeu, comme sur
 * iOS ; Réglages reste toujours atteignable.
 */
@Composable
internal fun ProgressionDoors(
    hasGame: Boolean,
    onOpenNotebook: () -> Unit,
    onOpenRules: () -> Unit,
    onOpenSettings: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        if (hasGame) {
            GameDoorRow(icon = MeeshyIcons.Dictionary, title = stringResource(R.string.game_door_notebook), onOpen = onOpenNotebook)
            GameDoorRow(icon = MeeshyIcons.Info, title = stringResource(R.string.game_door_rules), onOpen = onOpenRules)
        }
        GameSettingsDoor(onOpenSettings)
    }
}

/** Le décalage entre deux cartes est plafonné : la quinzième n'attend pas une seconde. */
private const val MAX_STAGGER_RANK = 8
