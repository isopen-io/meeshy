package me.meeshy.app.game.ceremony

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.ceremony.MintCeremonyInk
import me.meeshy.sdk.model.game.ceremony.MintCeremonyInkFamily
import org.junit.Test

class MintCeremonyPaletteTest {

    private fun palette(edition: MeeshEdition) = MintCeremonyPalette(edition)

    @Test
    fun `each edition has its own glow`() {
        val glows = MeeshEdition.values().map { palette(it).glow }
        assertThat(glows.toSet()).hasSize(MeeshEdition.values().size)
    }

    @Test
    fun `the prism forge is a violet night while silver and gold share the warm forge`() {
        assertThat(palette(MeeshEdition.Prism).bg).isNotEqualTo(palette(MeeshEdition.Silver).bg)
        assertThat(palette(MeeshEdition.Silver).bg).isEqualTo(palette(MeeshEdition.Gold).bg)
        assertThat(palette(MeeshEdition.Prism).sign).isNotEqualTo(palette(MeeshEdition.Gold).sign)
    }

    @Test
    fun `gold weaves with a richer thread than silver`() {
        val ink = MintCeremonyInk(MintCeremonyInkFamily.Weave, 0)
        assertThat(palette(MeeshEdition.Gold).color(ink)).isNotEqualTo(palette(MeeshEdition.Silver).color(ink))
    }

    @Test
    fun `tools are the same everywhere - steel, anvil and wood`() {
        MeeshEdition.values().forEach {
            val p = palette(it)
            assertThat(p.steel).hasSize(2)
            assertThat(p.anvil).hasSize(2)
            assertThat(p.wood).hasSize(2)
        }
    }

    @Test
    fun `every ink family and tone resolves to a colour`() {
        MeeshEdition.values().forEach { edition ->
            MintCeremonyInkFamily.values().forEach { family ->
                (0 until family.tones).forEach { tone -> palette(edition).color(MintCeremonyInk(family, tone)) }
            }
        }
    }
}
