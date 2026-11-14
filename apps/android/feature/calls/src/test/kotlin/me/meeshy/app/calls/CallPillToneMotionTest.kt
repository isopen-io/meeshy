package me.meeshy.app.calls

import androidx.compose.ui.graphics.Color
import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * L3.3 · L5.8 — la pilule change de largeur et le verre change de ton en mouvement, jamais d'un saut. La loi du fondu
 * (pure) est jouée ici ; la garde de source tient le câblage : la largeur et le ton sont lus à la mise en page et au
 * dessin, jamais à la composition, pour ne rien recomposer à chaque image.
 */
class CallPillToneMotionTest {
    private val commentLine = Regex("""^\s*(//|\*|/\*)""")

    private fun calls(): File = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, "src/main/kotlin/me/meeshy/app/calls") }
        .first { File(it, "CallGroupTile.kt").isFile }

    private fun code(name: String): String =
        File(calls(), name).also { assertThat(it.isFile).isTrue() }.readLines().filterNot { commentLine.containsMatchIn(it) }.joinToString("\n")

    @Test
    fun `the veil keeps the exact values of both tones at the ends of the fade`() {
        assertThat(callToneVeilAt(0f, CallGlassTone::veilAlpha)).isEqualTo(CallGlassTone.OverPicture.veil(0.2f))
        assertThat(callToneVeilAt(1f, CallGlassTone::veilAlpha)).isEqualTo(CallGlassTone.OverLightContent.veil(0.58f))
        assertThat(callToneVeilAt(0f, CallGlassTone::chipScrimAlpha)).isEqualTo(CallGlassTone.OverPicture.veil(0.35f))
        assertThat(callToneVeilAt(1f, CallGlassTone::chipScrimAlpha)).isEqualTo(CallGlassTone.OverLightContent.veil(0.58f))
    }

    @Test
    fun `between the two tones the veil is a blend, not one of them`() {
        val middle = callToneVeilAt(0.5f, CallGlassTone::chipScrimAlpha)
        assertThat(middle).isNotEqualTo(callToneVeilAt(0f, CallGlassTone::chipScrimAlpha))
        assertThat(middle).isNotEqualTo(callToneVeilAt(1f, CallGlassTone::chipScrimAlpha))
        assertThat(middle.alpha).isGreaterThan(0.35f)
        assertThat(middle.alpha).isLessThan(0.58f)
    }

    @Test
    fun `an out of range progress stays on the nearest tone`() {
        assertThat(callToneVeilAt(-0.3f, CallGlassTone::veilAlpha)).isEqualTo(callToneVeilAt(0f, CallGlassTone::veilAlpha))
        assertThat(callToneVeilAt(1.4f, CallGlassTone::veilAlpha)).isEqualTo(callToneVeilAt(1f, CallGlassTone::veilAlpha))
        assertThat(callToneVeilAt(0.5f, CallGlassTone::veilAlpha)).isNotEqualTo(Color.Unspecified)
    }

    @Test
    fun `the fade travels toward the dark tone on a received screen and back to the base tone`() {
        assertThat(CallGlassTone.OverLightContent.fadeTarget).isEqualTo(1f)
        assertThat(CallGlassTone.OverPicture.fadeTarget).isEqualTo(0f)
    }

    /**
     * L3.3 · loi 17.2 — ce témoin figeait une largeur ANIMÉE À LA MISE EN PAGE (`animateDpAsState` lu par un `layout`),
     * et la hauteur suivait par `expandVertically` : deux animations de géométrie, que la loi 17.2 interdit (« Android :
     * graphicsLayer »). Il évolue : la mise en page passe d'un coup à sa forme finale (440 → 560 dp compris), et c'est le
     * VERRE qui en repart, par une échelle tracée au dessin (FLIP, miroir de `morphKeyframes` du web).
     */
    @Test
    fun `L3_3 loi 17_2 - the pill's width and height are set at once, the glass morphs by a scale drawn at draw time`() {
        val pill = code("CallControlsPill.kt")
        assertThat(pill).contains("CallPillWidth.maxWidthDp(pillText, isUnfolded = ")
        assertThat(pill).doesNotContain("animateDpAsState(")
        assertThat(pill).doesNotContain("widthMillis")
        assertThat(pill).doesNotContain("expandVertically(")
        assertThat(pill).doesNotContain("shrinkVertically(")
        assertThat(pill).doesNotContain("SizeTransform(")
        assertThat(pill).contains("swap using null")
        assertThat(pill).contains("CallMorphingControlsGlass(")
        val morph = code("CallPillMorph.kt")
        assertThat(morph).contains("CallPillMotion.morph(")
        assertThat(morph).contains("drawWithContent")
        assertThat(morph).contains("scale(")
        assertThat(morph).contains("CallGlassPlate(")
        assertThat(morph).doesNotContain("animateDpAsState(")
    }

    @Test
    fun `loi 17_2 - what the layout moves inside the glass glides back by a translation drawn at draw time`() {
        val pill = code("CallControlsPill.kt")
        assertThat(Regex("""followsCallGlass\(""").findAll(pill).count()).isAtLeast(6)
        val morph = code("CallPillMorph.kt")
        assertThat(morph).contains("CallPillMotion.followShift(")
        assertThat(morph).contains("onPlaced")
        assertThat(morph).contains("translate(")
        assertThat(morph).doesNotContain(".offset(")
    }

    @Test
    fun `loi 17_2 - a button's caption fades in place, its room is set at once`() {
        val button = code("CallControlGlass.kt").let { it.substring(it.indexOf("internal fun CallPillButton("), it.indexOf("internal fun CallGlassPlate(")) }
        assertThat(button).contains("visible = captionShown")
        assertThat(button).doesNotContain("expandVertically(")
        assertThat(button).doesNotContain("shrinkVertically(")
    }

    @Test
    fun `loi 17_10 - under reduce motion the pill neither scales nor slides, the glass cross-fades`() {
        val morph = code("CallPillMorph.kt")
        assertThat(morph).contains("ghostAlpha")
        assertThat(morph).contains("saveLayer(")
        assertThat(code("CallControlsPill.kt")).contains("CallPillMotion.scalesOnUnfold(reduceMotion)")
    }

    @Test
    fun `L5_8 the glass veils fade at draw time and no veil is a composition-time background`() {
        val ui = code("CallGlassToneUi.kt")
        assertThat(ui).contains("drawWithCache")
        assertThat(ui).contains("progress.value")
        assertThat(ui).contains("LocalCallGlassToneProgress.current")
        assertThat(code("CallControlGlass.kt")).contains("callToneVeil(")
        assertThat(code("CallControlGlass.kt")).doesNotContain(".background(tone.veil(")
        assertThat(code("CallHeaderBar.kt")).contains("callToneVeil(")
        assertThat(code("CallHeaderBar.kt")).doesNotContain(".background(glassTone.veil(")
        assertThat(code("CallGlassToneUi.kt")).doesNotContain("background(tone.veil(")
    }

    @Test
    fun `L5_8 the screen animates the tone once and hands the progress down as a State`() {
        assertThat(code("CallScreen.kt")).contains("LocalCallGlassToneProgress provides")
        assertThat(code("CallGlassToneUi.kt")).contains("animateFloatAsState(")
        assertThat(code("CallGlassToneUi.kt")).contains("CallChromeStow.fadeMillis(reduceMotion)")
    }
}
