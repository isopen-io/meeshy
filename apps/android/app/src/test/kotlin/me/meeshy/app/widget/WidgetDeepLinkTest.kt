package me.meeshy.app.widget

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class WidgetDeepLinkTest {

    @Test
    fun `a conversation tap opens that conversation`() {
        assertThat(WidgetDeepLink.conversation("65f1a2b3c4d5e6f708192a3b")).isEqualTo("meeshy://conversation/65f1a2b3c4d5e6f708192a3b")
    }

    @Test
    fun `an identifier that could alter the link falls back to the conversation list`() {
        listOf("a/b", "a?x=1", "a#f", "a b", "", "../x", "a".repeat(65)).forEach {
            assertThat(WidgetDeepLink.conversation(it)).isEqualTo(WidgetDeepLink.HOME)
            assertThat(WidgetDeepLink.reply(it, "OK")).isEqualTo(WidgetDeepLink.HOME)
        }
    }

    @Test
    fun `a reply carries its draft encoded`() {
        assertThat(WidgetDeepLink.reply("c1", "a b&c")).isEqualTo("meeshy://conversation/c1?draft=a+b%26c")
    }

    @Test
    fun `le lien du compteur ouvre la liste filtree sur les non lus`() {
        assertThat(WidgetDeepLink.UNREAD).isEqualTo("meeshy://conversations/unread")
    }
}
