package me.meeshy.app.feed

import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MentionCandidate

/** Replies shown in a collapsed preview before the viewer taps "View all". */
private const val PREVIEW_REPLY_LIMIT = 2

/** La projection du fil : le dernier maillon pur entre les flux de l'écran et son [PostCommentsUiState]. */
internal fun projectComments(
    bundle: ProjectionBundle,
    translatingLanguages: Set<String>,
    apiBaseUrl: String?,
    readerLanguage: (MeeshyUser?) -> String,
    onRoster: (List<MentionCandidate>) -> Unit,
): PostCommentsUiState {
    val inputs = bundle.inputs
    val replyTarget = bundle.replyTarget
    val activeLanguages = bundle.activeLanguages
    val draft = bundle.draft
    val thread = inputs.thread
    val st = inputs.status
    val likeState = inputs.likes
    val replyState = inputs.replies
    val prefs: LanguageResolver.ContentLanguagePreferences = inputs.user ?: EmptyContentPreferences
    val currentUserId = inputs.user?.id
    val topLevel = thread.comments.filter { it.parentId.isNullOrBlank() }
    val rows = topLevel.map {
        CommentProjection.build(
            it,
            prefs,
            apiBaseUrl,
            isPending = it.id in thread.pendingIds,
            likeState = likeState,
            activeLanguageCode = activeLanguages[it.id],
            currentUserId = currentUserId,
        )
    }
    val replyThreads = topLevel
        .filter { replyState.isExpanded(it.id) || replyState.isLoaded(it.id) }
        .associate { comment ->
            val expanded = replyState.isExpanded(comment.id)
            val all = replyState.repliesFor(comment.id)
            val shown = if (expanded) all else all.take(PREVIEW_REPLY_LIMIT)
            comment.id to ReplyThreadUiState(
                isExpanded = expanded,
                isLoading = replyState.isLoading(comment.id),
                replies = shown.map {
                    CommentProjection.build(
                        it,
                        prefs,
                        apiBaseUrl,
                        isPending = replyState.isPendingReply(it.id),
                        likeState = likeState,
                        activeLanguageCode = activeLanguages[it.id],
                        currentUserId = currentUserId,
                        depth = 1,
                    )
                },
                isPreview = !expanded && shown.isNotEmpty(),
                hiddenReplyCount = (all.size - shown.size).coerceAtLeast(0),
            )
        }
    val allComments = thread.comments + replyState.repliesByParent.values.flatten()
    val mentionDisplayNames = CommentMentionDirectory.build(allComments)
    onRoster(CommentMentionRoster.build(allComments, excludeUserId = inputs.user?.id))
    val showSkeleton = st.isLoading && !thread.hasLoaded && thread.comments.isEmpty() && st.error == null
    return PostCommentsUiState(
        comments = rows,
        replyThreads = replyThreads,
        mentionDisplayNames = mentionDisplayNames,
        draft = draft.text,
        mention = draft.mention,
        replyTarget = replyTarget,
        isLoading = st.isLoading,
        isLoadingMore = st.isLoadingMore,
        showSkeleton = showSkeleton,
        isSubmitting = st.isSubmitting,
        canLoadMore = thread.canLoadMore,
        isEmpty = thread.hasLoaded && thread.comments.isEmpty(),
        errorMessage = st.error,
        loadFailed = st.error != null && !st.isLoading && !thread.hasLoaded && thread.comments.isEmpty(),
        notice = st.notice,
        translatingLanguages = translatingLanguages,
        composerLanguageCode = draft.language.display(readerLanguage(inputs.user)),
        effects = draft.effects,
        place = draft.place,
        editing = draft.editing?.let { CommentEditTarget(it.id, it.content.takeIf(String::isNotBlank), hasMedia = !it.media.isNullOrEmpty()) },
        viewerId = inputs.user?.id,
        viewerRole = inputs.user?.role,
    )
}
