package me.meeshy.ui.component.game

import androidx.compose.ui.graphics.Color
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.LeagueKey
import me.meeshy.sdk.model.game.RarityBorder
import org.junit.Test

class LeagueGemViewTest {
    private fun hex(rgb: Long) = Color(0xFF000000L or rgb)

    @Test
    fun `les huit ligues ont les huit teintes de la planche`() {
        assertThat(LeagueKey.entries.map { it.gemColor }).containsExactly(
            hex(0xe5e7eb), hex(0xf59e0b), hex(0x10b981), hex(0x3b82f6),
            hex(0xe11d48), hex(0x8b5cf6), hex(0xbae6fd), hex(0xa855f7),
        ).inOrder()
    }

    @Test
    fun `les liserés de rarete vont de l'ardoise au prisme`() {
        assertThat(RarityBorder.entries.map { it.rimColor }).containsExactly(
            hex(0x94a3b8), hex(0x3b82f6), hex(0x8b5cf6), hex(0xf59e0b), null,
        ).inOrder()
    }

    @Test
    fun `le tampon pose le code en capitales et un point median quand il manque`() {
        assertThat(AtlasStampPlan.label("fr")).isEqualTo("FR")
        assertThat(AtlasStampPlan.label("")).isEqualTo("··")
    }

    @Test
    fun `seul le tampon pose prend l'encre de la langue et seul l'inconnu est en pointille`() {
        assertThat(AtlasStampState.entries.filter(AtlasStampPlan::usesTint)).containsExactly(AtlasStampState.Stamped)
        assertThat(AtlasStampState.entries.filter(AtlasStampPlan::dashed)).containsExactly(AtlasStampState.Undiscovered)
        assertThat(AtlasStampPlan.opacity(AtlasStampState.Pending)).isEqualTo(0.7f)
        assertThat(AtlasStampPlan.opacity(AtlasStampState.Stamped)).isEqualTo(1f)
    }
}
