package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * Les décisions du porteur de l'audit final du 2026-11-13 (#17945 à #17949, chantier #17329), tenues par la source :
 * garde miroir de `CallViewGlassGuardTests` côté iOS. Les lois pures qui les portent ont leurs propres témoins
 * (`CallChromeVisibilityTest`, `CallAudioStageLayoutTest`, `CallEffectsModeRuleTest`, `CallGroupStageSizingTest`).
 */
class CallAuditFinalDecisionsGuardTest {
    private val commentLine = Regex("""^\s*(//|\*|/\*)""")

    private fun calls(): File = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, "src/main/kotlin/me/meeshy/app/calls") }
        .first { File(it, "CallScreen.kt").isFile }

    private fun code(name: String): String =
        File(calls(), name).readLines().filterNot { commentLine.containsMatchIn(it) }.joinToString("\n")

    /** #17945 (B) : en duo audio, un toucher sur le fond range l'en-tête, la pilule et le journal ; un nouveau toucher les rend. */
    @Test
    fun `17945 the chrome reads the tap stage everywhere, and a duo audio call has a background that takes the tap`() {
        val screen = code("CallScreen.kt")
        val layout = code("CallConnectedLayout.kt")
        assertThat(layout).contains("CallChromeVisibility.isTapStage(")
        assertThat(screen).contains("callIsTapStage(state, groupVideo)")
        assertThat(layout).contains("chrome.visibility(callIsTapStage(state, group), explore)")
        assertThat(layout).contains("chrome.visibility(callIsTapStage(state, groupVideo), explore)")
        assertThat(screen + layout).doesNotContain("chrome.visibility(callIsVideoStage")
        assertThat(screen).doesNotContain("mayToggleByTap(videoScene")
        val background = screen.substringAfter("if (duo.shown) {").substringBefore("preview.video?")
        assertThat(background).contains("CallAudioSceneTapTarget(onTap = it)")
        val target = code("CallAudioStage.kt").substringAfter("internal fun CallAudioSceneTapTarget(")
        assertThat(target).contains("detectTapGestures(onTap = { onTap() })")
        assertThat(target).contains("clearAndSetSemantics")
    }

    /** #17946 (A) : en mode Effets ou Montage, le verre des sous-titres n'a pas de « Journal » ; son pied reste. */
    @Test
    fun `17946 both modes draw their captions through ONE host that never offers the Journal`() {
        val captions = code("CallCaptionsBand.kt").substringAfter("internal fun CallModeCaptions(").substringBefore("\n}\n")
        assertThat(captions).contains("opensJournal = false")
        assertThat(captions).contains("hasOwnGlass = true")
        assertThat(captions).contains("CaptionsMode.Off")
        assertThat(code("CallEffectsMode.kt")).contains("CallModeCaptions(state")
        assertThat(code("CallEffectsMode.kt")).doesNotContain("CallCaptionsBandHost(")
        val montage = code("CallMontageCapture.kt")
        assertThat(montage).contains("captions = { CallModeCaptions(state) }")
        val picker = code("CallMontagePicker.kt")
        val column = picker.substringAfter("internal fun CallMontagePicker(").substringAfter("Column(")
        assertThat(column.indexOf("captions()")).isLessThan(column.indexOf("EffectsBand("))
    }

    /** #17947 (A) : le panneau Luminosité · Flou du fond reste ouvert pendant le réglage ; il se referme par Réglages ou ‹. */
    @Test
    fun `17947 adjusting a setting never closes the panel, only Settings and back do`() {
        val panel = code("CallEffectsMode.kt").substringAfter("internal fun EffectsSettingsPanel(").substringBefore("private fun EffectsSlider(")
        assertThat(panel).contains("mode.withBrightness(it)")
        assertThat(panel).contains("mode.togglingBlur()")
        assertThat(panel).doesNotContain("togglingSettings")
        assertThat(panel).doesNotContain("afterChoice")
        val bar = code("CallEffectsMode.kt").substringAfter("internal fun EffectsModeBar(").substringBefore("private fun EffectsLooksOrPanel(")
        assertThat(bar).contains("onChange(mode.togglingSettings())")
        assertThat(bar).contains("onFinish()")
    }

    /** #17948 (A) : en groupe, toucher la vignette à la une range les contrôles ; on revient à la grille par la capsule. */
    @Test
    fun `17948 the featured tile toggles the controls and only the capsule gives the grid back`() {
        val featured = code("CallGroupSpotlight.kt").substringAfter("private fun CallGroupFeaturedTile(")
        assertThat(featured).contains("onTap = { onStageTap?.invoke() }")
        assertThat(code("CallGroupSpotlight.kt")).doesNotContain("GroupCallSpotlightChoice.Grid")
        val stage = code("CallGroupStage.kt")
        assertThat(stage).contains("onGrid = { choose(GroupCallSpotlightChoice.Grid) }")
        assertThat(stage.split("GroupCallSpotlightChoice.Grid").size - 1).isEqualTo(1)
    }

    /** #17949 (A) : en groupe, la grille se resserre au-dessus de la pilule agrandie ; au repos, les plaques du bas restent visibles. */
    @Test
    fun `17949 the grid lives in the flow above the pill, so a growing pill shrinks it instead of covering it`() {
        val layout = code("CallConnectedLayout.kt")
        val column = layout.substringAfter("internal fun CallConnectedColumn(").substringAfter("Column(").substringBefore("CallActionRails(")
        val grid = column.indexOf("groupStage(")
        assertThat(grid).isAtLeast(0)
        assertThat(column.substring(grid)).contains("Modifier.weight(1f)")
        assertThat(grid).isLessThan(column.indexOf("CallControlsBlock("))
        assertThat(layout).contains("rowsMaxHeight = callPillRowsMaxHeight(stageMaxHeight, hasGrid = groupStage != null)")
    }
}
