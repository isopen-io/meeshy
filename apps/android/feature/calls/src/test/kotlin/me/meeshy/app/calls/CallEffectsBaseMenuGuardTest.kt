package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * C1 généralisée (décision porteur du 2026-11-14, #18185 ; remplace #17962 point 2, rappelle #16979 et #17947), tenue par
 * la source : en Effets comme au Montage, le carrousel n'existe que sur l'état `Looks` de la barre ; un choix le referme
 * (`CallEffectsBarRule.afterPick` / `afterChoice`) ; ‹ et le retour système referment ce qui est ouvert avant de quitter le
 * mode (`CallEffectsBarRule.afterBack`). La loi pure a ses vecteurs dans `CallEffectLayersTest` et `CallEffectsModeRuleTest`.
 */
class CallEffectsBaseMenuGuardTest {
    private val commentLine = Regex("""^\s*(//|\*|/\*)""")

    private fun calls(): File = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, "src/main/kotlin/me/meeshy/app/calls") }
        .first { File(it, "CallScreen.kt").isFile }

    private fun code(name: String): String =
        File(calls(), name).readLines().filterNot { commentLine.containsMatchIn(it) }.joinToString("\n")

    @Test
    fun `Effects draws its carousel on Looks only, and back and the system back close before they leave`() {
        val effects = code("CallEffectsMode.kt")
        val band = effects.substringAfter("private fun EffectsLooksOrPanel(").substringBefore("internal fun EffectsCarousel(")
        assertThat(band).contains("CallEffectsBarMode.Looks -> EffectsCarousel(")
        assertThat(band).doesNotContain("CallEffectsBarMode.Base -> EffectsCarousel(")
        val bar = effects.substringAfter("internal fun EffectsModeBar(").substringBefore("private fun EffectsLooksOrPanel(")
        assertThat(bar).contains("mode.back()?.let(onChange) ?: onFinish()")
        assertThat(effects).contains("BackHandler { goBack() }")
        assertThat(effects).doesNotContain("BackHandler { finish() }")
    }

    @Test
    fun `the Montage draws its frames on Looks only, keeps the Frame option on the base menu, and a pick closes it`() {
        val picker = code("CallMontagePicker.kt")
        assertThat(picker).contains("mutableStateOf(CallEffectsBarRule.opening)")
        assertThat(picker).contains("CallEffectsBarMode.Looks -> MontageLooksBand(")
        assertThat(picker).contains("CallEffectsBarMode.Base -> MontageHoldOption(")
        assertThat(picker).contains("onChosen = { bar = CallEffectsBarRule.afterChoice }")
        val carousel = picker.substringAfter("private fun MontageFramesCarousel(")
        assertThat(carousel).contains("onChosen()")
        assertThat(picker).contains("BackHandler(enabled = CallEffectsBarRule.afterBack(shownBar) != null)")
        assertThat(picker).contains("onBack = goBack")
        assertThat(picker).doesNotContain("onBack = onClose")
    }

    @Test
    fun `the genre chips are pressed only while their carousel is open`() {
        val effects = code("CallEffectsMode.kt").substringAfter("internal fun EffectsModeBar(").substringBefore("private fun EffectsLooksOrPanel(")
        assertThat(effects).contains("selected = mode.category.kind.takeIf { CallEffectsBarRule.showsCarousel(mode.bar) }")
        val picker = code("CallMontagePicker.kt")
        assertThat(picker).contains("selected = CallEffectKind.Frame.takeIf { CallEffectsBarRule.showsCarousel(shownBar) }")
    }
}
