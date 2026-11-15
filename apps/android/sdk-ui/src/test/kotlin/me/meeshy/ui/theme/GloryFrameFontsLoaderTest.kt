package me.meeshy.ui.theme

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GloryFrameFontsLoaderTest {

    private class Opens {
        val calls = mutableListOf<Pair<String, String?>>()
        fun loader(failing: Boolean = false) = GloryFrameFontLoader("systeme") { path, variation ->
            calls += path to variation
            if (failing) null else "police:$path"
        }
    }

    @Test
    fun `aucun asset n est ouvert avant le premier appel`() {
        val opens = Opens()
        opens.loader()
        assertThat(opens.calls).isEmpty()
    }

    @Test
    fun `une famille inconnue rend le repli sans rien ouvrir`() {
        val opens = Opens()
        assertThat(opens.loader().resolve("Comic Sans", 400)).isEqualTo("systeme")
        assertThat(opens.calls).isEmpty()
    }

    @Test
    fun `un texte non latin ou un emoji prend la pile systeme`() {
        val opens = Opens()
        val loader = opens.loader()
        assertThat(loader.resolve("Cinzel", 400, text = "Привет")).isEqualTo("systeme")
        assertThat(loader.resolve("Cinzel", 400, text = "Gloire 🔥")).isEqualTo("systeme")
        assertThat(loader.resolve("Cinzel", 400, text = "Éclat œuvre")).isEqualTo("police:fonts/glory/Cinzel[wght].ttf")
    }

    @Test
    fun `la graisse devient l axe wght et le fichier est charge une seule fois`() {
        val opens = Opens()
        val loader = opens.loader()
        loader.resolve("Manrope", 700)
        loader.resolve("Manrope", 700)
        assertThat(opens.calls).containsExactly("fonts/glory/Manrope[wght].ttf" to "'wght' 700")
    }

    @Test
    fun `Fraunces applique les quatre axes et Cinzel Decorative reste statique`() {
        val opens = Opens()
        val loader = opens.loader()
        loader.resolve("Fraunces", 600, opticalSize = 30f)
        loader.resolve("Cinzel Decorative", 900)
        assertThat(opens.calls).containsExactly(
            "fonts/glory/Fraunces[SOFT,WONK,opsz,wght].ttf" to "'wght' 600, 'opsz' 30.0, 'SOFT' 0, 'WONK' 0",
            "fonts/glory/CinzelDecorative-Black.ttf" to null,
        )
    }

    @Test
    fun `un echec de chargement retombe sur le repli sans crash`() {
        val opens = Opens()
        assertThat(opens.loader(failing = true).resolve("Cinzel", 400)).isEqualTo("systeme")
        val throwing = GloryFrameFontLoader("systeme") { _, _ -> error("asset corrompu") }
        assertThat(throwing.resolve("Cinzel", 400)).isEqualTo("systeme")
    }

    @Test
    fun `l italique de Cormorant choisit son fichier`() {
        val opens = Opens()
        opens.loader().resolve("Cormorant Garamond", 300, italic = true)
        assertThat(opens.calls.single().first).isEqualTo("fonts/glory/CormorantGaramond-Italic[wght].ttf")
    }
}
