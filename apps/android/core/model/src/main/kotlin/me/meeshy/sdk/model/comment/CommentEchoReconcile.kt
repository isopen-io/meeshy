package me.meeshy.sdk.model.comment

import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.CommentRepliesState
import me.meeshy.sdk.model.CommentThreadState

/**
 * L'écho `comment:added` d'un commentaire que CET appareil a mis en file : la ligne optimiste a pour id le
 * `clientMutationId`, l'écho la REMPLACE (jamais un doublon). Sans clé connue de la ligne, c'est un commentaire ordinaire.
 */
public fun CommentThreadState.echoReconciled(clientMutationId: String?, comment: ApiPostComment): CommentThreadState =
    if (clientMutationId != null && clientMutationId in pendingIds) confirmed(clientMutationId, comment) else received(comment)

public fun CommentRepliesState.echoReconciledReply(
    parentId: String,
    clientMutationId: String?,
    reply: ApiPostComment,
): CommentRepliesState =
    if (clientMutationId != null && clientMutationId in pendingReplyIds) confirmedReply(parentId, clientMutationId, reply) else receivedReply(parentId, reply)

/** L'écho est-il celui d'une ligne optimiste de cet appareil (alors le compteur du parent a déjà été incrémenté) ? */
public fun isOwnQueuedEcho(thread: CommentThreadState, replies: CommentRepliesState, clientMutationId: String?): Boolean =
    clientMutationId != null && (clientMutationId in thread.pendingIds || clientMutationId in replies.pendingReplyIds)
