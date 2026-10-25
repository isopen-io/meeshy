package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Ce que l'echelle deployee doit, et ne doit plus, offrir.
 *
 * La liste est extraite de [rememberMenuLadderItems] (qui est @Composable, donc
 * hors de portee d'un test JVM) pour que la regle soit verifiable. Parite iOS
 * stricte : 6 barreaux, Communautes differee (aucune destination Android),
 * Reels retire (appui long seul). Contacts (`menu_contacts`) est le SEUL
 * barreau retenu qui n'a pas d'equivalent iOS direct — il porte le nominal
 * a un geste vers l'onglet Contacts par defaut depuis que People a quitte
 * le TopAppBar de l'ecran Conversations.
 */
class MeeshyAppMenuItemsTest {

    @Test
    fun `the ladder offers exactly the six rungs, in order`() {
        assertThat(menuLadderLabelKeys())
            .containsExactly(
                "menu_my_links",
                "menu_notifications",
                "tab_calls",
                "menu_discover",
                "menu_contacts",
                "menu_settings",
            )
            .inOrder()
    }

    @Test
    fun `settings is always the last rung`() {
        assertThat(menuLadderLabelKeys().last()).isEqualTo("menu_settings")
    }

    @Test
    fun `the ladder no longer offers Reels`() {
        assertThat(menuLadderLabelKeys()).doesNotContain("menu_reels")
    }

    @Test
    fun `the ladder no longer offers a dedicated Messages rung`() {
        assertThat(menuLadderLabelKeys()).doesNotContain("tab_messages")
    }

    @Test
    fun `the ladder no longer offers New Conversation`() {
        assertThat(menuLadderLabelKeys()).doesNotContain("menu_new_conversation")
    }

    @Test
    fun `the ladder offers Contacts — the nominal one-gesture path since People left the header`() {
        assertThat(menuLadderLabelKeys()).contains("menu_contacts")
    }

    @Test
    fun `the ladder does not yet offer Communities`() {
        assertThat(menuLadderLabelKeys()).doesNotContain("menu_communities")
    }

    @Test
    fun `each rung keeps the iOS colour`() {
        assertThat(rootMenuLadderEntries(communitiesAvailable = true).map { it.colorHex })
            .containsExactly("#F8B500", "#FF6B6B", "#6366F1", "#8B5CF6", "#2ECC71", "#64748B")
            .inOrder()
    }

    @Test
    fun `notifications carry the unread count and discover the pending friend requests`() {
        val badges = rootMenuLadderEntries().associateWith { it.badgeCount(unreadNotifications = 4, pendingFriendRequests = 2) }
        assertThat(badges[RootMenuLadderEntry.NOTIFICATIONS]).isEqualTo(4)
        assertThat(badges[RootMenuLadderEntry.DISCOVER]).isEqualTo(2)
        assertThat(badges.filterKeys { it != RootMenuLadderEntry.NOTIFICATIONS && it != RootMenuLadderEntry.DISCOVER }.values)
            .containsExactly(0, 0, 0, 0)
    }

    @Test
    fun `a negative counter never shows a badge`() {
        assertThat(RootMenuLadderEntry.NOTIFICATIONS.badgeCount(unreadNotifications = -3, pendingFriendRequests = 0)).isEqualTo(0)
    }

    @Test
    fun `communities takes the contacts rung once it exists`() {
        assertThat(rootMenuLadderEntries(communitiesAvailable = true).map { it.labelKey })
            .containsExactly("menu_my_links", "menu_notifications", "tab_calls", "menu_discover", "menu_communities", "menu_settings")
            .inOrder()
        assertThat(rootMenuLadderEntries(communitiesAvailable = false)).contains(RootMenuLadderEntry.CONTACTS)
        assertThat(rootMenuLadderEntries(communitiesAvailable = false)).doesNotContain(RootMenuLadderEntry.COMMUNITIES)
    }

    @Test
    fun `the floating chrome hides on deep routes and shows on the top-level ones`() {
        assertThat(floatingChromeVisible(Routes.CONVERSATIONS)).isTrue()
        assertThat(floatingChromeVisible(Routes.FEED)).isTrue()
        assertThat(floatingChromeVisible(Routes.CHAT)).isFalse()
        assertThat(floatingChromeVisible(ProfileRoutes.OWN)).isFalse()
        assertThat(floatingChromeVisible(Routes.REELS)).isFalse()
        assertThat(floatingChromeVisible(null)).isFalse()
    }

    @Test
    fun `the avatar opens my own page, never a third party route`() {
        assertThat(floatingAvatarProfileRoute("64b7f0a1c2d3e4f5a6b7c8d9")).isEqualTo(ProfileRoutes.OWN)
        assertThat(floatingAvatarProfileRoute(null)).isNull()
    }
}
