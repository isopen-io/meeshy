package me.meeshy.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.LaunchedEffect
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.map
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.wrapContentHeight
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.card.PostCommentCardLabels
import me.meeshy.sdk.model.card.PostCommentCardPost
import me.meeshy.sdk.model.card.PostCommentCardSubject
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.mention.MentionAutocompleteState
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.sdk.model.composer.ComposerConfiguration
import me.meeshy.ui.component.composer.LocalUniversalComposer
import me.meeshy.ui.component.composer.UniversalComposerSpec
import me.meeshy.ui.component.composer.rememberComposerMediaIntake
import me.meeshy.ui.component.message.MeeshyMentionSuggestions
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.component.bubble.LanguageChip
import me.meeshy.ui.component.bubble.RichMessageText
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * The comment thread beneath a post in [PostDetailScreen]. Hosts its own
 * [PostCommentsViewModel] (scoped to the same nav entry, so it reads the same `postId`)
 * and renders — top to bottom — a section header, the projected comments (each Prisme-
 * resolved, an optimistic row dimmed until confirmed) and an optional "show more" affordance;
 * its composer is [PostCommentsComposerBar], pinned by the screen. Accent-coherent (Indigo) with the post card above it.
 */
@Composable
internal fun PostCommentsSection(
    viewModel: PostCommentsViewModel = hiltViewModel(),
    modifier: Modifier = Modifier,
    onNotice: suspend (CommentNotice) -> Unit = {},
    support: PostCommentCardPost? = null,
    showsTitle: Boolean = true,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(viewModel) {
        viewModel.state.map { it.notice }.distinctUntilChanged().filterNotNull().collect { notice ->
            viewModel.consumeNotice()
            onNotice(notice)
        }
    }

    val imaging = rememberCommentImaging(viewModel, support)
    CommentMediaFullscreen { CommentsColumn(state, viewModel, modifier, imaging, showsTitle) }
}

/**
 * #13922 — « Imager » un commentaire ouvre l'atelier de carte que l'application fournit ([LocalCommentCardExporter]) ;
 * sans lui, l'entrée n'existe pas. La carte se compose au moment du geste, sur le fil chargé.
 */
@Composable
private fun rememberCommentImaging(viewModel: PostCommentsViewModel, support: PostCommentCardPost?): CommentImaging? {
    val exporter = LocalCommentCardExporter.current ?: return null
    val title = stringResource(R.string.feed_comment_card_thread)
    val folded = stringResource(R.string.feed_comment_card_folded)
    val labels = remember(title, folded) { PostCommentCardLabels(thread = title, folded = { count -> String.format(folded, count) }) }
    var imaged by remember { mutableStateOf<Pair<String, PostCommentCardSubject>?>(null) }
    imaged?.let { (id, card) -> exporter(id, card) { imaged = null } }
    return remember(viewModel, support, labels) {
        CommentImaging(
            cardOf = { id -> viewModel.commentCard(id, support, labels) },
            open = { id, card -> imaged = id to card },
        )
    }
}

@Composable
private fun CommentsColumn(state: PostCommentsUiState, viewModel: PostCommentsViewModel, modifier: Modifier, imaging: CommentImaging?, showsTitle: Boolean) {
    Column(modifier = modifier.fillMaxWidth()) {
        if (showsTitle) {
            Text(
                text = stringResource(R.string.post_comments_title),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.padding(bottom = MeeshySpacing.sm),
            )
        }

        when {
            state.showSkeleton -> CommentsSkeleton()
            state.loadFailed -> Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(vertical = MeeshySpacing.sm),
            ) {
                Text(
                    text = stringResource(R.string.post_comments_load_error),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MeeshyTheme.tokens.textSecondary,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = viewModel::retryLoad) {
                    Text(stringResource(R.string.feed_retry), color = MeeshyPalette.Indigo500)
                }
            }
            state.isEmpty -> Text(
                text = stringResource(R.string.post_comments_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.padding(vertical = MeeshySpacing.md),
            )
            else -> Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                state.comments.forEach { comment ->
                    CommentRow(
                        comment = comment,
                        mentionDisplayNames = state.mentionDisplayNames,
                        onToggleLike = viewModel::toggleLike,
                        onReply = viewModel::beginReply,
                        onFlagTap = viewModel::onCommentFlagTap,
                        onDelete = viewModel::deleteComment,
                        imaging = imaging,
                    )
                    ReplyThread(
                        comment = comment,
                        thread = state.replyThreads[comment.id],
                        mentionDisplayNames = state.mentionDisplayNames,
                        onToggleReplies = viewModel::toggleReplies,
                        onToggleLike = viewModel::toggleLike,
                        onReply = viewModel::beginReply,
                        onFlagTap = viewModel::onCommentFlagTap,
                        onDelete = viewModel::deleteComment,
                        imaging = imaging,
                    )
                }
            }
        }

        if (state.canLoadMore) {
            TextButton(
                onClick = viewModel::loadMore,
                enabled = !state.isLoadingMore,
            ) {
                Text(stringResource(R.string.post_comments_load_more), color = MeeshyPalette.Indigo500)
            }
        }

    }
}

