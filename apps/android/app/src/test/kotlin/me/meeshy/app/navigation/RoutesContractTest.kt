package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.legal.LegalDocumentKind
import org.junit.Test

/**
 * Instantane des patterns de route, arguments et liens profonds : le decoupage de
 * MeeshyApp.kt en graphes par domaine ne doit changer AUCUNE chaine.
 */
class RoutesContractTest {

    @Test
    fun `route patterns are frozen`() {
        val actual = mapOf(
            "LOGIN" to Routes.LOGIN,
            "REGISTRATION" to Routes.REGISTRATION,
            "FORGOT_PASSWORD" to Routes.FORGOT_PASSWORD,
            "MAGIC_LINK" to Routes.MAGIC_LINK,
            "MAGIC_LINK_VALIDATE" to Routes.MAGIC_LINK_VALIDATE,
            "GUEST_JOIN" to Routes.GUEST_JOIN,
            "CONVERSATIONS" to Routes.CONVERSATIONS,
            "NEW_CONVERSATION" to Routes.NEW_CONVERSATION,
            "GLOBAL_SEARCH" to Routes.GLOBAL_SEARCH,
            "DASHBOARD" to Routes.DASHBOARD,
            "CREATE_SHARE_LINK" to Routes.CREATE_SHARE_LINK,
            "SHARE_LINK_PICKER" to Routes.SHARE_LINK_PICKER,
            "MY_SHARE_LINKS" to Routes.MY_SHARE_LINKS,
            "SHARE_LINK_DETAIL" to Routes.SHARE_LINK_DETAIL,
            "CHAT" to Routes.CHAT,
            "FEED" to Routes.FEED,
            "SAVED_POSTS" to Routes.SAVED_POSTS,
            "NEARBY_DISCOVERY" to Routes.NEARBY_DISCOVERY,
            "POST_DETAIL" to Routes.POST_DETAIL,
            "CALLS" to Routes.CALLS,
            "CONTACTS" to Routes.CONTACTS,
            "CONTACTS_DISCOVER" to Routes.CONTACTS_DISCOVER,
            "NOTIFICATIONS" to Routes.NOTIFICATIONS,
            "BLOCKED_USERS" to Routes.BLOCKED_USERS,
            "STARRED" to Routes.STARRED,
            "PROFILE_USER" to Routes.PROFILE_USER,
            "USER_POSTS" to Routes.USER_POSTS,
            "REPORT_USER" to Routes.REPORT_USER,
            "STORY_VIEWER" to Routes.STORY_VIEWER,
            "STORY_COMPOSER_ROUTE" to Routes.STORY_COMPOSER_ROUTE,
            "REELS" to Routes.REELS,
            "CALL" to Routes.CALL,
        )
        assertThat(actual).containsExactly(
            "LOGIN", "login",
            "REGISTRATION", "register",
            "FORGOT_PASSWORD", "forgot-password",
            "MAGIC_LINK", "magic-link",
            "MAGIC_LINK_VALIDATE", "auth/magic-link?token={token}",
            "GUEST_JOIN", "join/{identifier}",
            "CONVERSATIONS", "conversations",
            "NEW_CONVERSATION", "conversations/new",
            "GLOBAL_SEARCH", "search",
            "DASHBOARD", "dashboard",
            "CREATE_SHARE_LINK", "conversations/{conversationId}/share-link/new",
            "SHARE_LINK_PICKER", "conversations/share-link/picker",
            "MY_SHARE_LINKS", "share-links",
            "SHARE_LINK_DETAIL", "share-links/{linkId}",
            "CHAT", "chat/{conversationId}?messageId={messageId}",
            "FEED", "feed",
            "SAVED_POSTS", "feed/saved",
            "NEARBY_DISCOVERY", "feed/nearby",
            "POST_DETAIL", "feed/post/{postId}",
            "CALLS", "calls",
            "CONTACTS", "contacts",
            "CONTACTS_DISCOVER", "contacts/discover",
            "NOTIFICATIONS", "notifications",
            "BLOCKED_USERS", "contacts/blocked",
            "STARRED", "starred",
            "PROFILE_USER", "profile/{userId}",
            "USER_POSTS", "profile/{userId}/posts",
            "REPORT_USER", "report/{userId}?username={username}",
            "STORY_VIEWER", "story/{userId}",
            "STORY_COMPOSER_ROUTE", "story_composer?repostOfId={repostOfId}",
            "REELS", "reels?seed={seed}",
            "CALL", CallRoute.PATTERN,
        )
    }

