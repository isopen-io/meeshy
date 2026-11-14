package me.meeshy.ui.component.kit

import androidx.compose.ui.semantics.Role
import androidx.compose.ui.test.assertIsNotEnabled
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
import kotlinx.serialization.json.JsonArray
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
        val palette = MeeshySegmentedPalette(tone = MeeshySegmentedTone.Media, isDark = true)

        assertThat(contrast(palette.currentInk, palette.pill)).isAtLeast(15.98)
    }

    @Test
    fun `le ton theme inverse la pastille a l'encre du texte, clair comme sombre`() {
        listOf(false, true).forEach { isDark ->
            val palette = MeeshySegmentedPalette(tone = MeeshySegmentedTone.Theme, isDark = isDark)

            assertThat(palette.pill).isEqualTo(MeeshyAdaptiveColors.textPrimary(isDark))
            assertThat(palette.currentInk).isEqualTo(MeeshyAdaptiveColors.backgroundPrimary(isDark))
        }
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
                    label = "Ajustement",
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
                    label = "Ajustement",
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

    // endregion

    private companion object {
        const val TRACK_TAG = "meeshy-segmented-track"
    }
}
