package me.meeshy.app.notifications

import me.meeshy.sdk.model.ApiNotification

/**
 * Où mène le toucher d'une bannière in-app. Le jeu d'abord (un palier se célèbre), puis la communauté que la table de la
 * cloche et du push a élue (iOS `RootNotificationNavigator` ouvre `.communityDetail` avant la conversation pour cette
 * famille, #18670), puis la conversation, puis la publication.
 */
internal sealed interface BannerTap {
    data class Game(val notification: ApiNotification) : BannerTap
    data class Community(val communityId: String) : BannerTap
    data class Conversation(val conversationId: String) : BannerTap
    data class Post(val postId: String) : BannerTap
    data object None : BannerTap
}

internal fun InAppBanner.tapTarget(): BannerTap =
    game?.let { BannerTap.Game(it) }
        ?: communityId?.let { BannerTap.Community(it) }
        ?: conversationId?.let { BannerTap.Conversation(it) }
        ?: postId?.let { BannerTap.Post(it) }
        ?: BannerTap.None
