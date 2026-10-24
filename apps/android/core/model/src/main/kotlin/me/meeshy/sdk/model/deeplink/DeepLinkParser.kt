package me.meeshy.sdk.model.deeplink

/**
 * The single table of Meeshy link shapes, for the web (`https://meeshy.me/...`)
 * and the `meeshy://` scheme. Kotlin mirror of iOS `DeepLinkParser`
 * (apps/ios/Meeshy/Features/Main/Navigation/DeepLinkRouter.swift).
 *
 * Total and framework-free: any input yields exactly one [DeepLinkDestination],
 * an unreadable or foreign one being [DeepLinkDestination.External]. Only the
 * `http`, `https` and `meeshy` schemes are read. The environment web origin is
 * injected (staging sees `staging.meeshy.me` as Meeshy), never hard-coded.
 *
 * Widget / shortcut surfaces (`contact`, `quickreply`, `send`, `conversations`,
 * `call`, `settings/packs`) are read under `meeshy://` only. A link that
 * CONNECTS (magic link, verify-email) or resets a password is read from the
 * exact https form e-mails write, never under `meeshy://`.
 */
object DeepLinkParser {

    private val meeshyHosts: Set<String> = setOf("meeshy.me", "www.meeshy.me", "app.meeshy.me")
    private val postSegments: Set<String> = setOf("post", "p")
    private val storySegments: Set<String> = setOf("story", "stories", "s")
    private val userSegments: Set<String> = setOf("u", "users")
    private val packDomains: Set<String> =
        setOf("sticker", "glory-frame", "wallpaper", "avatar-ring", "banner", "banner-frame")

    /** Query keys carrying an invitation code, in the web order. */
    val referralQueryKeys: List<String> = listOf("ref", "parrain", "affiliate")

    private const val MAX_REFERRAL_LENGTH = 128
    private const val MAX_PACK_SLUG_LENGTH = 64

    fun isPostSegment(segment: String): Boolean = segment in postSegments
    fun isStorySegment(segment: String): Boolean = segment in storySegments
    fun isUserSegment(segment: String): Boolean = segment in userSegments

    /**
     * A Meeshy host: production's, plus the web host of the SELECTED environment.
     * EXACT equality: a host that only starts or ends like it stays foreign.
     */
    fun isMeeshyHost(host: String, environmentWebOrigin: String): Boolean {
        val lowered = host.lowercase()
        if (lowered in meeshyHosts) return true
        val environmentHost = DeepLinkUrl.parse(environmentWebOrigin)?.host?.takeIf { it.isNotEmpty() } ?: return false
        return lowered == environmentHost || lowered == "www.$environmentHost"
    }

    fun parse(raw: String, environmentWebOrigin: String): DeepLinkDestination {
        val url = DeepLinkUrl.parse(raw) ?: return DeepLinkDestination.External(raw)
        return parse(url, environmentWebOrigin) ?: DeepLinkDestination.External(raw)
    }

    /** True when the link is a Meeshy route the app handles (anything but [DeepLinkDestination.External]). */
    fun isMeeshyDeepLink(raw: String, environmentWebOrigin: String): Boolean =
        parse(raw, environmentWebOrigin) !is DeepLinkDestination.External

    internal fun parse(url: DeepLinkUrl, environmentWebOrigin: String): DeepLinkDestination? = when {
        url.scheme == "meeshy" -> parseCustomScheme(url)
        (url.scheme == "https" || url.scheme == "http") && url.host.isNotEmpty() &&
            isMeeshyHost(url.host, environmentWebOrigin) -> parseMeeshyWeb(url)
        else -> null
    }

    private fun parseCustomScheme(url: DeepLinkUrl): DeepLinkDestination? {
        val path = url.segments
        val components = if (url.host.isEmpty()) path else listOf(url.host) + path
        return destination(components, url, customScheme = true)
    }

    private fun parseMeeshyWeb(url: DeepLinkUrl): DeepLinkDestination? {
        if (EmailLinkSecret.carriesSecret(url)) return emailLink(url)
        return destination(url.segments, url, customScheme = false)
    }

    private fun emailLink(url: DeepLinkUrl): DeepLinkDestination? = when (val form = EmailLinkSecret.exactForm(url)) {
        is EmailLinkSecret.Form.MagicLink ->
            (form.pathToken ?: url.linkSecret("token"))?.let { DeepLinkDestination.MagicLink(it) }
        EmailLinkSecret.Form.VerifyEmail -> {
            val token = url.linkSecret("token")
            val email = url.linkSecret("email")
            if (token == null || email == null) null else DeepLinkDestination.EmailVerificationLink(token, email)
        }
        EmailLinkSecret.Form.ResetPassword -> url.linkSecret("token")?.let { DeepLinkDestination.PasswordResetLink(it) }
        null -> null
    }

    /** The segment at [index] when it names something; a blank identifier opens nothing. */
    private fun identifier(components: List<String>, index: Int): String? =
        components.getOrNull(index)?.trim()?.takeIf { it.isNotEmpty() }

