package me.meeshy.app.game.progression

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
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snapshot = state.snapshot
    val hidden = rememberGameHidden()
    val guide by guideViewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(snapshot?.game) { snapshot?.game?.let(guideViewModel::observe) }
    val open = ProgressionGuideRoutes(onOpenConcept, onOpenConversations, onOpenNotebook)

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
                guide?.takeIf { snapshot.game != null }?.let { card ->
                    ProgressionGuide(card, open, onDismiss = guideViewModel::dismiss, onSkipAll = guideViewModel::skipAll)
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
}

/** Où mène le bouton d'une carte de Mee — la photo n'a pas d'atelier sur Android : elle ouvre La Chronique. */
internal data class ProgressionGuideRoutes(
    val concept: (ProgressionConcept) -> Unit,
    val conversations: () -> Unit,
    val notebook: () -> Unit,
) {
    fun open(destination: GuideDestination) = when (destination) {
        is GuideDestination.Concept -> concept(destination.concept)
        GuideDestination.Conversations -> conversations()
        GuideDestination.Photo -> notebook()
    }

    /** Le bouton d'une carte : l'écarter, PUIS ouvrir ce qu'elle vise (iOS `ProgressionFrontList.act(on:)`). */
    fun act(card: GuideCard, onDismiss: () -> Unit) {
        onDismiss()
        open(card.destination)
    }
}

/**
 * Mee sur la première page (iOS `ProgressionFrontList`) : la ligne courte, et au toucher la feuille de la carte
 * entière. Le bouton ferme la feuille, écarte la carte, puis ouvre ce qu'elle vise — dans cet ordre, comme iOS.
 */
@Composable
internal fun ProgressionGuide(card: GuideCard, routes: ProgressionGuideRoutes, onDismiss: () -> Unit, onSkipAll: () -> Unit) {
    var sheet by rememberSaveable(card.key) { mutableStateOf(false) }
    ProgressionGuideLine(card, onOpen = { sheet = true })
    if (sheet) {
        ProgressionGuideSheet(
            card = card,
            onClose = { sheet = false },
            onAction = { routes.act(card, onDismiss) },
            onDismiss = onDismiss,
            onSkipAll = onSkipAll,
            onPhoto = null,
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
