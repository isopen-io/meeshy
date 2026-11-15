package me.meeshy.sdk.model

/**
 * Les transitions temps réel d'un fil de commentaires qui ne sont ni un ajout, ni une suppression, ni un remplacement
 * complet : l'agrégat ABSOLU d'une réaction et la réécriture du lieu / des médias (`comment:media-updated`). Chacune
 * rend la MÊME instance quand rien ne change.
 */
private inline fun List<ApiPostComment>.mapIf(id: String, transform: (ApiPostComment) -> ApiPostComment): List<ApiPostComment> =
    if (none { it.id == id }) this else map { if (it.id == id) transform(it) else it }

/** Le lieu et les médias (transcription, variantes TTS) réécrits par la passerelle ; le reste de la ligne reste. */
fun ApiPostComment.withMediaFrom(update: ApiPostComment): ApiPostComment =
    copy(media = update.media, location = update.location, quotedMedia = update.quotedMedia)

fun CommentThreadState.reactionAggregated(
    commentId: String,
    aggregation: SocketCommentReactionAggregation,
    viewerId: String?,
    heart: String,
): CommentThreadState {
    val next = comments.mapIf(commentId) { CommentReactionLaw.applying(it, aggregation, viewerId, heart) }
    return if (next == comments) this else copy(comments = next)
}

fun CommentRepliesState.reactionAggregated(
    commentId: String,
    aggregation: SocketCommentReactionAggregation,
    viewerId: String?,
    heart: String,
): CommentRepliesState {
    val next = repliesByParent.mapValues { (_, rows) ->
        rows.mapIf(commentId) { CommentReactionLaw.applying(it, aggregation, viewerId, heart) }
    }
    return if (next == repliesByParent) this else copy(repliesByParent = next)
}

fun CommentThreadState.mediaRewritten(update: ApiPostComment): CommentThreadState {
    val next = comments.mapIf(update.id) { it.withMediaFrom(update) }
    return if (next == comments) this else copy(comments = next)
}

fun CommentRepliesState.mediaRewritten(update: ApiPostComment): CommentRepliesState {
    val next = repliesByParent.mapValues { (_, rows) -> rows.mapIf(update.id) { it.withMediaFrom(update) } }
    return if (next == repliesByParent) this else copy(repliesByParent = next)
}

/**
 * Le cœur après un agrégat absolu : le drapeau du lecteur suit [viewerHeart] (`null` = l'agrégat ne le dit pas, rien ne
 * bouge) et l'écart optimiste de [commentId] tombe, puisque le compte servi est désormais la base — sauf pendant qu'un
 * basculement local est en vol, que son issue réglera.
 */
fun CommentLikeState.aggregated(commentId: String, viewerHeart: Boolean?): CommentLikeState {
    val liked = when (viewerHeart) {
        null -> likedIds
        true -> likedIds + commentId
        false -> likedIds - commentId
    }
    val settled = if (commentId in inFlightIds) deltas else deltas - commentId
    return if (liked == likedIds && settled == deltas) this else copy(likedIds = liked, deltas = settled)
}

/**
 * La première page lue (ou le disque servi) posée sur le fil SANS écraser une ligne optimiste ni un écho socket arrivé
 * pendant la lecture : voir [CommentSheetRules.mergeFetched]. Le curseur de pagination avance avec la page.
 */
fun CommentThreadState.mergedFirstPage(page: List<ApiPostComment>, nextCursor: String?, more: Boolean): CommentThreadState =
    copy(
        comments = CommentSheetRules.mergeFetched(comments, page),
        cursor = nextCursor,
        hasMore = more,
        hasLoaded = true,
    )
