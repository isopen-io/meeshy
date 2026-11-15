package me.meeshy.app.sync

import me.meeshy.app.navigation.Routes
import me.meeshy.sdk.model.sync.OutboxNavigationSource

/**
 * Où mène un toucher sur la pastille (miroir d'`openSource` d'iOS) : le message visé (ancre), la conversation, le post,
 * la story. Une story est un post du même espace d'identifiants : son détail est l'ouverture sûre, y compris quand
 * elle n'est plus dans le plateau. `null` = nulle part où aller (la rotation avance).
 */
internal object SyncPillNavigation {
    fun route(source: OutboxNavigationSource): String? = when (source) {
        is OutboxNavigationSource.Conversation -> Routes.chat(source.id, source.messageId)
        is OutboxNavigationSource.Post -> Routes.postDetail(source.id)
        is OutboxNavigationSource.Story -> Routes.postDetail(source.id)
        OutboxNavigationSource.Unknown -> null
    }
}

/** Les contextes auxquels la pastille CÈDE : un contenu qui prend le haut ou tout l'écran est un contexte à lui (iOS `SyncPillVisibility`). */
internal object SyncPillVisibility {
    private val storyViewerPrefix = Routes.STORY_VIEWER.substringBefore("{")
    private val reelsPrefix = Routes.REELS.substringBefore("?")

    fun isVisible(route: String?, inAppBannerPresenting: Boolean): Boolean =
        !inAppBannerPresenting && !isFullscreenContent(route)

    private fun isFullscreenContent(route: String?): Boolean =
        route != null && (route.startsWith(storyViewerPrefix) || route == reelsPrefix || route.startsWith("$reelsPrefix?"))
}
