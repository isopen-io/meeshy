package me.meeshy.sdk.model.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.navigation.NavigationHubRule.Decision
import org.junit.Test

class NavigationHubRuleTest {
    private fun rule() = NavigationHubRule(setOf("settings", "contacts", "links", "notifications", "communities"))

    @Test
    fun `une route identique a la courante est ignoree`() {
        assertThat(rule().decide(listOf("conversations", "chat/a"), "chat/a")).isEqualTo(Decision.Ignore)
    }

    @Test
    fun `une route ordinaire s'empile meme deja presente plus bas`() {
        assertThat(rule().decide(listOf("conversations", "chat/a", "profile/u"), "chat/a")).isEqualTo(Decision.Push)
    }

    @Test
    fun `un hub absent de la pile s'empile`() {
        assertThat(rule().decide(listOf("conversations"), "settings")).isEqualTo(Decision.Push)
    }

    @Test
    fun `renaviguer vers un hub deja empile depile jusqu'a lui`() {
        val stack = listOf("conversations", "settings", "settings/privacy", "settings/sessions")
        assertThat(rule().decide(stack, "settings")).isEqualTo(Decision.PopTo(1))
    }

    @Test
    fun `un hub se reconnait a sa base sans sa requete`() {
        val r = rule()
        assertThat(r.isHub("links?create=true")).isTrue()
        assertThat(r.isHub("settings/privacy")).isFalse()
        assertThat(r.isHub(null)).isFalse()
        assertThat(r.decide(listOf("conversations", "links", "tracking-links"), "links?create=true")).isEqualTo(Decision.PopTo(1))
    }

    @Test
    fun `le hub courant est ignore avant d'etre depile`() {
        assertThat(rule().decide(listOf("conversations", "contacts"), "contacts")).isEqualTo(Decision.Ignore)
    }

    @Test
    fun `aucun retour n'est possible a la racine`() {
        assertThat(rule().canPop(listOf("conversations"))).isFalse()
        assertThat(rule().canPop(emptyList())).isFalse()
        assertThat(rule().canPop(listOf("conversations", "chat/a"))).isTrue()
    }
}
