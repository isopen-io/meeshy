package me.meeshy.sdk.model.push

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationShortcutIdTest {
    @Test
    fun `l identifiant est le brut sans prefixe`() {
        assertThat(ConversationShortcutId.of("65a1b2c3d4e5f6a7b8c9d0e1")).isEqualTo("65a1b2c3d4e5f6a7b8c9d0e1")
        assertThat(ConversationShortcutId.of(" c1 ")).isEqualTo("c1")
    }

    @Test
    fun `absent ou vide donne null`() {
        assertThat(ConversationShortcutId.of(null)).isNull()
        assertThat(ConversationShortcutId.of("  ")).isNull()
    }
}
