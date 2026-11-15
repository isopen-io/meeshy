package me.meeshy.sdk.post

import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxRepository

/**
 * Les likes encore dus au serveur (file durable, donc aussi apres un kill) : postId -> etat « aime » vise.
 * Un post qui porte a la fois un like et un unlike en attente est ambigu : il n'est pas rejoue.
 */
internal suspend fun OutboxRepository.pendingLikeStates(): Map<String, Boolean> {
    val liked = pendingTargets(OutboxKind.LIKE_POST)
    val unliked = pendingTargets(OutboxKind.UNLIKE_POST)
    return (liked - unliked).associateWith { true } + (unliked - liked).associateWith { false }
}
