package me.meeshy.sdk.model.rootnav

import me.meeshy.sdk.model.deeplink.DeepLinkDestination

/**
 * Les intentions qui arrivent a la racine par le push, la carte de lecture, les liens et les
 * raccourcis. Miroir de iOS `RootIntentRoutingLayer` (`RootSharedLayers.swift`).
 */
sealed interface RootIntent {
    /** Navigation par id (liste, favoris, widget) ; le message a surligner voyage avec. */
    data class OpenConversation(val conversationId: String, val highlightMessageId: String? = null) : RootIntent

    /** Retour depuis la notification media : la conversation et le message audio en cours. */
    data class NowPlayingReturn(val target: NowPlayingReturnTarget) : RootIntent

    data class SendMessageToUser(val userId: String, val username: String? = null) : RootIntent
    data class OpenProfileSheet(val userId: String, val username: String? = null) : RootIntent
    data object OpenStoryComposer : RootIntent
    data class PushNavigateToRoute(val route: String) : RootIntent
}

/** Ce que la racine fait d'une [RootIntent]. */
sealed interface RootIntentAction {
    data class NavigateToConversation(val conversationId: String, val highlightMessageId: String?) : RootIntentAction
    data class OpenDirectConversation(val userId: String, val username: String?) : RootIntentAction
    data class ShowProfileSheet(val userId: String, val username: String) : RootIntentAction
    data object ShowStoryComposer : RootIntentAction
    data class NavigateToRoute(val route: String) : RootIntentAction
    data object Ignore : RootIntentAction
}

object RootIntentRouting {

    /**
     * Toute intention suppose une session : hors session elle est ignoree (le payload push, lui,
     * reste en attente dans [PendingIntentInbox] jusqu'a la connexion).
     */
    fun plan(intent: RootIntent, isAuthenticated: Boolean): RootIntentAction {
        if (!isAuthenticated) return RootIntentAction.Ignore
        return when (intent) {
            is RootIntent.OpenConversation -> openConversation(intent.conversationId, intent.highlightMessageId)
            is RootIntent.NowPlayingReturn -> openConversation(intent.target.conversationId, intent.target.messageId)
            is RootIntent.SendMessageToUser ->
                if (intent.userId.isBlank()) {
                    RootIntentAction.Ignore
                } else {
                    RootIntentAction.OpenDirectConversation(intent.userId, intent.username?.takeIf { it.isNotBlank() })
                }
            is RootIntent.OpenProfileSheet ->
                if (intent.userId.isBlank()) {
                    RootIntentAction.Ignore
                } else {
                    RootIntentAction.ShowProfileSheet(intent.userId, intent.username?.takeIf { it.isNotBlank() } ?: intent.userId)
                }
            RootIntent.OpenStoryComposer -> RootIntentAction.ShowStoryComposer
            is RootIntent.PushNavigateToRoute ->
                if (intent.route.isBlank()) RootIntentAction.Ignore else RootIntentAction.NavigateToRoute(intent.route)
        }
    }

    private fun openConversation(conversationId: String, highlightMessageId: String?): RootIntentAction =
        if (conversationId.isBlank()) {
            RootIntentAction.Ignore
        } else {
            RootIntentAction.NavigateToConversation(conversationId, highlightMessageId?.takeIf { it.isNotBlank() })
        }

    /** Qui traite une URL ouverte : seul le partage passe par le routeur de navigation. */
    enum class LinkHandler { NAVIGATION_ROUTER, LINK_PARSER }

    /**
     * Seules les URL de PARTAGE passent par le routeur de navigation ; toutes les autres
     * (join, chat, conversation, magic link, profil...) sont deja routees par le parseur de liens.
     * Les laisser passer deux fois rejouait l'appel API et faisait courir la navigation contre
     * elle-meme.
     */
    fun handlerFor(destination: DeepLinkDestination): LinkHandler =
        if (destination is DeepLinkDestination.Share) LinkHandler.NAVIGATION_ROUTER else LinkHandler.LINK_PARSER
}

/**
 * Un payload de push en attente, rejoue a un montage TARDIF (demarrage a froid : le composant
 * monte apres le splash, alors que le payload est deja pose) puis efface — le point de
 * consommation unique. Hors session, il reste en attente.
 */
class PendingIntentInbox<T : Any> {
    private var pending: T? = null

    fun post(payload: T) {
        pending = payload
    }

    /** Rend le payload une seule fois, puis l'efface ; `null` si rien n'attend ou hors session. */
    fun take(isAuthenticated: Boolean): T? {
        if (!isAuthenticated) return null
        val payload = pending ?: return null
        pending = null
        return payload
    }

    val hasPending: Boolean get() = pending != null
}
