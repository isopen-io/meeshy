package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * #17819 · P8.14 · loi 17.1 — la couche du mode Effets FOND à l'entrée et à la sortie, comme iOS (`CallView+Mode.swift`,
 * `.transition(.opacity)`), au lieu d'apparaître et de disparaître en une image. `CallScreen.kt` la compose par l'atome
 * [CallModeLayer] (#17817), que `CallModeLayerMotionTest` observe image par image : Effets ne monte pas du bas, sa couche fond
 * seulement, et le fondu court reste sous « Réduire les animations ». Pendant le fondu de sortie, la couche encore dessinée ne
 * prend plus le retour système (`active`) : il revient à l'écran d'appel, ou au Montage qui la remplace.
 */
class CallEffectsModeLayerTest {

    private val commentLine = Regex("""^\s*(//|\*|/\*)""")

    private fun calls(): File = generateSequence(File("").absoluteFile) { it.parentFile }
        .flatMap { sequenceOf(File(it, "src/main/kotlin/me/meeshy/app/calls"), File(it, "feature/calls/src/main/kotlin/me/meeshy/app/calls")) }
        .first { File(it, "CallScreen.kt").isFile }

    private fun code(name: String): String =
        File(calls(), name).readLines().filterNot { commentLine.containsMatchIn(it) }.joinToString("\n")

    @Test
    fun `P8_14 - Effets est toujours compose par la couche d'un mode, plus par un simple if`() {
        val screen = code("CallScreen.kt")

        assertThat(screen).doesNotContain("if (chromeState.layer.activeMode == CallScreenMode.Effects)")
        val layer = screen.substringAfter("CallModeLayer(").substringBefore("CallEffectsMode(")
        assertThat(layer).contains("visible = chromeState.layer.activeMode == CallScreenMode.Effects,")
        assertThat(layer).contains("mode = CallScreenMode.Effects,")
        assertThat(layer).contains("reduceMotion = reduceMotion,")
        assertThat(screen.indexOf("CallModeLayer(")).isLessThan(screen.indexOf("CallEffectsMode("))
    }

    @Test
    fun `P8_14 - la couche qui fond en sortant ne prend plus le retour systeme`() {
        val screen = code("CallScreen.kt")
        val mode = code("CallEffectsMode.kt")

        assertThat(screen.substringAfter("CallEffectsMode(")).contains("active = chromeState.layer.activeMode == CallScreenMode.Effects,")
        assertThat(mode).contains("BackHandler(enabled = active) { goBack() }")
        assertThat(mode).doesNotContain("BackHandler { goBack() }")
    }

    @Test
    fun `P8_14 - revenir dans Effets pendant le fondu de sortie rouvre la session close par retour`() {
        val mode = code("CallEffectsMode.kt")

        assertThat(mode).contains("LaunchedEffect(session, active) { if (active) session.reopen() }")
    }
}
