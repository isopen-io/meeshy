package me.meeshy.ui.component.kit

import android.view.KeyEvent as NativeKeyEvent
import androidx.compose.animation.core.SnapSpec
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.isSelected
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.performKeyPress
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsProperties
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.feedback.HapticSink
import me.meeshy.sdk.feedback.HapticSurfacing
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.theme.MeeshyAdaptiveColors
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * K03 — le choix segmenté : sa loi lue sur les vecteurs partagés (`docs/product/kit/K03-MeeshySegmented.vectors.json`),
 * son contraste calculé sur les jetons, et son comportement rendu (rappel, haptique, nom accessible, rôle, largeur stable).
 * Miroir de `MeeshySegmentedTests` et `MeeshySegmentedRenderTests` (iOS).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshySegmentedTest {

    @get:Rule
    val compose = createComposeRule()

    private class Recorder : HapticSink {
        val received = mutableListOf<Int>()
        override fun perform(feedbackConstant: Int) {
            received += feedbackConstant
        }
    }

    private fun vectors(): JsonObject {
        val file = generateSequence(File("").absoluteFile) { it.parentFile }
            .map { File(it, "docs/product/kit/K03-MeeshySegmented.vectors.json") }
            .first { it.exists() }
        return Json.parseToJsonElement(file.readText()).jsonObject
    }

    private fun JsonObject.rowsOf(key: String): List<JsonObject> = getValue(key).jsonArray.map { it.jsonObject }

    private fun JsonObject.int(key: String): Int = getValue(key).jsonPrimitive.int

    private fun JsonObject.intOrNull(key: String): Int? =
        getValue(key).takeUnless { it is JsonNull }?.jsonPrimitive?.int

    private fun JsonObject.bool(key: String): Boolean = getValue(key).jsonPrimitive.content == "true"

    private fun JsonObject.doubles(key: String): List<Double> =
        getValue(key).jsonArray.map { it.jsonPrimitive.double }

    private fun MeeshySegmentedLaw.Key.wire(): String = name.lowercase()

    // region La loi, sur les vecteurs

    @Test
    fun `deux a quatre options se rendent, moins ou plus ne rend rien`() {
        vectors().rowsOf("renderable").forEach { case ->
            assertThat(MeeshySegmentedLaw.isRenderable(case.int("count"))).isEqualTo(case.bool("expected"))
        }
    }

    @Test
    fun `les options rendues gardent leur ordre, et rien au-dela de quatre`() {
        assertThat(MeeshySegmentedLaw.rendered(listOf("a"))).isEmpty()
        assertThat(MeeshySegmentedLaw.rendered(listOf("a", "b", "c", "d"))).containsExactly("a", "b", "c", "d").inOrder()
        assertThat(MeeshySegmentedLaw.rendered(listOf("a", "b", "c", "d", "e"))).isEmpty()
    }

    @Test
    fun `un toucher change la selection seulement sur un autre segment, jamais hors ligne`() {
        vectors().rowsOf("changes").forEach { case ->
            val result = MeeshySegmentedLaw.tapResult(
                current = case.intOrNull("current"),
                target = case.int("target"),
                isEnabled = true,
            )
            assertThat(result != null).isEqualTo(case.bool("expected"))
        }
        assertThat(MeeshySegmentedLaw.tapResult(current = 1, target = 0, isEnabled = false)).isNull()
    }

    @Test
    fun `les fleches suivent le sens de lecture, bouclent, et Debut Fin vont aux bornes`() {
        vectors().rowsOf("keyboard").forEach { case ->
            val key = MeeshySegmentedLaw.Key.entries.single { it.wire() == case.getValue("key").jsonPrimitive.content }
            val target = MeeshySegmentedLaw.keyboardTarget(
                key = key,
                index = case.int("index"),
                count = case.int("count"),
                rtl = case.bool("rtl"),
            )
            assertThat(target).isEqualTo(case.intOrNull("expected"))
        }
    }

    @Test
    fun `la repartition garde les parts egales, le plancher au texte et le repli en rangees`() {
        vectors().rowsOf("partition").forEach { case ->
            val widths = case.doubles("widths")
            val available = case.getValue("available").jsonPrimitive.double
            val expected = case.getValue("rows").jsonArray.map { row -> row.jsonArray.map { it.jsonPrimitive.double } }
            assertThat(MeeshySegmentedLaw.partition(widths, available)).isEqualTo(expected)
        }
    }

    @Test
    fun `une selection absente des options n'a aucun courant`() {
        assertThat(MeeshySegmentedLaw.currentIndex(selection = 9, ids = listOf(1, 2))).isNull()
        assertThat(MeeshySegmentedLaw.currentIndex(selection = 2, ids = listOf(1, 2))).isEqualTo(1)
    }

    // endregion

    // region Les tons, sur les jetons

    @Test
    fun `l'encre du courant sur la pastille tient le contraste de 15,99`() {
        val palette = MeeshySegmentedPalette.of(tone = MeeshySegmentedTone.Media, isDark = true)

        assertThat(contrast(palette.currentInk, palette.pill)).isAtLeast(15.98)
    }

    @Test
    fun `le ton theme inverse la pastille a l'encre du texte, clair comme sombre`() {
        listOf(false, true).forEach { isDark ->
            val palette = MeeshySegmentedPalette.of(tone = MeeshySegmentedTone.Theme, isDark = isDark)

            assertThat(palette.pill).isEqualTo(MeeshyAdaptiveColors.textPrimary(isDark))
            assertThat(palette.currentInk).isEqualTo(MeeshyAdaptiveColors.backgroundPrimary(isDark))
        }
    }

    @Test
    fun `le ton media ne suit pas le theme, et tient AA sur la piste des panneaux opaques`() {
        val palette = MeeshySegmentedPalette.of(tone = MeeshySegmentedTone.Media, isDark = false)

        assertThat(palette).isEqualTo(MeeshySegmentedPalette.of(tone = MeeshySegmentedTone.Media, isDark = true))
        listOf(MeeshyAdaptiveColors.backgroundPrimary(true), MeeshyAdaptiveColors.backgroundSecondary(true)).forEach { panel ->
            val track = palette.track.compositeOver(panel)
            assertThat(contrast(palette.restInk, track)).isAtLeast(AA)
            assertThat(contrast(palette.pill, track)).isAtLeast(AA)
        }
    }

    @Test
    fun `le ton theme tient AA, en clair comme en sombre`() {
        listOf(false, true).forEach { isDark ->
            val palette = MeeshySegmentedPalette.of(tone = MeeshySegmentedTone.Theme, isDark = isDark)
            assertThat(contrast(palette.currentInk, palette.pill)).isAtLeast(AA)
            listOf(MeeshyAdaptiveColors.backgroundPrimary(isDark), MeeshyAdaptiveColors.backgroundSecondary(isDark)).forEach { panel ->
                val track = palette.track.compositeOver(panel)
                assertThat(contrast(palette.restInk, track)).isAtLeast(AA)
                assertThat(contrast(palette.pill, track)).isAtLeast(AA)
            }
        }
    }

    @Test
    fun `reduire les animations pose la pastille, sans glissement`() {
        assertThat(meeshySegmentedPillMotion(reduceMotion = true)).isInstanceOf(SnapSpec::class.java)
        assertThat(meeshySegmentedPillMotion(reduceMotion = false)).isNotInstanceOf(SnapSpec::class.java)
    }

    private fun contrast(a: Color, b: Color): Double {
        val (light, dark) = listOf(a.relativeLuminance(), b.relativeLuminance()).sortedDescending()
        return (light + 0.05) / (dark + 0.05)
    }

    private fun Color.relativeLuminance(): Double {
        fun channel(value: Float): Double {
            val c = value.toDouble()
            return if (c <= 0.03928) c / 12.92 else Math.pow((c + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
    }

    // endregion

    // region Le comportement rendu

    private fun show(
        options: List<MeeshySegmentedOption<String>> = listOf(
            MeeshySegmentedOption("a", "Ajuster"),
            MeeshySegmentedOption("b", "Remplir", contentDescription = "Remplir l'écran"),
        ),
        selected: String = "a",
        enabled: Boolean = true,
        role: MeeshySegmentedRole = MeeshySegmentedRole.Choice,
        onSelect: (String) -> Unit = {},
        recorder: Recorder = Recorder(),
    ) {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                MeeshySegmented(
                    label = GROUP_LABEL,
                    selected = selected,
                    onSelect = onSelect,
                    options = options,
                    role = role,
                    enabled = enabled,
                    haptics = MeeshyHaptics(HapticSurfacing(recorder, 35)),
                    modifier = Modifier.testTag(TRACK_TAG),
                )
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `toucher un segment non courant le choisit, joue un haptique et rappelle une fois`() {
        val picked = mutableListOf<String>()
        val recorder = Recorder()
        show(onSelect = { picked += it }, recorder = recorder)

        compose.onNodeWithContentDescription("Remplir l'écran").performClick()

        assertThat(picked).containsExactly("b")
        assertThat(recorder.received).hasSize(1)
    }

    @Test
    fun `toucher le segment courant ne rappelle ni ne joue rien`() {
        val picked = mutableListOf<String>()
        val recorder = Recorder()
        show(onSelect = { picked += it }, recorder = recorder)

        compose.onNodeWithContentDescription("Ajuster").performClick()

        assertThat(picked).isEmpty()
        assertThat(recorder.received).isEmpty()
    }

    @Test
    fun `un controle desactive ne rappelle ni n'joue rien`() {
        val picked = mutableListOf<String>()
        val recorder = Recorder()
        show(enabled = false, onSelect = { picked += it }, recorder = recorder)

        compose.onNodeWithContentDescription("Remplir l'écran").assertIsNotEnabled().performClick()

        assertThat(picked).isEmpty()
        assertThat(recorder.received).isEmpty()
    }

    @Test
    fun `le nom accessible prime sur le titre, le courant est selectionne, le role suit role`() {
        show(role = MeeshySegmentedRole.Tabs)

        compose.onNodeWithContentDescription("Remplir l'écran")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Tab))
        compose.onNodeWithContentDescription("Ajuster").assertIsSelected()
    }

    @Test
    fun `la largeur du controle ne change pas quand la selection bouge`() {
        var selected by mutableStateOf("a")
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                MeeshySegmented(
                    label = GROUP_LABEL,
                    selected = selected,
                    onSelect = { selected = it },
                    options = listOf(MeeshySegmentedOption("a", "Ajuster"), MeeshySegmentedOption("b", "Remplir")),
                    haptics = MeeshyHaptics(HapticSurfacing(Recorder(), 35)),
                    modifier = Modifier.testTag(TRACK_TAG),
                )
            }
        }
        compose.waitForIdle()
        val before = compose.onNodeWithTag(TRACK_TAG).fetchSemanticsNode().size.width

        compose.onNodeWithContentDescription("Remplir").performClick()
        compose.waitForIdle()
        val after = compose.onNodeWithTag(TRACK_TAG).fetchSemanticsNode().size.width

        assertThat(after).isEqualTo(before)
    }

    @Test
    fun `moins de deux options ne rend rien, pas meme la piste`() {
        show(options = listOf(MeeshySegmentedOption("a", "Seul")))

        compose.onNodeWithTag(TRACK_TAG).assertDoesNotExist()
    }

    @Test
    fun `une selection absente des options ne montre aucun segment courant`() {
        show(selected = "z")

        compose.onAllNodes(isSelected()).assertCountEquals(0)
    }

    @Test
    fun `le groupe porte son nom, et chaque option est lue une seule fois`() {
        show()

        compose.onNodeWithContentDescription(GROUP_LABEL).assertExists()
        compose.onAllNodesWithContentDescription("Ajuster").assertCountEquals(1)
        compose.onAllNodes(isSelected()).assertCountEquals(1)
    }

    @Test
    fun `une piste de 44 dp au repos, et une cible de 48 dp`() {
        show()

        compose.onNodeWithContentDescription(GROUP_LABEL).assertHeightIsAtLeast(MeeshyControlSize.tapTarget)
        compose.onNodeWithTag(TRACK_TAG).assertHeightIsAtLeast(MeeshyControlSize.minTouchTarget)
    }

    @Test
    fun `trop etroit pour une rangee, le choix se replie en rangees sans deborder`() {
        val titles = listOf("Fin", "Normal", "Semi-gras", "Gras")
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                Column {
                    Specimen(label = ONE_ROW, titles = titles.take(2), width = 320.dp)
                    Specimen(label = FOLDED, titles = titles, width = 60.dp)
                }
            }
        }
        compose.waitForIdle()

        val oneRow = heightOf(ONE_ROW)
        val folded = heightOf(FOLDED)

        assertThat(folded.value).isGreaterThan((oneRow + MeeshyControlSize.regular - 1.dp).value)
        assertThat(widthOf(FOLDED).value).isAtMost(60f + 0.5f)
    }

    @Test
    fun `la fleche droite avance d'une option de gauche a droite`() {
        assertThat(rightArrowFromMiddle(LayoutDirection.Ltr)).containsExactly("c")
    }

    @Test
    fun `en RTL la fleche droite recule, sur un segment du milieu`() {
        assertThat(rightArrowFromMiddle(LayoutDirection.Rtl)).containsExactly("a")
    }

    private fun rightArrowFromMiddle(direction: LayoutDirection): List<String> {
        val picked = mutableListOf<String>()
        val recorder = Recorder()
        compose.setContent {
            CompositionLocalProvider(LocalLayoutDirection provides direction) {
                MeeshyTheme(darkTheme = false) {
                    MeeshySegmented(
                        label = GROUP_LABEL,
                        selected = "b",
                        onSelect = { picked += it },
                        options = listOf(
                            MeeshySegmentedOption("a", "Sur la scène"),
                            MeeshySegmentedOption("b", "Fond"),
                            MeeshySegmentedOption("c", "Pièce"),
                        ),
                        haptics = MeeshyHaptics(HapticSurfacing(recorder, 35)),
                    )
                }
            }
        }
        val track = compose.onNodeWithContentDescription(GROUP_LABEL)
        track.performSemanticsAction(SemanticsActions.RequestFocus)
        track.performKeyPress(KeyEvent(NativeKeyEvent(NativeKeyEvent.ACTION_DOWN, NativeKeyEvent.KEYCODE_DPAD_RIGHT)))
        compose.waitForIdle()
        assertThat(recorder.received).hasSize(picked.size)
        return picked
    }

    @Composable
    private fun Specimen(label: String, titles: List<String>, width: Dp) {
        MeeshySegmented(
            label = label,
            selected = 0,
            onSelect = {},
            options = titles.mapIndexed { index, title -> MeeshySegmentedOption(index, title) },
            haptics = MeeshyHaptics(HapticSurfacing(Recorder(), 35)),
            modifier = Modifier.width(width),
        )
    }

    private fun heightOf(label: String): Dp =
        with(compose.density) { compose.onNodeWithContentDescription(label).fetchSemanticsNode().size.height.toDp() }

    private fun widthOf(label: String): Dp =
        with(compose.density) { compose.onNodeWithContentDescription(label).fetchSemanticsNode().size.width.toDp() }

    // endregion

    private companion object {
        const val TRACK_TAG = "meeshy-segmented-track"
        const val GROUP_LABEL = "Ajustement"
        const val ONE_ROW = "Une rangée"
        const val FOLDED = "Repliée"
        const val AA = 4.5
    }
}
