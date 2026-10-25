package me.meeshy.app.navigation

import android.net.Uri
import me.meeshy.app.auth.GuestJoinViewModel
import me.meeshy.app.chat.ChatViewModel
import me.meeshy.app.conversations.CreateShareLinkViewModel
import me.meeshy.app.conversations.ShareLinkDetailViewModel
import me.meeshy.app.feed.PostDetailViewModel
import me.meeshy.app.profile.ReportUserViewModel
import me.meeshy.app.stories.StoryViewerViewModel
import me.meeshy.sdk.model.PostShareLink
import me.meeshy.sdk.model.ProfileShareLink
import me.meeshy.sdk.model.legal.LegalDocumentKind

object Routes {
    const val LOGIN = "login"
    const val REGISTRATION = "register"
    const val FORGOT_PASSWORD = "forgot-password"
    const val MAGIC_LINK = "magic-link"
    const val MAGIC_LINK_VALIDATE = "auth/magic-link?token={token}"
    const val GUEST_JOIN = "join/{${GuestJoinViewModel.IDENTIFIER_ARG}}"
    const val GUEST_JOIN_DEEP_LINK = "meeshy://$GUEST_JOIN"

    /**
     * LEGACY receiver — `https://meeshy.me/join/{identifier}`, the shape the
     * `joinUrl` helpers built before 2026-08-20. Links of that shape are still
     * in the wild (old chats, old QR codes), so the app keeps claiming them ;
     * the web 308s them to `/chat/{identifier}`. Fresh links are received by
     * [GUEST_JOIN_CHAT_WEB_DEEP_LINK] below.
     */
    const val GUEST_JOIN_WEB_DEEP_LINK = "https://meeshy.me/$GUEST_JOIN"

    /**
     * The CANONICAL web share URL — `{webOrigin}/chat/{identifier}` — the shape
     * `CreatedShareLink.joinUrl` / `MyShareLink.joinUrl` build since 2026-08-20
     * (`/join/{identifier}` only survives as a 308 redirect on the web and as
     * [GUEST_JOIN_WEB_DEEP_LINK] here, for links already in the wild). Same
     * guest-join destination: the identifier resolves through the same
     * `/links/:identifier` gateway route whichever path carried it.
     */
    const val GUEST_JOIN_CHAT_WEB_DEEP_LINK =
        "https://meeshy.me/chat/{${GuestJoinViewModel.IDENTIFIER_ARG}}"
    fun guestJoin(identifier: String): String = "join/$identifier"
    const val CONVERSATIONS = "conversations"
    const val NEW_CONVERSATION = "conversations/new"
    const val GLOBAL_SEARCH = "search"
    const val DASHBOARD = "dashboard"
    const val CONVERSATIONS_DEEP_LINK = "meeshy://conversations"
    const val CREATE_SHARE_LINK =
        "conversations/{${CreateShareLinkViewModel.CONVERSATION_ID_ARG}}/share-link/new"
    fun createShareLink(conversationId: String): String =
        "conversations/$conversationId/share-link/new"
    const val SHARE_LINK_PICKER = "conversations/share-link/picker"
    const val MY_SHARE_LINKS = "share-links"
    const val SHARE_LINK_DETAIL = "share-links/{${ShareLinkDetailViewModel.LINK_ID_ARG}}"
    fun shareLinkDetail(linkId: String): String = "share-links/$linkId"
    const val CHAT = "chat/{${ChatViewModel.CONVERSATION_ID_ARG}}?${ChatRouteArgs.HIGHLIGHT_MESSAGE_ID}={${ChatRouteArgs.HIGHLIGHT_MESSAGE_ID}}"
    const val CHAT_DEEP_LINK = "meeshy://$CHAT"
    const val CONVERSATION_DEEP_LINK = "meeshy://conversations/{${ChatViewModel.CONVERSATION_ID_ARG}}"
    const val CONVERSATION_SINGULAR_DEEP_LINK = "meeshy://conversation/{${ChatViewModel.CONVERSATION_ID_ARG}}"

    /**
     * Same destination as [CONVERSATION_SINGULAR_DEEP_LINK] plus an optional
     * `?draft=` query arg — e.g. a future Quick Reply widget/shortcut
     * (`ChatViewModel.DRAFT_ARG`/`initialDraft`). Kept as its own pattern (rather
     * than appended to every conversation deep link) since it is the one shape a
     * canned-reply tap would actually construct.
     */
    const val CONVERSATION_DRAFT_DEEP_LINK =
        "meeshy://conversation/{${ChatViewModel.CONVERSATION_ID_ARG}}?${ChatViewModel.DRAFT_ARG}={${ChatViewModel.DRAFT_ARG}}"
    const val CONVERSATION_SHORT_DEEP_LINK = "meeshy://c/{${ChatViewModel.CONVERSATION_ID_ARG}}"
    const val FEED = "feed"
    const val SAVED_POSTS = "feed/saved"
    const val NEARBY_DISCOVERY = "feed/nearby"
    const val POST_DETAIL = "feed/post/{${PostDetailViewModel.POST_ID_ARG}}"

