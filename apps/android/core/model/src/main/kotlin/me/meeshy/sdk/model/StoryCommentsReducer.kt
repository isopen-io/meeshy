package me.meeshy.sdk.model

import me.meeshy.sdk.lang.LanguageResolver.ContentLanguagePreferences

/**
 * Les transitions pures du fil de commentaires d'une story — iso `StoryCommentSession` iOS : pages de racines et de
 * réponses, arrivées par socket (`comment:added/updated/deleted/translation-updated/reaction-*`), cœur optimiste avec
 * anti double-tap. Chaque fonction rend la MÊME instance quand elle ne change rien.
 */
object StoryCommentsReducer {

    /** Une page de racines : les lignes inconnues s'ajoutent dans l'ordre servi, les connues sont remplacées en place. */
    fun rootsPage(state: StoryCommentsState, page: StoryCommentPage, serverCount: Int? = null): StoryCommentsState {
        val roots = fold(state.roots, page.comments.filter { it.parentId == null })
        return state.copy(
            roots = roots,
            rootCursor = page.nextCursor,
            rootsHasMore = page.hasMore && !page.nextCursor.isNullOrBlank(),
            hasLoaded = true,
            count = serverCount ?: state.count,
        )
    }

    /** Une page de réponses sous [rootId] ; [firstPage] vrai quand c'est le rechargement de tête d'un fil qu'on déplie. */
    fun repliesPage(state: StoryCommentsState, rootId: String, page: StoryCommentPage, firstPage: Boolean): StoryCommentsState =
        state.copy(
            replies = state.replies + (rootId to fold(state.repliesOf(rootId), page.comments)),
            thread = state.thread.pageLoaded(rootId, page.nextCursor, page.hasMore, firstPage),
        )

    fun threadToggled(state: StoryCommentsState, rootId: String): StoryCommentsState =
        state.copy(thread = state.thread.toggled(rootId))

    /** `comment:added` : la racine rejoint la liste, la réponse son fil si celui-ci est ouvert, le compteur parent sinon. */
    fun added(state: StoryCommentsState, comment: StoryComment, serverCount: Int?): StoryCommentsState {
        if (state.contains(comment.id)) return state
        val count = serverCount?.takeIf { it > 0 } ?: (state.count + 1)
        val parentId = comment.parentId ?: return state.copy(roots = state.roots + comment, count = count)
        val parentVisible = parentId in state.thread.expanded || parentId in state.thread.loaded
        return state.copy(
            roots = state.roots.map { if (it.id == parentId) it.copy(replyCount = it.replyCount + 1) else it },
            replies = if (parentVisible) state.replies + (parentId to (state.repliesOf(parentId) + comment)) else state.replies,
            count = count,
        )
    }

    /** `comment:updated` : la ligne est remplacée en place, le cœur du lecteur conservé. */
    fun replaced(state: StoryCommentsState, comment: StoryComment): StoryCommentsState {
        if (!state.contains(comment.id)) return state
        fun swap(old: StoryComment) = comment.copy(likedByMe = old.likedByMe, replyCount = maxOf(comment.replyCount, old.replyCount))
        return state.copy(
            roots = state.roots.map { if (it.id == comment.id) swap(it) else it },
            replies = state.replies.mapValues { (_, rows) -> rows.map { if (it.id == comment.id) swap(it) else it } },
        )
    }

    /** `comment:deleted` : retrait en place d'une racine (son fil part avec elle) ou d'une réponse (le parent est décrémenté). */
    fun removed(state: StoryCommentsState, id: String): StoryCommentsState {
        state.roots.firstOrNull { it.id == id }?.let { root ->
            return state.copy(
                roots = state.roots.filterNot { it.id == id },
                replies = state.replies - id,
                thread = state.thread.purged(id),
                count = (state.count - 1 - root.replyCount).coerceAtLeast(0),
                likesInFlight = state.likesInFlight - id,
            )
        }
        val parentId = state.parentOf(id) ?: return state
        return state.copy(
            roots = state.roots.map { if (it.id == parentId) it.copy(replyCount = (it.replyCount - 1).coerceAtLeast(0)) else it },
            replies = state.replies + (parentId to state.repliesOf(parentId).filterNot { it.id == id }),
            count = (state.count - 1).coerceAtLeast(0),
            likesInFlight = state.likesInFlight - id,
        )
    }

