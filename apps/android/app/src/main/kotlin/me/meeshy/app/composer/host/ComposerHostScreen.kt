package me.meeshy.app.composer.host

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner
import me.meeshy.app.feed.MoodComposerContent
import me.meeshy.app.feed.StatusComposerDraftsViewModel
import me.meeshy.app.feed.StatusesViewModel
import me.meeshy.app.stories.StoryComposerContent
import me.meeshy.sdk.model.composer.ComposerFormatVariant
import me.meeshy.ui.component.composer.HostedSelection
import me.meeshy.ui.component.composer.LocalHostedSelection
import me.meeshy.ui.component.composer.LocalOnComposerPlateau

/**
 * UN composeur, UNE vue (#13863 R1) : la story, le post et le réel se composent sur la MÊME scène, quelle que soit la porte
 * (fil, tuile story, partage, reprise d'un non-envoyé). Le format est un champ du document, choisi au chevron de
 * « Publier ▾ » : le changer ne déplace rien — la scène reste la même, seule la table [ComposerFormatVariant] varie. Seule
 * l'humeur garde sa feuille, et sa pastille de format pour en sortir.
 *
 * [feedOwner] est l'entrée du FIL quand elle est dans la pile : les ViewModels des moods et de leurs brouillons y sont
 * PARTAGÉS avec l'écran qu'on quitte, pour qu'une sauvegarde différée survive à la fermeture de l'hôte. Hors du fil (porte du
 * plateau de stories), l'hôte garde ses propres instances.
 */
@Composable
fun ComposerHostScreen(
    onClose: () -> Unit,
    feedOwner: ViewModelStoreOwner? = null,
    viewModel: ComposerHostViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val keyboardOwed by viewModel.keyboardOwed.collectAsStateWithLifecycle()
    val seed by viewModel.seed.collectAsStateWithLifecycle()
    // Une graine périmée ou déjà reprise : il n'y a rien à composer, le composeur ne s'ouvre pas sur du vide.
    LaunchedEffect(seed) { if (seed is SeedState.Lost) onClose() }
    val shared = feedOwner ?: checkNotNull(LocalViewModelStoreOwner.current)
    val formatChevron: @Composable () -> Unit = {
        ComposerFormatChevron(
            checked = state.publishedFormats,
            verdicts = state.verdicts,
            onToggle = viewModel::toggle,
            layouts = state.layoutChoices,
            armedLayout = state.layout,
            onChooseLayout = viewModel::chooseLayout,
        )
    }
    val hostedSelection = remember(viewModel) { HostedSelection(initial = { viewModel.selection }, onChange = viewModel::onSelection) }
    CompositionLocalProvider(LocalHostedSelection provides hostedSelection, LocalOnComposerPlateau provides true) {
        if (ComposerFormatVariant.of(state.selectedFormat).composesOnScene) {
            StoryComposerContent(
                formats = state.publishedFormats,
                layout = state.layout,
                onFacts = viewModel::onSceneFacts,
                onClose = onClose,
                formatChevron = formatChevron,
                seedMedia = (seed as? SeedState.Ready)?.items.orEmpty(),
                seedText = state.text,
                seededByDoor = viewModel.seededByDoor,
                onSeedApplied = viewModel::onSeedApplied,
                onFormatRestored = viewModel::restore,
                raisePostText = keyboardOwed,
                onPostTextRaised = viewModel::onKeyboardRaised,
                opening = viewModel.opening,
            )
        } else {
            MoodComposerContent(
                seedText = state.text,
                onText = viewModel::onMoodFacts,
                onClose = onClose,
                formatSlot = {
                    ComposerFormatMenu(selected = state.selectedFormat, verdicts = state.verdicts, onChoose = viewModel::choose)
                },
                viewModel = hiltViewModel<StatusesViewModel>(shared),
                drafts = hiltViewModel<StatusComposerDraftsViewModel>(shared),
            )
        }
    }
}