/**
 * #14285 — le composeur des commentaires, ÉPINGLÉ sous le fil comme la barre de saisie d'iOS : l'écran du détail le pose
 * hors du défilement, au-dessus du clavier. Il lit le même [PostCommentsViewModel] que la section (même entrée de
 * navigation), donc le brouillon, la cible de la réponse et les pièces jointes restent une seule source.
 */
@Composable
fun PostCommentsComposerBar(
    viewModel: PostCommentsViewModel = hiltViewModel(),
    modifier: Modifier = Modifier,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val editPiece = rememberCommentPieceRetouch(onReplace = viewModel::replaceMedia)
    Box(modifier.fillMaxWidth()) {
        CommentComposer(
            draft = state.draft,
            mention = state.mention,
            isSubmitting = state.isSubmitting,
            canSubmit = state.canSubmit,
            attachments = state.attachments,
            replyTarget = state.replyTarget,
            onDraftChange = viewModel::onDraftChange,
            onMentionSelected = viewModel::onMentionSelected,
            onAttach = viewModel::attachMedia,
            onEditPiece = editPiece,
            onRemovePiece = viewModel::removeMedia,
            onSubmit = viewModel::submit,
            onCancelReply = viewModel::cancelReply,
        )
    }
}

@Composable
private fun CommentRow(
    comment: CommentPresentation,
    mentionDisplayNames: Map<String, String>,
    onToggleLike: (String) -> Unit,
    onReply: (String) -> Unit,
    onFlagTap: (String, String) -> Unit,
    onDelete: (String) -> Unit,
    imaging: CommentImaging? = null,
) {
    val unknownAuthor = stringResource(R.string.feed_unknown_author)
    val timeText = comment.createdAtIso?.let { detailRelativeTime(it) }
    val replyLabelFormat = stringResource(R.string.post_comments_reply_a11y_label)
    val textBlockSemantics = if (comment.isReply) {
        Modifier.semantics(mergeDescendants = true) {
            contentDescription = comment.accessibilityLabel(replyLabelFormat, timeText.orEmpty(), unknownAuthor)
        }
    } else {
        Modifier
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .alpha(if (comment.isPending) 0.5f else 1f),
    ) {
        MeeshyAvatar(name = comment.authorName ?: unknownAuthor, size = 32.dp, imageUrl = comment.authorAvatarUrl, presence = rememberPresence(comment.authorId))
        Spacer(Modifier.width(MeeshySpacing.sm))
        Column(Modifier.weight(1f)) {
            Column(textBlockSemantics) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = comment.authorName ?: unknownAuthor,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textPrimary,
                )
                if (comment.isReply) {
                    Spacer(Modifier.width(MeeshySpacing.xs))
                    Text(
                        text = stringResource(R.string.post_comments_reply_badge),
                        style = MaterialTheme.typography.labelSmall,
                        color = MeeshyPalette.Indigo500,
                        modifier = Modifier
                            .clip(RoundedCornerShape(MeeshyRadius.sm))
                            .background(MeeshyPalette.Indigo500.copy(alpha = 0.12f))
                            .padding(horizontal = 6.dp, vertical = 1.dp),
                    )
                }
                timeText?.let {
                    Spacer(Modifier.width(MeeshySpacing.xs))
                    Text(
                        text = it,
                        style = MaterialTheme.typography.labelSmall,
                        color = MeeshyTheme.tokens.textSecondary,
                    )
                }
            }
            if (comment.hasBody) {
                SelectionContainer {
                    RichMessageText(
                        text = comment.content,
                        color = MeeshyTheme.tokens.textPrimary,
                        style = MaterialTheme.typography.bodyMedium,
                        linkColor = MeeshyPalette.Indigo500,
                        mentionDisplayNames = mentionDisplayNames.ifEmpty { null },
                    )
                }
            }
            }
            CommentMediaStrip(comment.media)
            if (comment.languageStrip.isNotEmpty()) {
                Spacer(Modifier.height(2.dp))
                CommentLanguageStrip(
                    chips = comment.languageStrip,
                    onChipTap = { code -> onFlagTap(comment.id, code) },
                )
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                CommentLikeButton(comment = comment, onToggleLike = onToggleLike)
                CommentReplyButton(comment = comment, onReply = onReply)
                CommentMoreMenu(comment = comment, onDelete = onDelete, imaging = imaging)
            }
        }
    }
}