    @Test
    fun `deep link patterns are frozen`() {
        assertThat(Routes.GUEST_JOIN_DEEP_LINK).isEqualTo("meeshy://join/{identifier}")
        assertThat(Routes.GUEST_JOIN_WEB_DEEP_LINK).isEqualTo("https://meeshy.me/join/{identifier}")
        assertThat(Routes.GUEST_JOIN_CHAT_WEB_DEEP_LINK).isEqualTo("https://meeshy.me/chat/{identifier}")
        assertThat(Routes.CONVERSATIONS_DEEP_LINK).isEqualTo("meeshy://conversations")
        assertThat(Routes.CHAT_DEEP_LINK).isEqualTo("meeshy://chat/{conversationId}?messageId={messageId}")
        assertThat(Routes.CONVERSATION_DEEP_LINK).isEqualTo("meeshy://conversations/{conversationId}")
        assertThat(Routes.CONVERSATION_SINGULAR_DEEP_LINK).isEqualTo("meeshy://conversation/{conversationId}")
        assertThat(Routes.CONVERSATION_DRAFT_DEEP_LINK)
            .isEqualTo("meeshy://conversation/{conversationId}?draft={draft}")
        assertThat(Routes.CONVERSATION_SHORT_DEEP_LINK).isEqualTo("meeshy://c/{conversationId}")
        assertThat(Routes.PROFILE_DEEP_LINK).isEqualTo("meeshy://profile/{userId}")
        assertThat(Routes.PROFILE_SHARE_APP_DEEP_LINK).isEqualTo("meeshy://u/{userId}")
        assertThat(Routes.PROFILE_SHARE_WEB_DEEP_LINK).isEqualTo("https://meeshy.me/u/{userId}")
        assertThat(Routes.STORY_DEEP_LINK).isEqualTo("meeshy://story/{userId}")
    }

    @Test
    fun `settings routes are frozen`() {
        assertThat(
            listOf(
                Routes.SETTINGS,
                Routes.CHANGE_PASSWORD,
                Routes.TWO_FACTOR,
                Routes.ACCOUNT_CONTACT,
                Routes.MEDIA_DOWNLOAD,
                Routes.MEDIA_CACHE,
                Routes.PRIVACY,
                Routes.ACTIVE_SESSIONS,
                Routes.DATA_EXPORT,
                Routes.DIAGNOSTICS,
                Routes.ABOUT,
                Routes.SUPPORT,
                Routes.LICENSES,
                Routes.LEGAL,
                Routes.DELETE_ACCOUNT,
            ),
        ).containsExactly(
            "settings",
            "settings/change-password",
            "settings/two-factor",
            "settings/account-contact",
            "settings/media-download",
            "settings/media-cache",
            "settings/privacy",
            "settings/sessions",
            "settings/data-export",
            "settings/diagnostics",
            "settings/about",
            "settings/support",
            "settings/licenses",
            "settings/legal/{doc}",
            "settings/delete-account",
        ).inOrder()
    }

    @Test
    fun `my encrypted devices live under settings`() {
        assertThat(Routes.ENCRYPTED_DEVICES).isEqualTo("settings/encrypted-devices")
    }

    @Test
    fun `legal route resolves for every document kind`() {
        LegalDocumentKind.values().forEach { kind ->
            assertThat(Routes.legal(kind)).isEqualTo("settings/legal/${kind.arg}")
        }
        assertThat(Routes.legal(LegalDocumentKind.TERMS_OF_SERVICE)).isEqualTo("settings/legal/terms")
        assertThat(Routes.legal(LegalDocumentKind.PRIVACY_POLICY)).isEqualTo("settings/legal/privacy")
    }

    @Test
    fun `route builders keep their shape`() {
        assertThat(Routes.chat("c1")).isEqualTo("chat/c1")
        assertThat(Routes.profile("u1")).isEqualTo("profile/u1")
        assertThat(Routes.userPosts("u1")).isEqualTo("profile/u1/posts")
        assertThat(Routes.story("u1")).isEqualTo("story/u1")
        assertThat(Routes.postDetail("p1")).isEqualTo("feed/post/p1")
        assertThat(Routes.guestJoin("abc")).isEqualTo("join/abc")
        assertThat(Routes.createShareLink("c1")).isEqualTo("conversations/c1/share-link/new")
        assertThat(Routes.shareLinkDetail("l1")).isEqualTo("share-links/l1")
        assertThat(Routes.reels()).isEqualTo("reels")
        assertThat(Routes.reels("p1")).isEqualTo("reels?seed=p1")
    }
}
