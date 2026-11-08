package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.app.navigation.graph.CommunityRoutes
import me.meeshy.app.navigation.graph.LinksRoutes
import me.meeshy.sdk.model.navigation.NavigationHubRule.Decision
import org.junit.Test

class AppNavigatorHubsTest {
    private val rule = AppNavigator.HUB_RULE

    @Test
    fun `les ecrans du menu sont des hubs`() {
        listOf(Routes.SETTINGS, Routes.CONTACTS, Routes.NOTIFICATIONS, CommunityRoutes.LIST, LinksRoutes.HUB)
            .forEach { assertThat(rule.isHub(it)).isTrue() }
    }

    @Test
    fun `une conversation n'est pas un hub`() {
        assertThat(rule.isHub("chat/42")).isFalse()
    }

    @Test
    fun `renaviguer vers les reglages depuis une sous-page depile jusqu'a eux`() {
        val stack = listOf("conversations", "settings", "settings/privacy")
        assertThat(rule.decide(stack, Routes.SETTINGS)).isEqualTo(Decision.PopTo(1))
    }
}
