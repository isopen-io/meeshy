package me.meeshy.sdk.model.licenses

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

class GloryFrameFontCreditsTest {

    @Test
    fun `les cinq familles des cadres sont creditees avec leur copyright`() {
        assertThat(GloryFrameFontCredits.CREDITS.map { it.family })
            .containsExactly("Cinzel", "Cinzel Decorative", "Cormorant Garamond", "Fraunces", "Manrope")
        assertThat(GloryFrameFontCredits.CREDITS.all { it.copyright.startsWith("Copyright") }).isTrue()
    }

    @Test
    fun `chaque copyright affiche figure dans le texte OFL embarque`() {
        val ofl = oflText()
        GloryFrameFontCredits.CREDITS.forEach {
            assertThat(ofl).contains(it.copyright.substringBefore(","))
        }
    }

    private fun oflText(): String {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "licenses/OFL-GloryFrameFonts.txt")
            if (candidate.isFile) return candidate.readText()
            dir = dir.parentFile
        }
        error("OFL-GloryFrameFonts.txt introuvable")
    }
}
