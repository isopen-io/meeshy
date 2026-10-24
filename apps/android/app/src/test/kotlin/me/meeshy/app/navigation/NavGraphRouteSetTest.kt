package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * L'union des destinations declarees par les graphes de domaine == le snapshot de
 * l'ancien MeeshyApp.kt : une destination oubliee a l'extraction ferait tomber un
 * ecran, un doublon ferait lever Compose a la construction du graphe.
 */
class NavGraphRouteSetTest {

    private val navigationDir = File("src/main/kotlin/me/meeshy/app/navigation")
    private val graphDir = File(navigationDir, "graph")

    private val registered: List<String> = graphDir.listFiles { file -> file.name.endsWith("NavGraph.kt") }
        .orEmpty()
        .flatMap { file ->
            Regex("""composable\(\s*(?:route = )?(?:"\$\{)?Routes\.([A-Z_]+)""").findAll(file.readText()).map { it.groupValues[1] }.toList()
        }

    @Test
    fun `every pre-split destination is registered exactly once`() {
        assertThat(registered).containsExactly(
            "LOGIN", "FORGOT_PASSWORD", "MAGIC_LINK", "MAGIC_LINK_VALIDATE", "REGISTRATION", "GUEST_JOIN",
            "CONVERSATIONS", "SHARE_LINK_PICKER", "GLOBAL_SEARCH", "DASHBOARD", "CREATE_SHARE_LINK",
            "MY_SHARE_LINKS", "SHARE_LINK_DETAIL", "NEW_CONVERSATION", "CHAT", "STARRED",
            "FEED", "SAVED_POSTS", "NEARBY_DISCOVERY", "POST_DETAIL", "REELS", "STORY_VIEWER", "STORY_COMPOSER_ROUTE",
            "SETTINGS", "CHANGE_PASSWORD", "TWO_FACTOR", "ACCOUNT_CONTACT", "DELETE_ACCOUNT", "MEDIA_DOWNLOAD",
            "MEDIA_CACHE", "DATA_EXPORT", "DIAGNOSTICS", "ABOUT", "SUPPORT", "LICENSES", "LEGAL", "PRIVACY",
            "ACTIVE_SESSIONS", "SECURITY",
            "CONTACTS", "CONTACTS_DISCOVER", "BLOCKED_USERS", "NOTIFICATIONS", "PROFILE_USER", "USER_POSTS", "REPORT_USER",
            "CALLS", "CALL",
        )
    }

    @Test
    fun `MeeshyApp no longer declares a destination`() {
        assertThat(File(navigationDir, "MeeshyApp.kt").readText()).doesNotContain("composable(")
    }

    @Test
    fun `deep links stay declared in the graphs`() {
        val deepLinks = graphDir.listFiles().orEmpty()
            .flatMap { Regex("""uriPattern = (Routes\.[A-Z_]+)""").findAll(it.readText()).map { m -> m.groupValues[1] }.toList() }
        assertThat(deepLinks).containsExactly(
            "Routes.GUEST_JOIN_DEEP_LINK", "Routes.GUEST_JOIN_WEB_DEEP_LINK", "Routes.GUEST_JOIN_CHAT_WEB_DEEP_LINK",
            "Routes.CONVERSATIONS_DEEP_LINK",
            "Routes.CHAT_DEEP_LINK", "Routes.CONVERSATION_DEEP_LINK", "Routes.CONVERSATION_SINGULAR_DEEP_LINK",
            "Routes.CONVERSATION_SHORT_DEEP_LINK", "Routes.CONVERSATION_DRAFT_DEEP_LINK",
            "Routes.PROFILE_DEEP_LINK", "Routes.PROFILE_SHARE_APP_DEEP_LINK", "Routes.PROFILE_SHARE_WEB_DEEP_LINK",
            "Routes.STORY_DEEP_LINK",
        )
    }

    @Test
    fun `size budget holds for the navigation folder`() {
        assertThat(File(navigationDir, "MeeshyApp.kt").readLines().size).isAtMost(400)
        val oversized = navigationDir.walkTopDown()
            .filter { it.isFile && it.extension == "kt" && it.readLines().size > 600 }
            .map { it.name }
            .toList()
        assertThat(oversized).isEmpty()
    }
}
