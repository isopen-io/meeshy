package me.meeshy.app.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import me.meeshy.sdk.post.PostComposerDraftStore
import me.meeshy.sdk.story.StoryComposerDraftStore
import javax.inject.Inject

/**
 * « Reprendre votre brouillon » at the head of the feed (#13430): the drafts the device holds for
 * the signed-in account, live, and the author's explicit « Supprimer ». Opening one is the host's
 * business — the post composer reopens on its editing draft, the story composer on its own.
 */
@HiltViewModel
class DraftResumeViewModel @Inject constructor(
    private val posts: PostComposerDraftStore,
    private val stories: StoryComposerDraftStore,
) : ViewModel() {

    val entries: StateFlow<List<DraftResumeEntry>> =
        combine(posts.observeEditing(), stories.observe(), DraftResumeEntries::from)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

    fun discard(source: DraftResumeSource) {
        viewModelScope.launch {
            runCatching {
                when (source) {
                    DraftResumeSource.POST_SLOT -> posts.clearEditing()
                    DraftResumeSource.SCENE -> if (stories.load()?.isAwaitingPublication != true) stories.clear()
                }
            }
        }
    }

    private companion object {
        const val STOP_TIMEOUT_MS = 5_000L
    }
}
