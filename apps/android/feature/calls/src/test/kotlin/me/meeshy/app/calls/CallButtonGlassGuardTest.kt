package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * #17323 — la garde de source de la pilule et de l'en-tête de l'appel, miroir de iOS `CallViewGlassGuardTests` : chaque
 * bouton porte SON verre, choisi par la loi pure ; aucun disque translucide dessiné à plat ne revient ; le bloc, les
 * boutons et la capsule passent par UN site de dessin (le cliquet du verre fait main, `KitGlassRatchetTest`, ne monte pas).
 */
class CallButtonGlassGuardTest {

    private val commentLine = Regex("""^\s*(//|\*|/\*)""")

    private fun calls(): File = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, "src/main/kotlin/me/meeshy/app/calls") }
        .first { File(it, "CallControlGlass.kt").isFile }

    private fun code(name: String): String =
        File(calls(), name).readLines().filterNot { commentLine.containsMatchIn(it) }.joinToString("\n")

    private fun block(source: String, from: String, until: String): String {
        val start = source.indexOf(from)
        assertThat(start).isAtLeast(0)
        val end = source.indexOf(until, start + from.length)
        assertThat(end).isGreaterThan(start)
        return source.substring(start, end)
    }

    @Test
    fun `le disque d'un bouton est un verre choisi par la loi pure, pas un disque dessine`() {
        val glass = code("CallControlGlass.kt")
        val glyph = block(glass, "internal fun CallPillGlyph(", "private const val DISABLED_ALPHA")

        assertThat(glyph).contains("CallButtonGlassRule.treatment(")
        assertThat(glyph).contains("CallGlassPlate(")
        assertThat(glyph).contains("shape = CircleShape")
        assertThat(glyph).doesNotContain("Color.White.copy(alpha = 0.16f)")
        assertThat(glyph).doesNotContain("CallButtonFill.color(")
    }

    @Test
    fun `aucun disque translucide a plat ne reste dans la pilule, ses boutons et l'en-tete`() {
        for (name in listOf("CallControlGlass.kt", "CallControlsPill.kt", "CallHeaderBar.kt")) {
            val source = code(name)

            assertThat(source).doesNotContain("CallButtonFill.color(")
            assertThat(source).doesNotContain("Color.White.copy(alpha = 0.16f)")
        }
    }

    @Test
    fun `le verre de la pilule, de ses boutons et de l'en-tete a un seul site de dessin`() {
        val glass = code("CallControlGlass.kt")

        assertThat(Regex("""MeeshyGlassSurface\(""").findAll(glass).count()).isEqualTo(1)
        assertThat(code("CallHeaderBar.kt")).doesNotContain("MeeshyGlassSurface(")
        assertThat(code("CallControlsPill.kt")).doesNotContain("MeeshyGlassSurface(")
    }

    @Test
    fun `le bloc de la pilule, la capsule de l'en-tete et chaque bouton passent par le meme verre`() {
        val glass = code("CallControlGlass.kt")
        val blockOfPill = block(glass, "internal fun CallControlsGlass(", "internal fun CallPillHairline")
        val header = code("CallHeaderBar.kt")
        val chip = block(header, "private fun CallDurationChip(", "TransientCallSignalGlyph(strength)")

        assertThat(blockOfPill).contains("CallGlassPlate(")
        assertThat(chip).contains("CallGlassPlate(")
        assertThat(chip).contains("liquid = true")
        assertThat(chip).contains("CallButtonFill.pressedHighlight(pressed)")
        assertThat(header).contains("CallPillButton(")
    }

    @Test
    fun `Fin reste rouge, et le retour au toucher du bouton est garde`() {
        val glass = code("CallControlGlass.kt")
        val fill = block(glass, "internal object CallButtonFill {", "internal val LocalCallChromeInteraction")

        assertThat(fill).contains("MeeshyPalette.Error")
        assertThat(fill).contains("PRESSED_SCALE: Float = 0.88f")
        assertThat(block(glass, "internal fun CallPillButton(", "Column(")).contains("HapticFeedbackType.TextHandleMove")
    }
}
