package me.meeshy.sdk.model.deeplink

/**
 * Where a `https://meeshy.me/...` or `meeshy://...` link leads. Every link
 * produces exactly one destination; anything that is not a Meeshy route is
 * [External]. Mirror of iOS `DeepLinkDestination`
 * (apps/ios/Meeshy/Features/Main/Navigation/DeepLinkRouter.swift).
 */
sealed interface DeepLinkDestination {
    data object OwnProfile : DeepLinkDestination
    data class UserProfile(val username: String) : DeepLinkDestination

    /** [draftText] comes from widget / shortcut links and is dropped as a draft, never sent. */
    data class Conversation(val id: String, val draftText: String? = null) : DeepLinkDestination

    /** `/join/<id>`: invitation link, resolved server-side. */
    data class JoinLink(val identifier: String) : DeepLinkDestination

    /** `/l/<token>`: tracked link, resolved asynchronously by its target type. */
    data class TrackedLink(val token: String) : DeepLinkDestination

    /** `/chat/<id>`: direct chat share link. */
    data class ChatLink(val identifier: String) : DeepLinkDestination
    data class Post(val id: String) : DeepLinkDestination
    data class MagicLink(val token: String) : DeepLinkDestination
    data class EmailVerificationLink(val token: String, val email: String) : DeepLinkDestination
    data class PasswordResetLink(val token: String) : DeepLinkDestination
    data class Share(val text: String?, val url: String?) : DeepLinkDestination
    data object UserLinks : DeepLinkDestination
    data class PostDetail(val postId: String) : DeepLinkDestination
    data class StoryDetail(val postId: String) : DeepLinkDestination
    data class Reel(val postId: String) : DeepLinkDestination
    data class Community(val id: String) : DeepLinkDestination
    data object RecentConversation : DeepLinkDestination
    data object UnreadConversations : DeepLinkDestination
    data class Hashtag(val tag: String) : DeepLinkDestination
    data class Referral(val code: String) : DeepLinkDestination
    data class Call(val conversationId: String, val isVideo: Boolean) : DeepLinkDestination
    data class Game(val link: GameLink) : DeepLinkDestination

    /** [domain] is a known pack domain id (`sticker`, `glory-frame`, ...) or null; [pack] a normalized slug. */
    data class PackShop(val domain: String? = null, val pack: String? = null) : DeepLinkDestination
    data class External(val url: String) : DeepLinkDestination
}
