package me.meeshy.app.feed

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.hilt.navigation.compose.hiltViewModel
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.ReelComposition

/**
 * What the unified composer host needs to know about a post composition to let the format breathe —
 * the text and the media kinds, nothing the host would have to interpret.
 */
data class PostComposerFacts(val text: String, val media: List<ReelComposition.MediaKind>)

/**
 * The post / reel body of the ONE composer: the existing [FeedComposerSheet] mounted as a CONTENT of
 * the host (same draft autosave, same durable outbox publish, same media pipeline) instead of a
 * separate door. [seedText] is what the author already wrote under another format; [formatSlot] is the
 * host's format choice, drawn in the sheet's own top corridor.
 */
@Composable
fun PostComposerContent(
    seedText: String,
    onFacts: (PostComposerFacts) -> Unit,
    onClose: () -> Unit,
    onMediaError: (String) -> Unit,
    formatSlot: @Composable () -> Unit,
    governingType: PostType? = null,
    viewModel: FeedViewModel = hiltViewModel(),
) {
    val seed by produceState<FeedComposerDraft?>(null, viewModel) {
        val restored = viewModel.restorableDraft()
        value = (restored ?: FeedComposerDraft()).let { if (it.text.isBlank() && seedText.isNotBlank()) it.withText(seedText) else it }
    }
    val initial = seed ?: return
    FeedComposerSheet(
        initialDraft = initial,
        onPublish = { request, draft ->
            viewModel.publishPost(
                content = request.content,
                visibility = request.visibility,
                mediaIds = request.mediaIds,
                type = request.type,
                location = request.location,
                language = request.language,
                mediaAlt = request.mediaAlt,
                draft = draft.toSnapshot(System.currentTimeMillis()),
            )
            onClose()
        },
        onDismiss = onClose,
        onDraftChange = { draft ->
            viewModel.persistComposerDraft(draft)
            onFacts(PostComposerFacts(draft.text, draft.media.map { ReelComposition.MediaKind(it.mimeType, it.durationMs) }))
        },
        onQueueMedia = viewModel::queueMedia,
        onRemoveMedia = viewModel::discardQueuedMedia,
        onUploadMedia = viewModel::uploadMedia,
        onMediaError = onMediaError,
        formatSlot = formatSlot,
        governingType = governingType,
    )
}

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
        value = if (restored.text.isBlank() && seedText.isNotBlank()) restored.withText(seedText) else restored
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
