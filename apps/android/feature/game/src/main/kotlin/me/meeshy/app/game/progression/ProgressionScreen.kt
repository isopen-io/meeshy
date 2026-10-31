package me.meeshy.app.game.progression

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.game.pages.GameDoorRow
import me.meeshy.app.game.pages.GameHiddenCard
import me.meeshy.app.game.pages.GameSettingsDoor
import me.meeshy.app.game.pages.rememberGameHidden
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.motion.staggeredAppear
import me.meeshy.ui.theme.MeeshySpacing

/**
 * L'ÉCRAN « PROGRESSION » — la PREMIÈRE PAGE du jeu (iOS `ProgressionView`). Elle ne porte que des CARTES, une par
 * concept servi, dans l'ordre que [me.meeshy.sdk.model.game.progression.ProgressionConcepts] déclare pour tous les
 * clients ; dans l'en-tête, à droite du titre, le blason de rang et le compteur de Meeshes. La carte entière ouvre la
 * FICHE du concept. **Aucun geste du jeu ne vit dans la liste.** En dessous, « Comment ça marche » et Réglages, en lignes
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
    viewModel: ProgressionViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snapshot = state.snapshot
    val hidden = rememberGameHidden()

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
                ProgressionDoors(hasGame = snapshot.game != null, onOpenRules = onOpenRules, onOpenSettings = onOpenSettings)
            }
        }
    }
}

/**
 * Les PORTES du bas de la première page (iOS `ProgressionFrontList`) : « Comment ça marche » ouvre le carnet des règles,
 * puis Réglages. Le carnet ne s'offre qu'avec le bloc de jeu, comme sur iOS ; Réglages reste toujours atteignable.
 */
@Composable
internal fun ProgressionDoors(hasGame: Boolean, onOpenRules: () -> Unit, onOpenSettings: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        if (hasGame) {
            GameDoorRow(icon = MeeshyIcons.Info, title = stringResource(R.string.game_door_rules), onOpen = onOpenRules)
        }
        GameSettingsDoor(onOpenSettings)
    }
}

/** Le décalage entre deux cartes est plafonné : la quinzième n'attend pas une seconde. */
private const val MAX_STAGGER_RANK = 8
