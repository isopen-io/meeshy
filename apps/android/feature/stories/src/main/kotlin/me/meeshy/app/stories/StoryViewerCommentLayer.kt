package me.meeshy.app.stories

import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.layout.layout
import androidx.compose.ui.semantics.clearAndSetSemantics
import me.meeshy.sdk.model.story.StoryComposerFold
import me.meeshy.sdk.model.story.StoryComposerGesture
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.feed.PostCommentsComposerBar
import me.meeshy.app.feed.PostCommentsThreadSheet
import me.meeshy.app.feed.PostCommentsViewModel
import me.meeshy.app.feed.rememberPostCommentsViewModel
import me.meeshy.app.feed.PostCommentsUiState
import me.meeshy.feature.stories.R
import me.meeshy.ui.haptics.rememberMeeshyHaptics

/**
 * **LES COMMENTAIRES D'UNE STORY** (#14313) — iOS `StoryComposerBarView` + `StoryCommentsOverlay` : une story est un
 * post, son fil est celui des posts. Un seul [PostCommentsViewModel] par story ouverte porte le composeur épinglé sous
 * la story ET la feuille de la liste, donc un seul brouillon, une seule cible de réponse, les mêmes pièces jointes.
 */
@Composable
internal fun rememberStoryCommentThread(storyId: String?): PostCommentsViewModel? =
    storyId?.let { rememberPostCommentsViewModel(it) }

/**
 * Un commentaire en cours d'écriture retient la story (iOS `StoryComposerHold`) : le clavier ouvert, un texte posé,
 * une pièce jointe ou un lieu en attente, un envoi en vol, ou un panneau du composeur ouvert (pièces, emojis, effets,
 * caméra, stickers, lieu, vocal) — que [StoryComposerPanels] reçoit du composeur épinglé.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun storyCommentHolds(thread: PostCommentsViewModel?, panels: StoryComposerPanels): Boolean {
    if (thread == null) return false
    val state by thread.state.collectAsStateWithLifecycle()
    return WindowInsets.isImeVisible || StoryCommentHold.holds(
        draft = state.draft,
        hasMedia = state.attachments.hasMedia,
        isSubmitting = state.isSubmitting,
        hasPlace = state.place != null,
        panelOpen = panels.open,
    )
}

/** La règle de [storyCommentHolds] hors clavier : ce que le composeur garde ou montre retient la lecture. */
internal object StoryCommentHold {
    fun holds(
        draft: String,
        hasMedia: Boolean,
        isSubmitting: Boolean,
        hasPlace: Boolean = false,
        panelOpen: Boolean = false,
    ): Boolean = draft.isNotBlank() || hasMedia || isSubmitting || hasPlace || panelOpen
}

/**
 * #14661 — un panneau du composeur épinglé est ouvert ET visible : la story ouverte le lit, le composeur l'écrit. La
 * plaque repliée garde le panneau monté à hauteur nulle : caché, il ne retient pas la story.
 */
@Stable
internal class StoryComposerPanels {
    private var reported: Boolean by mutableStateOf(false)
    private var folded: Boolean by mutableStateOf(false)

    val open: Boolean get() = reported && !folded

    fun report(open: Boolean) {
        reported = open
    }

    fun fold(folded: Boolean) {
        this.folded = folded
    }
}

internal val LocalStoryComposerPanels = compositionLocalOf { StoryComposerPanels() }

/**
 * Le composeur universel épinglé sous la story d'autrui (iOS `composerLayer` + `StoryComposerFold`). Un toucher sur la
 * plaque, hors de ses contrôles, ne fait ni avancer ni reculer la story. Un glissé VERTICAL né sur elle lui appartient
 * (dès 8 dp) et la replie à 40 dp vers le bas, sans refermer la story. Replié, il ne reste que la bulle ; la plaque
 * reste MONTÉE à hauteur nulle et invisible, pour que le brouillon et la bannière de réponse l'attendent.
 */
@Composable
internal fun StoryPinnedCommentComposer(
    thread: PostCommentsViewModel,
    folded: Boolean,
    onFoldChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by thread.state.collectAsStateWithLifecycle()
    val focus = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    val haptics = rememberMeeshyHaptics()
    val panels = LocalStoryComposerPanels.current
    LaunchedEffect(panels, folded) { panels.fold(folded) }
    val apply: (StoryComposerFold.Tap) -> Unit = { tap ->
        if (tap.resignsKeyboard) {
            keyboard?.hide()
            focus.clearFocus()
        }
        haptics.light()
        onFoldChange(tap.userFolded)
    }
    Column(modifier.fillMaxWidth().pointerInput(Unit) { detectTapGestures { } }) {
        if (folded) {
            StoryComposerUnfoldBubble(
                badge = StoryComposerFold.bubbleBadge(isRecording = false, isReplying = state.replyTarget != null),
                onUnfold = { apply(StoryComposerFold.BUBBLE_TAPPED) },
            )
        }
        Box(
            Modifier
                .foldedToNothing(folded)
                .storyComposerFoldDrag(enabled = !folded) { apply(StoryComposerFold.CHEVRON_TAPPED) },
        ) {
            Column {
                if (!folded) {
                    StoryComposerFoldChevron(
                        onFold = { apply(StoryComposerFold.CHEVRON_TAPPED) },
                        modifier = Modifier.align(Alignment.End),
                    )
                }
                PostCommentsComposerBar(viewModel = thread, onPanelOpenChange = panels::report)
            }
        }
    }
}

