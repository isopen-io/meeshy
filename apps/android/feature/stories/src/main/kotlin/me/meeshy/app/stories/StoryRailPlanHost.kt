package me.meeshy.app.stories

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.hilt.navigation.compose.hiltViewModel
import me.meeshy.app.feed.PostCommentsViewModel
import me.meeshy.sdk.model.story.StoryRailContour
import me.meeshy.sdk.model.story.StoryViewerParticipation
import me.meeshy.sdk.model.story.StoryViewerParticipationMark
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.theme.hexColor

/**
 * Le plan du rail, figé à l'entrée de la slide (iOS `frozenRailPlan`) : la loi vit dans [StoryRailFreeze], ici seul le
 * relais de composition. Le plan rendu est celui du calcul courant, jamais celui d'une image en retard.
 */
@Composable
internal fun rememberFrozenRailPlan(input: StoryRailFreezeInput): StoryRailPlan {
    var frozen by remember { mutableStateOf<StoryRailFreeze?>(null) }
    val next = frozen?.next(input) ?: StoryRailFreeze.start(input)
    if (next != frozen) SideEffect { frozen = next }
    return next.plan
}

/**
 * La réconciliation d'ouverture du compteur de commentaires (iOS `storyCommentCountReconciledPulse`) : le fil a fini son
 * premier chargement. Un commentaire envoyé ou reçu ensuite ne la rejoue pas.
 */
@Composable
internal fun rememberStoryCommentsReconciled(thread: PostCommentsViewModel?): Boolean {
    if (thread == null) return false
    val state by thread.state.collectAsStateWithLifecycle()
    return !state.isLoading && (state.comments.isNotEmpty() || state.isEmpty || state.loadFailed)
}

/**
 * Ce que le rail dessine autour de ses boutons : l'état ouvert (indigo400) et les gestes déjà faits dans la session
 * (couleur d'accent de l'auteur). Le commentaire envoyé s'inscrit ici, au site où il part ; la republication vient de
 * l'état du lecteur, qui la porte déjà.
 */
@Composable
internal fun rememberStoryRailEmphasis(
    state: StoryViewerUiState,
    rail: StoryRailController,
    chrome: StoryViewerChromeState,
    commentThread: PostCommentsViewModel?,
    saving: Boolean,
): StoryRailEmphasis {
    val memory: StoryRailParticipationViewModel = hiltViewModel()
    val marks by memory.marks.collectAsStateWithLifecycle()
    val storyId = state.currentStoryId
    StoryCommentParticipation(commentThread) { memory.note(StoryViewerParticipationMark.COMMENTED, storyId) }
    val sessionMarks = storyId?.let { marks[it] }.orEmpty()
    val participation = StoryViewerParticipation.of(
        marks = if (state.hasReposted) sessionMarks + StoryViewerParticipationMark.REPOSTED else sessionMarks,
        hasReacted = state.myReactions.isNotEmpty(),
    )
    val authorAccent = remember(state.authorName) {
        state.authorName.takeIf { it.isNotBlank() }?.let { hexColor(DynamicColorGenerator.colorForName(it)) }
    }
    return StoryRailEmphasis(
        isMuted = state.isMuted,
        live = StoryRailContour.Live(
            soundOn = !state.isMuted,
            reactionBarOpen = rail.reactionBarVisible,
            commentsOpen = chrome.showComments,
            languagesOpen = rail.languageBarVisible || state.languageExplorer != null,
        ),
        participation = participation,
        authorAccent = authorAccent ?: StoryRailEmphasis().authorAccent,
        saving = saving,
    )
}

@Composable
private fun StoryCommentParticipation(thread: PostCommentsViewModel?, onSent: () -> Unit) {
    if (thread == null) return
    val state by thread.state.collectAsStateWithLifecycle()
    var wasSubmitting by remember(thread) { mutableStateOf(false) }
    LaunchedEffect(state.isSubmitting) {
        if (StoryCommentSent.justSent(wasSubmitting, state)) onSent()
        wasSubmitting = state.isSubmitting
    }
}
