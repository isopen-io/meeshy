package me.meeshy.ui.component.game

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.engagement.EngagementAxisKey
import org.junit.Test

class GameMedalGlyphTest {

    @Test
    fun `chaque axe a son pictogramme et aucun axe n'en partage un`() {
        val glyphs = EngagementAxisKey.entries.map { GameMedalGlyph.of(it) }
        assertThat(glyphs).hasSize(20)
        assertThat(glyphs.toSet()).hasSize(20)
    }

    @Test
    fun `un pictogramme par axe, ni plus ni moins`() {
        assertThat(GameMedalGlyph.entries).hasSize(EngagementAxisKey.entries.size)
    }

    @Test
    fun `les noms web reprennent ceux de la planche`() {
        assertThat(GameMedalGlyph.of(EngagementAxisKey.AUDIO_MESSAGE).webName).isEqualTo("voice")
        assertThat(GameMedalGlyph.of(EngagementAxisKey.TRACKED_LINK).webName).isEqualTo("link")
        assertThat(GameMedalGlyph.of(EngagementAxisKey.INVITE_JOINED).webName).isEqualTo("invite")
        assertThat(GameMedalGlyph.entries.map { it.webName }.toSet()).hasSize(20)
    }

    @Test
    fun `l'emaux d'une famille suit la couleur de la planche`() {
        fun hex(rgb: Long) = androidx.compose.ui.graphics.Color(0xFF000000L or rgb)
        assertThat(GameMedalFamily.CONTENT.enamel).isEqualTo(hex(0x4f46e5))
        assertThat(GameMedalFamily.SOCIAL.enamel).isEqualTo(hex(0xe11d48))
        assertThat(GameMedalFamily.CONVERSATION.enamel).isEqualTo(hex(0x7c3aed))
        assertThat(GameMedalFamily.COMMENT.enamel).isEqualTo(hex(0x0d9488))
        assertThat(GameMedalFamily.TOOL.enamel).isEqualTo(hex(0xd97706))
    }

    @Test
    fun `la famille de chaque axe donne l'emaux de son prefixe`() {
        EngagementAxisKey.entries.forEach { axis ->
            val expected = GameMedalFamily.entries.first { it.name.lowercase() == axis.wire.substringBefore('.') }
            assertThat(GameMedalFamily.of(axis.family)).isEqualTo(expected)
        }
    }
}