/** Replié : mesuré, mais posé à hauteur nulle, invisible, muet pour TalkBack et sans prise — le brouillon survit. */
private fun Modifier.foldedToNothing(folded: Boolean): Modifier =
    if (!folded) {
        this
    } else {
        this
            .layout { measurable, constraints ->
                val placeable = measurable.measure(constraints)
                layout(placeable.width, 0) { placeable.place(0, 0) }
            }
            .clipToBounds()
            .graphicsLayer { alpha = 0f }
            .clearAndSetSemantics { }
    }

/**
 * Le glissé vertical né sur le composeur lui appartient (iOS `composerDragGesture`) : dès que le vertical domine à 8 dp
 * il consomme le geste — le lecteur, qui lit les changements non consommés, cède — et un glissé bas d'au moins 40 dp
 * replie. L'horizontal n'est jamais consommé : on change encore de story depuis la bande basse.
 */
private fun Modifier.storyComposerFoldDrag(enabled: Boolean, onFold: () -> Unit): Modifier =
    if (!enabled) {
        this
    } else {
        pointerInput(Unit) {
            val toDp = 1f / density
            awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = false)
                var dx = 0f
                var dy = 0f
                var claimed = false
                do {
                    val event = awaitPointerEvent()
                    val change = event.changes.firstOrNull { it.id == down.id } ?: break
                    if (change.isConsumed && !claimed) break
                    val delta = change.positionChange()
                    dx += delta.x * toDp
                    dy += delta.y * toDp
                    if (!claimed && StoryComposerGesture.owner(dx, dy) == StoryComposerGesture.Owner.COMPOSER) claimed = true
                    if (claimed) change.consume()
                } while (event.changes.any { it.pressed })
                if (claimed && StoryComposerGesture.folds(dx, dy)) onFold()
            }
        }
    }

/** La liste des commentaires de la story, ouverte par le rail ; son composeur est le même que celui épinglé. */
@Composable
internal fun StoryCommentsThreadSheet(thread: PostCommentsViewModel, serverCommentCount: Int, onDismiss: () -> Unit) {
    val count = rememberStoryCommentCount(thread, serverCommentCount)
    PostCommentsThreadSheet(
        viewModel = thread,
        title = if (count == 0) stringResource(R.string.stories_comments_title) else pluralStringResource(R.plurals.stories_comments_count, count, count),
        onDismiss = onDismiss,
    )
}

/** Le clavier est ouvert : le rail s'efface pour ne pas couvrir le composeur (iOS `composerLift`). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun storyKeyboardVisible(): Boolean = WindowInsets.isImeVisible

/**
 * Le nombre de commentaires que le rail affiche (iOS `storyCommentCountReconciledPulse`) : celui servi, réconcilié à la
 * hausse par le fil vivant, donc un commentaire envoyé fait apparaître « Commentaires » sans attendre le serveur.
 */
@Composable
internal fun rememberStoryCommentCount(thread: PostCommentsViewModel?, served: Int): Int {
    if (thread == null) return served
    val state by thread.state.collectAsStateWithLifecycle()
    return StoryCommentCount.live(served, state.comments.size)
}

internal object StoryCommentCount {
    fun live(served: Int, threadCount: Int): Int = maxOf(served, threadCount)
}

/** Un commentaire parti (iOS `sendComment`) : retour haptique de succès, clavier refermé, la story reprend. */
@Composable
internal fun StoryCommentSentFeedback(thread: PostCommentsViewModel) {
    val state by thread.state.collectAsStateWithLifecycle()
    val haptics = rememberMeeshyHaptics()
    val keyboard = LocalSoftwareKeyboardController.current
    val focus = LocalFocusManager.current
    var wasSubmitting by remember(thread) { mutableStateOf(false) }
    LaunchedEffect(state.isSubmitting) {
        if (StoryCommentSent.justSent(wasSubmitting, state)) {
            haptics.success()
            keyboard?.hide()
            focus.clearFocus()
        }
        wasSubmitting = state.isSubmitting
    }
}

internal object StoryCommentSent {
    fun justSent(wasSubmitting: Boolean, state: PostCommentsUiState): Boolean =
        wasSubmitting && !state.isSubmitting && state.notice == null && state.errorMessage == null
}