/**
 * The subtle Prisme language strip beneath a translated comment: a discreet translate glyph plus
 * a flag chip per language the viewer can explore (original + configured content languages that
 * carry text). The active chip is tinted with the language's accent; tapping a chip switches the
 * comment's displayed language (or reverts when it's already active). Mirror of the post detail's
 * `DetailLanguageStrip`, kept compact for the comment context. Accent-coherent with the section.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CommentLanguageStrip(
    chips: List<LanguageChip>,
    onChipTap: (String) -> Unit,
) {
    FlowRow(
        verticalArrangement = Arrangement.Center,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(
            imageVector = Icons.Filled.Translate,
            contentDescription = stringResource(R.string.feed_translated),
            tint = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.size(13.dp),
        )
        chips.forEach { chip ->
            val info = chip.info
            val accent = info?.colorHex
                ?.let(::hexColor)
                ?.takeIf { it != Color.Unspecified }
                ?: MeeshyTheme.tokens.textSecondary
            val flag = info?.flag ?: chip.code.uppercase()
            val label = info?.name ?: chip.code
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .clip(RoundedCornerShape(MeeshyRadius.sm))
                    .background(if (chip.isActive) accent.copy(alpha = 0.16f) else Color.Transparent)
                    .clickable { onChipTap(chip.code) }
                    .padding(horizontal = 5.dp, vertical = 2.dp)
                    .semantics(mergeDescendants = true) {
                        role = Role.Button
                        contentDescription = label
                    },
            ) {
                Text(text = flag, style = MaterialTheme.typography.labelSmall)
                if (chip.isActive && info != null) {
                    Text(
                        text = info.nativeName,
                        style = MaterialTheme.typography.labelSmall,
                        color = accent,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(start = 3.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun CommentReplyButton(comment: CommentPresentation, onReply: (String) -> Unit) {
    val label = stringResource(R.string.post_comments_reply_action)
    Text(
        text = label,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.SemiBold,
        color = MeeshyTheme.tokens.textSecondary,
        modifier = Modifier
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .clickable(enabled = !comment.isPending) { onReply(comment.id) }
            .semantics { role = Role.Button; contentDescription = label }
            .heightIn(min = 44.dp)
            .wrapContentHeight()
            .padding(horizontal = MeeshySpacing.sm),
    )
}

/**
 * The 1-level reply thread beneath a top-level [comment]. Three states:
 * - **preview** (loaded but collapsed — auto-preloaded, or a collapsed thread falling back to its
 *   taste): shows the first replies inline, then a "View all N replies" affordance when more exist;
 * - **expanded**: the full indented reply list plus a "Hide replies" toggle;
 * - **collapsed, not yet loaded**: just a "View N replies" toggle (a discreet spinner while it
 *   fetches). Renders nothing when the comment has no replies, no preview, and isn't expanded.
 * Accent-coherent (Indigo) with the thread; the preview means sub-comments are never hidden
 * behind a mandatory tap.
 */
