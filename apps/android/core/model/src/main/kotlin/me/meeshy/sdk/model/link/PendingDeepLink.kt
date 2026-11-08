package me.meeshy.sdk.model.link

import me.meeshy.sdk.model.deeplink.DeepLinkDestination

/**
 * **Reçu sans compte, ce lien attend-il la connexion ?** (iOS `DeepLink.opensAfterSignIn`.)
 *
 * Un lien de CONTENU survit à la connexion : il reste en attente et la racine le reprend une fois la session
 * ouverte. Une invitation et un lien d'e-mail s'ouvrent SANS compte, un lien externe part au navigateur, une
 * demande d'appel ne se garde jamais (se connecter ne relance rien), et un lien de parrainage retient son code.
 */
object PendingDeepLink {
    fun opensAfterSignIn(destination: DeepLinkDestination): Boolean = when (destination) {
        is DeepLinkDestination.JoinLink,
        is DeepLinkDestination.ChatLink,
        is DeepLinkDestination.MagicLink,
        is DeepLinkDestination.EmailVerificationLink,
        is DeepLinkDestination.PasswordResetLink,
        is DeepLinkDestination.Call,
        is DeepLinkDestination.Referral,
        is DeepLinkDestination.Share,
        is DeepLinkDestination.External,
        -> false
        is DeepLinkDestination.OwnProfile,
        is DeepLinkDestination.UserProfile,
        is DeepLinkDestination.Conversation,
        is DeepLinkDestination.TrackedLink,
        is DeepLinkDestination.Post,
        is DeepLinkDestination.UserLinks,
        is DeepLinkDestination.PostDetail,
        is DeepLinkDestination.StoryDetail,
        is DeepLinkDestination.Reel,
        is DeepLinkDestination.Community,
        is DeepLinkDestination.RecentConversation,
        is DeepLinkDestination.UnreadConversations,
        is DeepLinkDestination.Hashtag,
        is DeepLinkDestination.Game,
        is DeepLinkDestination.PackShop,
        -> true
    }
}
