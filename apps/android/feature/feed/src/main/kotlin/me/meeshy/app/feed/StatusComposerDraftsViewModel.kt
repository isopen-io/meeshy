package me.meeshy.app.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.sdk.post.StatusComposerDraftStore
import javax.inject.Inject

/**
 * The mood composer's autosave (#13430, iso iOS #8848): every edit reaches the durable draft
 * after a short calm, the sheet reopens on it, and a publish erases it. A republication is
 * never kept — it carries its source. Belongs to the account: the store is emptied at sign-out.
 */
@HiltViewModel
class StatusComposerDraftsViewModel @Inject constructor(
    private val drafts: StatusComposerDraftStore,
) : ViewModel() {

    private var pending: Job? = null

    /** What the composer reopens on, or `null` when nothing worth restoring was kept. */
    suspend fun restorable(): StatusComposerDraft? =
        runCatching { drafts.load() }.getOrNull()
            ?.takeIf { it.isWorthRestoring }
            ?.toComposerDraft()

    fun persist(draft: StatusComposerDraft) {
        if (draft.isRepublish) return
        pending?.cancel()
        pending = viewModelScope.launch {
            delay(SAVE_DEBOUNCE_MS)
            val snapshot = draft.toSnapshot(System.currentTimeMillis())
            runCatching { if (snapshot.isWorthRestoring) drafts.save(snapshot) else drafts.clear() }
        }
    }

    /** The mood left (published): no pending write may bring the draft back. */
    fun discard() {
        viewModelScope.launch {
            pending?.cancelAndJoin()
            pending = null
            runCatching { drafts.clear() }
        }
    }

    companion object {
        const val SAVE_DEBOUNCE_MS = 400L
    }
}
