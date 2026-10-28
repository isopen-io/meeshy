package me.meeshy.app.feed

import androidx.compose.foundation.layout.Row
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.composer.ComposerFormat
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.hilt.navigation.compose.hiltViewModel
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.ReelComposition
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.model.composer.CarriedMedia
import me.meeshy.sdk.model.composer.ComposerCarry

/**
 * What the unified composer host needs to know about a post composition to let the format breathe —
 * the text and the media kinds, nothing the host would have to interpret.
 */
data class PostComposerFacts(
    val text: String,
    val media: List<CarriedMedia>,
    val visibility: StoryVisibility,
) {
    val kinds: List<ReelComposition.MediaKind>
        get() = media.map { ReelComposition.MediaKind(it.media.mimeType, it.media.durationMs) }
}

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
    offerReel: Boolean = false,
    onFormatChosen: (ComposerFormat) -> Unit = {},
    carry: ComposerCarry? = null,
    onCarryApplied: (token: Int, lost: Int) -> Unit = { _, _ -> },
    viewModel: FeedViewModel = hiltViewModel(),
) {
    val carryAtMount = remember { carry }
    var pendingOffer by remember { mutableStateOf<FeedComposerDraft?>(null) }
    fun publish(draft: FeedComposerDraft) {
        val request = draft.publishRequest() ?: return
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
    }
    pendingOffer?.let { draft ->
        ReelOfferDialog(
            onReel = { pendingOffer = null; onFormatChosen(ComposerFormat.REEL); publish(draft.withForcePlainPost(false)) },
            onPost = { pendingOffer = null; onFormatChosen(ComposerFormat.POST); publish(draft.withForcePlainPost(true)) },
            onCancel = { pendingOffer = null },
        )
    }
    val seed by produceState<FeedComposerDraft?>(null, viewModel) {
        val restored = viewModel.restorableDraft()
        val base = (restored ?: FeedComposerDraft()).let { if (seedText.isNotBlank() && seedText != it.text) it.withText(seedText) else it }
        val postCarry = carryAtMount?.takeIf { it.target == ComposerCarry.Side.POST }
        val carried = postCarry?.let { base.withCarry(it) }
        value = carried?.draft ?: base
        postCarry?.let { onCarryApplied(it.token, carried?.lost ?: 0) }
    }
    val initial = seed ?: return
    FeedComposerSheet(
        initialDraft = initial,
        onPublish = { _, draft -> if (offerReel) pendingOffer = draft else publish(draft) },
        onDismiss = onClose,
        onDraftChange = { draft ->
            viewModel.persistComposerDraft(draft)
            onFacts(PostComposerFacts(draft.text, draft.carriedMedia(), draft.visibility.storyVisibility()))
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

/** « Publier en réel ? » (#8603): one qualifying video composed as a post — the reel is the PREFERRED answer. */
@Composable
private fun ReelOfferDialog(onReel: () -> Unit, onPost: () -> Unit, onCancel: () -> Unit) {
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text(stringResource(R.string.feed_reel_offer_title)) },
        text = { Text(stringResource(R.string.feed_reel_offer_body)) },
        confirmButton = { TextButton(onClick = onReel) { Text(stringResource(R.string.feed_reel_offer_reel)) } },
        dismissButton = {
            Row {
                TextButton(onClick = onCancel) { Text(stringResource(R.string.feed_composer_cancel)) }
                TextButton(onClick = onPost) { Text(stringResource(R.string.feed_reel_offer_post)) }
            }
        },
    )
}