@Composable
private fun ReplyThread(
    comment: CommentPresentation,
    thread: ReplyThreadUiState?,
    mentionDisplayNames: Map<String, String>,
    onToggleReplies: (String) -> Unit,
    onToggleLike: (String) -> Unit,
    onReply: (String) -> Unit,
    onFlagTap: (String, String) -> Unit,
    onDelete: (String) -> Unit,
    imaging: CommentImaging? = null,
) {
    val isExpanded = thread?.isExpanded == true
    val isPreview = thread?.isPreview == true
    if (comment.replyCount <= 0 && !isExpanded && !isPreview) return

    Column(modifier = Modifier.padding(start = CommentThreadLayout.replyIndentDp(depth = 1).dp, top = MeeshySpacing.xs)) {
        if (isPreview && thread != null) {
            Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                thread.replies.forEach { reply ->
                    CommentRow(
                        comment = reply,
                        mentionDisplayNames = mentionDisplayNames,
                        onToggleLike = onToggleLike,
                        onReply = onReply,
                        onFlagTap = onFlagTap,
                        onDelete = onDelete,
                        imaging = imaging,
                    )
                }
            }
            Spacer(Modifier.height(MeeshySpacing.xs))
        }

        val showToggle = isExpanded || !isPreview || (thread?.hiddenReplyCount ?: 0) > 0
        if (showToggle) {
            val accent = if (MeeshyTheme.isDark) MeeshyPalette.Indigo400 else MeeshyPalette.Indigo500
            val moreRepliesHint = stringResource(R.string.post_comments_load_more_replies_hint)
            val remaining = thread?.hiddenReplyCount ?: 0
            val label = when {
                isExpanded -> stringResource(R.string.post_comments_hide_replies)
                isPreview && remaining > 0 -> pluralStringResource(
                    R.plurals.post_comments_load_more_replies,
                    remaining,
                    remaining,
                )
                isPreview -> pluralStringResource(
                    R.plurals.post_comments_view_all_replies,
                    comment.replyCount,
                    comment.replyCount,
                )
                else -> pluralStringResource(
                    R.plurals.post_comments_view_replies,
                    comment.replyCount,
                    comment.replyCount,
                )
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                modifier = Modifier
                    .clip(RoundedCornerShape(MeeshyRadius.pill))
                    .clickable(onClickLabel = moreRepliesHint) { onToggleReplies(comment.id) }
                    .semantics { role = Role.Button; contentDescription = label }
                    .heightIn(min = 48.dp)
                    .padding(vertical = 2.dp, horizontal = 2.dp),
            ) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = accent,
                )
                if (thread?.isLoading == true) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(14.dp),
                        strokeWidth = 2.dp,
                        color = accent,
                    )
                }
            }
        }

        if (isExpanded && thread != null) {
            Spacer(Modifier.height(MeeshySpacing.sm))
            Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                thread.replies.forEach { reply ->
                    CommentRow(
                        comment = reply,
                        mentionDisplayNames = mentionDisplayNames,
                        onToggleLike = onToggleLike,
                        onReply = onReply,
                        onFlagTap = onFlagTap,
                        onDelete = onDelete,
                        imaging = imaging,
                    )
                }
            }
        }
    }
}

