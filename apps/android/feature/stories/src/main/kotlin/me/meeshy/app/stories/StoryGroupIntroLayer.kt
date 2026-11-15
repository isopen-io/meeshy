package me.meeshy.app.stories

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeOut
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.hilt.navigation.compose.hiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.StoryTransitionEffect
import me.meeshy.sdk.model.story.StoryGroupIntro
import me.meeshy.sdk.model.story.StoryGroupIntroDismissal
import me.meeshy.sdk.model.story.StoryGroupIntroPolicy

/**
 * Ce que l'écran lit de l'interlude : s'il est affiché, l'identité, et les deux gestes. [shown] fige la lecture et
 * retient la marque « vue » : la story du nouvel auteur n'est vue qu'une fois l'interlude passé.
 */
@Stable
internal class StoryGroupIntroUi {
    var shown by mutableStateOf(false)
        internal set
    var intro: StoryGroupIntro? by mutableStateOf(null)
        internal set
    var avatarUrl: String? by mutableStateOf(null)
        internal set
    var presence: PresenceState? by mutableStateOf(null)
        internal set
    var dismissal: StoryGroupIntroDismissal by mutableStateOf(StoryGroupIntroDismissal.Tween(300))
        internal set

    /** Le retour demandé depuis l'interlude : le groupe précédent s'ouvre SANS un nouvel interlude. */
    internal var suppressNext = false

    /** Incrémenté à chaque interlude présenté : relance la retenue (un groupe qui en remplace un autre la repart). */
    var ticket by mutableIntStateOf(0)
        private set

    internal fun begin(intro: StoryGroupIntro, avatarUrl: String?, presence: PresenceState?, dismissal: StoryGroupIntroDismissal) {
        this.intro = intro
        this.avatarUrl = avatarUrl
        this.presence = presence
        this.dismissal = dismissal
        shown = true
        ticket++
    }

    internal var onSkip: () -> Unit = {}
    internal var onBack: () -> Unit = {}
}

/**
 * Pilote l'interlude d'identité (iOS `StoryViewerView+GroupIntro`) : présenté au CHANGEMENT de groupe seulement —
 * jamais à l'ouverture du lecteur —, identité immédiate (déjà résolue, sinon le substitut) enrichie pendant l'affichage,
 * retrait au bout de la retenue. Quitter le groupe annule l'interlude en cours, qu'un nouveau le remplace ou non.
 */
@Composable
internal fun rememberStoryGroupIntro(
    state: StoryViewerUiState,
    opening: StoryTransitionEffect?,
    viewModel: StoryViewerViewModel,
    identities: StoryGroupIntroViewModel = hiltViewModel(),
): StoryGroupIntroUi {
    val ui = remember { StoryGroupIntroUi() }
    val openingNow by rememberUpdatedState(opening)
    var lastGroupIndex by remember { mutableIntStateOf(NO_GROUP) }
    val hasPrevious by rememberUpdatedState(state.hasPreviousGroup)
    ui.onSkip = { ui.shown = false }
    ui.onBack = {
        ui.shown = false
        if (hasPrevious) {
            ui.suppressNext = true
            viewModel.onSwipe(StorySwipeAction.PreviousGroup)
        }
    }
    // Décidé PENDANT la composition, pas dans un effet : la lecture du nouvel auteur démarre (et marque sa story vue)
    // dans cette même passe, elle doit déjà trouver l'interlude levé.
    if (state.slides.isNotEmpty() && lastGroupIndex != state.groupIndex) {
        val previous = lastGroupIndex.takeIf { it != NO_GROUP }
        lastGroupIndex = state.groupIndex
        val group = viewModel.groupAt(state.groupIndex)
        val suppressed = ui.suppressNext
        ui.suppressNext = false
        val present = group != null && !suppressed && StoryGroupIntroPolicy.shouldPresentOnSwitch(
            previousGroupIndex = previous,
            newGroupIndex = state.groupIndex,
            isPreview = false,
            hasEntryStory = group.slides.isNotEmpty(),
        )
        if (present && group != null) {
            ui.begin(identities.immediate(group), group.avatarUrl, identities.presenceDetail(group), StoryGroupIntroPolicy.dismissal(opening))
        } else {
            ui.shown = false
        }
    }
    LaunchedEffect(state.groupIndex) {
        val neighbours = listOfNotNull(viewModel.groupAt(state.groupIndex - 1), viewModel.groupAt(state.groupIndex + 1))
        launch { identities.prefetch(neighbours) }
    }
    LaunchedEffect(ui.ticket) {
        if (!ui.shown) return@LaunchedEffect
        val group = viewModel.groupAt(state.groupIndex) ?: return@LaunchedEffect
        val enrich = launch { identities.resolve(group).let { if (ui.shown) ui.intro = it } }
        delay(StoryGroupIntroPolicy.holdMillis().toLong())
        enrich.cancel()
        ui.dismissal = StoryGroupIntroPolicy.dismissal(openingNow)
        ui.shown = false
    }
    return ui
}

/** La couche, posée en DERNIER dans la coque : au-dessus de la scène ET des contrôles. */
@Composable
internal fun StoryGroupIntroLayer(ui: StoryGroupIntroUi) {
    val exit = when (val dismissal = ui.dismissal) {
        StoryGroupIntroDismissal.Spring -> fadeOut(spring(dampingRatio = 0.82f, stiffness = Spring.StiffnessMediumLow))
        is StoryGroupIntroDismissal.Tween -> fadeOut(tween(dismissal.millis))
    }
    AnimatedVisibility(visible = ui.shown, enter = EnterTransition.None, exit = exit) {
        ui.intro?.let { intro ->
            StoryGroupIntroOverlay(
                intro = intro,
                avatarUrl = ui.avatarUrl,
                presence = ui.presence,
                onSkip = ui.onSkip,
                onBack = ui.onBack,
            )
        }
    }
}

private const val NO_GROUP = -1
