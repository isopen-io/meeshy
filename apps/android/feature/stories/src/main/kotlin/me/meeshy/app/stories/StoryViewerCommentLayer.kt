package me.meeshy.app.stories

import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.app.feed.PostCommentsComposerBar
import me.meeshy.app.feed.PostCommentsThreadSheet
import me.meeshy.app.feed.PostCommentsViewModel
import me.meeshy.app.feed.rememberPostCommentsViewModel
import me.meeshy.feature.stories.R

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
    val state by thread.state.collectAsStateWithLifecycle()
    val count = maxOf(serverCommentCount, state.comments.size)
    PostCommentsThreadSheet(
        viewModel = thread,
        title = if (count == 0) stringResource(R.string.stories_comments_title) else pluralStringResource(R.plurals.stories_comments_count, count, count),
        onDismiss = onDismiss,
    )
}