    private fun destination(components: List<String>, url: DeepLinkUrl, customScheme: Boolean): DeepLinkDestination? {
        val head = components.firstOrNull() ?: return null
        val id = identifier(components, 1)
        return when {
            head == "me" -> GameLinkParser.link(components)?.let { DeepLinkDestination.Game(it) } ?: DeepLinkDestination.OwnProfile
            head == "links" -> DeepLinkDestination.UserLinks
            head == "share" -> DeepLinkDestination.Share(url.rawQueryValue("text"), url.rawQueryValue("url"))
            head == "signup" -> referralCode(components, url)?.let { DeepLinkDestination.Referral(it) }
            head == "hashtag" -> id?.let { DeepLinkDestination.Hashtag(it) }
            head == "join" -> id?.let { DeepLinkDestination.JoinLink(it) }
            head == "l" -> id?.let { DeepLinkDestination.TrackedLink(it) }
            head == "chat" -> id?.let { DeepLinkDestination.ChatLink(it) }
            head == "c" || head == "conversation" -> id?.let { DeepLinkDestination.Conversation(it) }
            head == "reel" -> id?.let { DeepLinkDestination.Reel(it) }
            head == "reels" -> reelsSeed(components, url)?.let { DeepLinkDestination.Reel(it) }
            head == "community" || head == "communities" ->
                id?.let(::communityIdentifier)?.let { DeepLinkDestination.Community(it) }
            head == "feeds" -> feedsPost(components, id)
            customScheme -> customOnly(head, id, components, url)
            else -> sharedSegments(head, id)
        }
    }

    private fun feedsPost(components: List<String>, keyword: String?): DeepLinkDestination? {
        if (keyword == null || !isPostSegment(keyword)) return null
        return identifier(components, 2)?.let { DeepLinkDestination.PostDetail(it) }
    }

    private fun customOnly(head: String, id: String?, components: List<String>, url: DeepLinkUrl): DeepLinkDestination? =
        when (head) {
            "contact" -> id?.let { DeepLinkDestination.Conversation(it) }
            "quickreply" -> id?.let { DeepLinkDestination.Conversation(it, url.queryValue("text")) }
            "send" -> url.queryValue("contactId")?.let { DeepLinkDestination.Conversation(it, url.queryValue("message")) }
            "conversations" -> id?.let(::conversationListEntry)
            "settings" ->
                if (components.size == 2 && components[1] == "packs") packShop(url) else null
            "call" -> if (components.size == 1) {
                url.queryValue("contactId")?.let { DeepLinkDestination.Call(it, url.queryValue("type") == "video") }
            } else null
            else -> sharedSegments(head, id)
        }

    private fun sharedSegments(head: String, id: String?): DeepLinkDestination? = when {
        isPostSegment(head) -> id?.let { DeepLinkDestination.PostDetail(it) }
        isStorySegment(head) -> id?.let { DeepLinkDestination.StoryDetail(it) }
        isUserSegment(head) -> id?.let { DeepLinkDestination.UserProfile(it) }
        else -> null
    }

    private fun packShop(url: DeepLinkUrl): DeepLinkDestination =
        DeepLinkDestination.PackShop(
            domain = url.queryValue("domaine")?.lowercase()?.takeIf { it in packDomains },
            pack = normalizedPackSlug(url.queryValue("pack")),
        )

    /** A catalogue slug: lowercase letters, digits, hyphens, at most 64, never starting with `-`. */
    fun normalizedPackSlug(raw: String?): String? {
        val slug = raw?.trim()?.lowercase() ?: return null
        val valid = slug.isNotEmpty() && slug.length <= MAX_PACK_SLUG_LENGTH && slug.first() != '-' &&
            slug.all { it in 'a'..'z' || it in '0'..'9' || it == '-' }
        return slug.takeIf { valid }
    }

    /** `/signup/affiliate/<code>` or `/signup?ref=<code>`; null without a well-formed code. */
    internal fun referralCode(components: List<String>, url: DeepLinkUrl): String? = when {
        components.size == 3 && components[1] == "affiliate" -> normalizedReferral(components[2])
        components.size == 1 -> referralQueryKeys.firstNotNullOfOrNull { url.queryValue(it) }?.let(::normalizedReferral)
        else -> null
    }

    /** The code without its edge spaces, or null when it is not shaped like a code. */
    fun normalizedReferral(raw: String): String? {
        val trimmed = raw.trim()
        val valid = trimmed.isNotEmpty() && trimmed.length <= MAX_REFERRAL_LENGTH && trimmed.none { it.isWhitespace() }
        return trimmed.takeIf { valid }
    }

    /** A community identifier, never the reserved `new` (creation screen). */
    internal fun communityIdentifier(segment: String): String? =
        segment.trim().takeIf { it.isNotEmpty() && it != "new" }

    /** `recent` / `unread` under `meeshy://conversations/`. */
    internal fun conversationListEntry(segment: String): DeepLinkDestination? = when (segment) {
        "recent" -> DeepLinkDestination.RecentConversation
        "unread" -> DeepLinkDestination.UnreadConversations
        else -> null
    }

    /** `/reels?seed=<id>`; null without a non-empty seed (the bare list is not a named destination). */
    internal fun reelsSeed(components: List<String>, url: DeepLinkUrl): String? {
        if (components != listOf("reels")) return null
        return url.queryValue("seed")
    }
}
