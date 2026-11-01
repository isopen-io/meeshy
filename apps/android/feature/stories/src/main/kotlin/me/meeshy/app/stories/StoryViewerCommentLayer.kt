package me.meeshy.app.stories

import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
 * une pièce jointe ou un envoi en vol.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun storyCommentHolds(thread: PostCommentsViewModel?): Boolean {
    if (thread == null) return false
    val state by thread.state.collectAsStateWithLifecycle()
    return WindowInsets.isImeVisible || StoryCommentHold.holds(state.draft, state.attachments.hasMedia, state.isSubmitting)
}

/** La règle de [storyCommentHolds] hors clavier : ce que le composeur garde retient la lecture. */
internal object StoryCommentHold {
    fun holds(draft: String, hasMedia: Boolean, isSubmitting: Boolean): Boolean = draft.isNotBlank() || hasMedia || isSubmitting
}

/**
 * Le composeur universel épinglé sous la story d'autrui (iOS `composerLayer`). Un toucher sur la plaque, hors de ses
 * contrôles, ne fait ni avancer ni reculer la story.
 */
@Composable
internal fun StoryPinnedCommentComposer(thread: PostCommentsViewModel, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().pointerInput(Unit) { detectTapGestures { } }) {
        PostCommentsComposerBar(viewModel = thread)
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