    /** `comment:translation-updated` : la traduction rejoint la ligne et le texte se re-résout par le Prisme du lecteur. */
    fun translated(
        state: StoryCommentsState,
        commentId: String,
        language: String,
        entry: ApiPostTranslationEntry,
        prefs: ContentLanguagePreferences,
    ): StoryCommentsState {
        if (entry.text.isBlank() || !state.contains(commentId)) return state
        fun merge(row: StoryComment) =
            row.copy(translations = row.translations.orEmpty() + (language to entry)).resolved(prefs)
        return state.copy(
            roots = state.roots.map { if (it.id == commentId) merge(it) else it },
            replies = state.replies.mapValues { (_, rows) -> rows.map { if (it.id == commentId) merge(it) else it } },
        )
    }

    /** Le cœur du lecteur, appliqué tout de suite ; `null` quand un cœur est déjà en vol sur ce commentaire. */
    fun beginLike(state: StoryCommentsState, id: String): StoryCommentsState? {
        if (id in state.likesInFlight || !state.contains(id)) return null
        return flipped(state, id).copy(likesInFlight = state.likesInFlight + id)
    }

    fun settleLike(state: StoryCommentsState, id: String): StoryCommentsState =
        if (id in state.likesInFlight) state.copy(likesInFlight = state.likesInFlight - id) else state

    fun rollbackLike(state: StoryCommentsState, id: String): StoryCommentsState =
        if (id in state.likesInFlight) flipped(state, id).copy(likesInFlight = state.likesInFlight - id) else state

    /**
     * `comment:reaction-added/removed` : l'agrégat absolu du serveur fait foi pour le compte ; le cœur du lecteur ne
     * bouge que si c'est lui qui réagit ([actorId] == [myId]).
     */
    fun reaction(
        state: StoryCommentsState,
        commentId: String,
        absoluteCount: Int,
        actorId: String,
        myId: String?,
        added: Boolean,
    ): StoryCommentsState {
        if (!state.contains(commentId)) return state
        fun apply(row: StoryComment) = row.copy(
            likeCount = absoluteCount.coerceAtLeast(0),
            likedByMe = if (myId != null && actorId == myId) added else row.likedByMe,
        )
        return state.copy(
            roots = state.roots.map { if (it.id == commentId) apply(it) else it },
            replies = state.replies.mapValues { (_, rows) -> rows.map { if (it.id == commentId) apply(it) else it } },
        )
    }

    private fun flipped(state: StoryCommentsState, id: String): StoryCommentsState {
        fun flip(row: StoryComment): StoryComment {
            val nowLiked = !row.likedByMe
            return row.copy(likedByMe = nowLiked, likeCount = (row.likeCount + if (nowLiked) 1 else -1).coerceAtLeast(0))
        }
        return state.copy(
            roots = state.roots.map { if (it.id == id) flip(it) else it },
            replies = state.replies.mapValues { (_, rows) -> rows.map { if (it.id == id) flip(it) else it } },
        )
    }

    private fun fold(existing: List<StoryComment>, incoming: List<StoryComment>): List<StoryComment> {
        val fresh = incoming.associateBy { it.id }
        val known = existing.mapTo(HashSet()) { it.id }
        val replaced = existing.map { fresh[it.id]?.let { row -> row.copy(likedByMe = row.likedByMe || it.likedByMe) } ?: it }
        return replaced + incoming.filter { it.id !in known }
    }
}