    /**
     * The receiving half of [PostShareLink]: the canonical `/feeds/post/{id}` link every
     * client shares, and the legacy `/post/{id}` the gateway's tracked links still mint —
     * on both hosts. Before these, a shared post link opened the browser, never the app.
     */
    val POST_SHARE_DEEP_LINKS: List<String> =
        listOf(PostShareLink.WEB_HOST, PostShareLink.WWW_HOST).flatMap { host ->
            listOf(PostShareLink.CANONICAL_SEGMENT, PostShareLink.LEGACY_SEGMENT).map { segment ->
                "https://$host/$segment/{${PostDetailViewModel.POST_ID_ARG}}"
            }
        }
    const val CALLS = "calls"
    const val CONTACTS = "contacts"
    const val CONTACTS_DISCOVER = "contacts/discover"
    const val NOTIFICATIONS = "notifications"
    const val SETTINGS = "settings"
    const val CHANGE_PASSWORD = "settings/change-password"
    const val TWO_FACTOR = "settings/two-factor"
    const val ACCOUNT_CONTACT = "settings/account-contact"
    const val SECURITY = "settings/security"
    const val MEDIA_DOWNLOAD = "settings/media-download"
    const val MEDIA_CACHE = "settings/media-cache"
    const val PRIVACY = "settings/privacy"
    const val ACTIVE_SESSIONS = "settings/sessions"
    const val ENCRYPTED_DEVICES = "settings/encrypted-devices"
    const val BLOCKED_USERS = "contacts/blocked"
    const val DATA_EXPORT = "settings/data-export"
    const val DIAGNOSTICS = "settings/diagnostics"
    const val ABOUT = "settings/about"
    const val SUPPORT = "settings/support"
    const val LICENSES = "settings/licenses"
    const val LEGAL_DOC_ARG = "doc"
    const val LEGAL = "settings/legal/{$LEGAL_DOC_ARG}"
    const val DELETE_ACCOUNT = "settings/delete-account"
    const val STARRED = "starred"
    const val PROFILE_USER = "profile/{userId}"
    const val PROFILE_DEEP_LINK = "meeshy://$PROFILE_USER"

    /**
     * The receiving half of [ProfileShareLink] — its generated
     * `meeshy://u/{username}` / `https://meeshy.me/u/{username}` links had no
     * matching intent-filter (manifest) or `navDeepLink` (here) until this pair,
     * so a shared/QR profile link opened nothing on Android. `{userId}` doubles
     * as the argument name for a username value: `ProfileViewModel.loadProfile`
     * already forwards it verbatim to `UserApi.getPerson(handle)`, which
     * resolves either — no new resolution step needed on this route.
     */
    const val PROFILE_SHARE_APP_DEEP_LINK =
        "${ProfileShareLink.APP_SCHEME}://${ProfileShareLink.USER_SEGMENT}/{userId}"
    const val PROFILE_SHARE_WEB_DEEP_LINK =
        "https://${ProfileShareLink.WEB_HOST}/${ProfileShareLink.USER_SEGMENT}/{userId}"
    const val USER_POSTS = "profile/{userId}/posts"
    const val REPORT_USER = "report/{${ReportUserViewModel.USER_ID_ARG}}?${ReportUserViewModel.USERNAME_ARG}={${ReportUserViewModel.USERNAME_ARG}}"
    const val STORY_VIEWER = "story/{${StoryViewerViewModel.USER_ID_ARG}}"
    const val STORY_DEEP_LINK = "meeshy://$STORY_VIEWER"
    const val STORY_COMPOSER = "story_composer"
    const val STORY_COMPOSER_REPOST_ARG = "repostOfId"
    const val STORY_COMPOSER_ROUTE = "story_composer?$STORY_COMPOSER_REPOST_ARG={$STORY_COMPOSER_REPOST_ARG}"
    const val REELS = "reels?seed={seed}"
    val CALL = CallRoute.PATTERN

    fun reels(seed: String? = null): String = if (seed == null) "reels" else "reels?seed=$seed"

    /** Opens the story composer as a repost of [storyId] — the source id rides as an optional arg. */
    fun storyComposerRepost(storyId: String): String =
        "story_composer?$STORY_COMPOSER_REPOST_ARG=${Uri.encode(storyId)}"

    fun postDetail(postId: String): String = "feed/post/$postId"
    fun chat(conversationId: String, highlightMessageId: String? = null): String =
        ChatRouteArgs.route(conversationId, highlightMessageId)
    fun profile(userId: String): String = "profile/$userId"
    fun userPosts(userId: String): String = "profile/$userId/posts"
    fun reportUser(userId: String, username: String): String =
        "report/$userId?${ReportUserViewModel.USERNAME_ARG}=${Uri.encode(username)}"
    fun story(userId: String): String = "story/$userId"
    fun legal(kind: LegalDocumentKind): String = "settings/legal/${kind.arg}"
    fun call(conversationId: String, peerName: String, isVideo: Boolean): String =
        CallRoute.path(conversationId, peerName, isVideo)
}