@Composable
private fun CommentLikeButton(comment: CommentPresentation, onToggleLike: (String) -> Unit) {
    val label = stringResource(if (comment.isLiked) R.string.feed_unlike else R.string.feed_like)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = Modifier
            .defaultMinSize(minWidth = 44.dp, minHeight = 44.dp)
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .clickable(enabled = !comment.isPending) { onToggleLike(comment.id) }
            .semantics { role = Role.Button; contentDescription = label }
            .padding(horizontal = MeeshySpacing.xs),
    ) {
        Icon(
            imageVector = if (comment.isLiked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
            contentDescription = null,
            tint = if (comment.isLiked) MeeshyPalette.Error else MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.size(16.dp),
        )
        if (comment.likeCount > 0) {
            Text(
                text = comment.likeCount.toString(),
                style = MaterialTheme.typography.labelSmall,
                color = if (comment.isLiked) MeeshyPalette.Error else MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

/**
 * **LE COMPOSEUR DES COMMENTAIRES EST CELUI DES CONVERSATIONS** (#14265, iOS `UniversalComposerBar(mode: .comment)`) :
 * réglé pour un commentaire, il offre texte, emoji, vocal, photothèque et caméra ; ce qu'on joint rejoint le bandeau,
 * se téléverse aussitôt, et part avec le commentaire. Au-dessus de la saisie : les mentions, la cible de la réponse et
 * les pièces en attente.
 */
@Composable
private fun CommentComposer(
    draft: String,
    mention: MentionAutocompleteState,
    isSubmitting: Boolean,
    canSubmit: Boolean,
    attachments: CommentAttachmentTray,
    replyTarget: ReplyTarget?,
    onDraftChange: (String) -> Unit,
    onMentionSelected: (MentionCandidate) -> Unit,
    onAttach: (MediaUploadItem) -> Unit,
    onEditPiece: (CommentPendingPiece) -> Unit,
    onRemovePiece: (String) -> Unit,
    onSubmit: () -> Unit,
    onCancelReply: () -> Unit,
) {
    val composer = LocalUniversalComposer.current ?: return
    val intake = rememberComposerMediaIntake(onAttach)
    val canAttach = !attachments.isFull && !isSubmitting
    val focusTrigger = rememberReplyFocusTrigger(replyTarget)
    val placeholder = stringResource(if (replyTarget != null) R.string.post_comments_composer_reply_hint else R.string.post_comments_composer_hint)
    composer(
        UniversalComposerSpec(
            configuration = ComposerConfiguration.COMMENT,
            draft = draft,
            placeholder = placeholder,
            canSend = canSubmit && !isSubmitting,
            onDraftChange = onDraftChange,
            onSend = onSubmit,
            hasPendingAttachments = attachments.hasMedia,
            pendingAttachmentCount = attachments.pieces.size,
            focusTrigger = focusTrigger,
            onAttachUris = intake.onUris.takeIf { canAttach },
            onAttachFile = intake.onFile.takeIf { canAttach },
            topSlot = {
                MeeshyMentionSuggestions(mention = mention, onSelect = onMentionSelected)
                if (replyTarget != null) ReplyTargetChip(target = replyTarget, onCancelReply = onCancelReply)
                CommentAttachmentBar(tray = attachments, onEdit = onEditPiece, onRemove = onRemovePiece)
            },
        ),
        Modifier,
    )
}

/** Viser un commentaire pour y répondre rend la main au champ (iOS `beginReply` → `composerFocusTrigger`). */
@Composable
private fun rememberReplyFocusTrigger(replyTarget: ReplyTarget?): Int {
    var trigger by remember { mutableIntStateOf(0) }
    LaunchedEffect(replyTarget) { if (replyTarget != null) trigger += 1 }
    return trigger
}

/**
 * The "Replying to @name" chip pinned above the composer while a [ReplyTarget] is active,
 * with a discreet close affordance to drop back to a top-level comment. Accent-coherent Indigo.
 */
@Composable
private fun ReplyTargetChip(target: ReplyTarget, onCancelReply: () -> Unit) {
    val label = target.authorName
        ?.let { stringResource(R.string.post_comments_replying_to, it) }
        ?: stringResource(R.string.post_comments_replying_to_generic)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = Modifier
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(MeeshyPalette.Indigo500.copy(alpha = 0.10f))
            .padding(start = 10.dp, end = 2.dp, top = 2.dp, bottom = 2.dp),
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyPalette.Indigo500,
        )
        val cancelLabel = stringResource(R.string.post_comments_cancel_reply)
        IconButton(
            onClick = onCancelReply,
            modifier = Modifier.size(24.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = cancelLabel,
                tint = MeeshyPalette.Indigo500,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

@Composable
private fun CommentsSkeleton() {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        repeat(3) {
            Row(Modifier.fillMaxWidth()) {
                me.meeshy.ui.component.MeeshySkeletonBox(
                    modifier = Modifier.size(32.dp),
                    shape = CircleShape,
                )
                Spacer(Modifier.width(MeeshySpacing.sm))
                me.meeshy.ui.component.MeeshySkeletonBox(
                    modifier = Modifier
                        .weight(1f)
                        .height(36.dp),
                    shape = RoundedCornerShape(MeeshyRadius.md),
                )
            }
        }
    }
}
