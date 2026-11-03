package me.meeshy.app.navigation

import me.meeshy.app.navigation.graph.CommunityRoutes
import me.meeshy.app.navigation.graph.GameRoutes
import me.meeshy.app.navigation.graph.LinksRoutes
import me.meeshy.sdk.model.deeplink.DeepLinkDestination
import me.meeshy.sdk.model.deeplink.DeepLinkParser

/** Ce que la racine fait d'un lien : miroir de l'enchaînement `DeepLinkRouter` → `RootView` d'iOS. */
internal sealed interface DeepLinkAction {
    /** Un écran de l'app : les surfaces présentées se ferment, la pile revient à la liste, puis la route s'empile. */
    data class Navigate(val route: String) : DeepLinkAction

    /** Une conversation par identifiant : le guichet unique d'ouverture (toast d'erreur identique partout). */
    data class OpenConversation(val conversationId: String) : DeepLinkAction

    /** Une conversation avec un brouillon (`quickreply`, `send`) : empilée par son adresse, la seule qui porte `?draft=`. */
    data class OpenDraft(val conversationId: String, val draft: String) : DeepLinkAction

    /** La conversation au dernier message le plus récent (hors archivées et fermées). */
    data object OpenRecentConversation : DeepLinkAction

    /** La liste sur le filtre « Non lus ». */
    data object OpenUnreadConversations : DeepLinkAction

    /** `/l/<jeton>` : résolu en ligne, puis rejoué comme la destination qu'il désigne. */
    data class ResolveTrackedLink(val token: String) : DeepLinkAction

    /** Une invitation : le code est retenu jusqu'à l'inscription. */
    data class RememberReferral(val code: String) : DeepLinkAction

    /** Ce lien a son propre chemin (lien d'e-mail à jeton, demande d'appel confirmée) : la racine n'y touche pas. */
    data object HandledAtLaunch : DeepLinkAction

    /** Hors de Meeshy : le navigateur. */
    data class OpenInBrowser(val url: String) : DeepLinkAction
}

/**
 * **La table unique destination -> action** (iOS `DeepLinkRouter.link(for:)` + `handle(url:)`) : toute
 * destination de [DeepLinkParser] a un traitement, jamais un lien muet. Les destinations sans écran propre sur
 * Android (jeu en détail, partage de texte) retombent EXPLICITEMENT sur l'écran le plus proche.
 */
internal object DeepLinkRouter {
    const val WEB_ORIGIN: String = "https://meeshy.me"

    fun action(destination: DeepLinkDestination): DeepLinkAction = when (destination) {
        DeepLinkDestination.OwnProfile -> DeepLinkAction.Navigate(ProfileRoutes.OWN)
        is DeepLinkDestination.UserProfile -> DeepLinkAction.Navigate(Routes.profile(destination.username))
        is DeepLinkDestination.Conversation -> conversation(destination)
        is DeepLinkDestination.JoinLink -> DeepLinkAction.Navigate(Routes.guestJoin(destination.identifier))
        is DeepLinkDestination.ChatLink -> DeepLinkAction.Navigate(Routes.guestJoin(destination.identifier))
        is DeepLinkDestination.TrackedLink -> DeepLinkAction.ResolveTrackedLink(destination.token)
        is DeepLinkDestination.Post -> DeepLinkAction.Navigate(Routes.postDetail(destination.id))
        is DeepLinkDestination.PostDetail -> DeepLinkAction.Navigate(Routes.postDetail(destination.postId))
        is DeepLinkDestination.StoryDetail -> DeepLinkAction.Navigate(Routes.postDetail(destination.postId))
        is DeepLinkDestination.Reel -> DeepLinkAction.Navigate(Routes.reels(destination.postId))
        is DeepLinkDestination.Community -> DeepLinkAction.Navigate(CommunityRoutes.detail(destination.id))
        DeepLinkDestination.RecentConversation -> DeepLinkAction.OpenRecentConversation
        DeepLinkDestination.UnreadConversations -> DeepLinkAction.OpenUnreadConversations
        is DeepLinkDestination.Hashtag -> DeepLinkAction.Navigate(Routes.hashtag(destination.tag))
        is DeepLinkDestination.Referral -> DeepLinkAction.RememberReferral(destination.code)
        DeepLinkDestination.UserLinks -> DeepLinkAction.Navigate(LinksRoutes.HUB)
        // Pas d'écran de saison ni de semaine de ligue sur Android : la première page du jeu.
        is DeepLinkDestination.Game -> DeepLinkAction.Navigate(GameRoutes.PROGRESSION)
        is DeepLinkDestination.PackShop -> DeepLinkAction.Navigate(Routes.packShop(destination.domain, destination.pack))
        // Le partage de texte vers Meeshy passe par la cible de partage du système ; un lien `share` retombe sur la liste.
        is DeepLinkDestination.Share -> DeepLinkAction.Navigate(Routes.CONVERSATIONS)
        is DeepLinkDestination.Call,
        is DeepLinkDestination.MagicLink,
        is DeepLinkDestination.EmailVerificationLink,
        is DeepLinkDestination.PasswordResetLink,
        -> DeepLinkAction.HandledAtLaunch
        is DeepLinkDestination.External -> DeepLinkAction.OpenInBrowser(destination.url)
    }

    fun action(raw: String): DeepLinkAction = action(DeepLinkParser.parse(raw, WEB_ORIGIN))

    /**
     * Le brouillon d'un raccourci (`quickreply?text=`, `send?message=`) voyage dans le `?draft=` du lien
     * `meeshy://conversation/<id>` (la route du fil ne le porte pas) ; sans brouillon, c'est l'ouverture par identifiant.
     */
    private fun conversation(destination: DeepLinkDestination.Conversation): DeepLinkAction {
        val draft = destination.draftText?.takeIf { it.isNotBlank() }
            ?: return DeepLinkAction.OpenConversation(destination.id)
        return DeepLinkAction.OpenDraft(destination.id, draft)
    }

    /**
     * Ce lien appartient-il à la racine ? Oui s'il est une destination Meeshy qu'AUCUN `navDeepLink` du graphe ne
     * lit : sans cela, un chemin revendiqué par le manifeste (hashtag, communauté, `/c/`…) ouvrirait l'app sur rien.
     */
    fun ownsLink(raw: String): Boolean {
        return when (action(raw)) {
            // `meeshy://conversations/recent` ressemble au motif `conversations/{id}` du graphe : la racine le prend d'abord.
            DeepLinkAction.OpenRecentConversation, DeepLinkAction.OpenUnreadConversations -> true
            DeepLinkAction.HandledAtLaunch, is DeepLinkAction.OpenInBrowser -> false
            else -> !NavGraphLinkCoverage.covers(raw)
        }
    }
}
