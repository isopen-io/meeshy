package me.meeshy.app.feed

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.hilt.navigation.compose.hiltViewModel

/** The mood body of the ONE composer: [StatusComposerSheet] as a content of the host. */
@Composable
fun MoodComposerContent(
    seedText: String,
    onText: (String, emoji: String?) -> Unit,
    onClose: () -> Unit,
    formatSlot: @Composable () -> Unit,
    viewModel: StatusesViewModel = hiltViewModel(),
    drafts: StatusComposerDraftsViewModel = hiltViewModel(),
) {
    val seed by produceState<StatusComposerDraft?>(null, drafts) {
        val restored = drafts.restorable() ?: StatusComposerDraft()
        value = if (seedText.isNotBlank() && seedText != restored.text) restored.withText(seedText) else restored
    }
    val initial = seed ?: return
    StatusComposerSheet(
        initialDraft = initial,
        onPublish = { request ->
            viewModel.setStatus(
                emoji = request.emoji,
                content = request.content,
                visibility = request.visibility,
                audioUrl = request.audioUrl,
                repostOfId = request.repostOfId,
                viaUsername = request.viaUsername,
            )
            drafts.discard()
            onClose()
        },
        onDraftChange = { draft ->
            drafts.persist(draft)
            // The seed (possibly clamped to the mood's 122 characters) is not the author's word: only an edit reports.
            if (draft !== initial) onText(draft.text, draft.selectedEmoji)
        },
        onDismiss = onClose,
        formatSlot = formatSlot,
    )
}
