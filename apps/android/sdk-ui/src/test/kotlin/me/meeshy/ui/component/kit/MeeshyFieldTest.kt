package me.meeshy.ui.component.kit

import android.content.res.Configuration
import android.content.res.Resources
import androidx.compose.animation.core.SnapSpec
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.text.AnnotatedString
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import java.util.Locale
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
import me.meeshy.ui.accessibility.AccessibilityAnnouncer
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
 * K08 — le champ de feuille : sa recette et sa loi du plafond lues sur les vecteurs partagés
 * (`docs/product/kit/K08-MeeshyField.vectors.json`), ses mots en fr, en et ar, et son comportement rendu (frappe, coupe,
 * commit, croix, roue, compteur, pas, cible, désactivé). Miroir de `MeeshyFieldTests` (iOS).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyFieldTest {

    @get:Rule
    val compose = createComposeRule()

    private class Recorder : HapticSink {
        val received = mutableListOf<Int>()
        override fun perform(feedbackConstant: Int) {
            received += feedbackConstant
        }
    }

    private class Spoken {
        val said = mutableListOf<String>()
        val announcer = AccessibilityAnnouncer(isScreenReaderActive = { true }, sink = { text, _ -> said += text })
    }

    // region Les vecteurs

    private fun vectors(): JsonObject {
        val file = generateSequence(File("").absoluteFile) { it.parentFile }
            .map { File(it, "docs/product/kit/K08-MeeshyField.vectors.json") }
            .first { it.exists() }
        return Json.parseToJsonElement(file.readText()).jsonObject
    }

    private fun JsonObject.rowsOf(key: String): List<JsonObject> = getValue(key).jsonArray.map { it.jsonObject }
    private fun JsonObject.text(key: String): String = getValue(key).jsonPrimitive.content
    private fun JsonObject.textOrNull(key: String): String? = getValue(key).takeUnless { it is JsonNull }?.jsonPrimitive?.content
    private fun JsonObject.int(key: String): Int = getValue(key).jsonPrimitive.int
    private fun JsonObject.intOrNull(key: String): Int? = getValue(key).takeUnless { it is JsonNull }?.jsonPrimitive?.int
    private fun JsonObject.bool(key: String): Boolean = getValue(key).jsonPrimitive.content == "true"
    private fun JsonObject.double(key: String): Double = getValue(key).jsonPrimitive.double

    private fun inputOf(wire: String): MeeshyFieldInput = MeeshyFieldInput.entries.single { it.name.equals(wire, ignoreCase = true) }
    private fun toneOf(wire: String?): MeeshyGlassTone? = wire?.let { w -> MeeshyGlassTone.entries.single { it.name.equals(w, ignoreCase = true) } }
    private fun placementOf(wire: String): MeeshyFieldCounterPlacement =
        MeeshyFieldCounterPlacement.entries.single { it.name.equals(wire, ignoreCase = true) }

    private fun recipe(
        input: MeeshyFieldInput,
        hasCaption: Boolean = false,
        tone: MeeshyGlassTone? = null,
        isEnabled: Boolean = true,
        increasedContrast: Boolean = false,
    ): MeeshyFieldRecipe = MeeshyFieldRecipe.resolve(input, hasCaption, tone, isEnabled, increasedContrast)

    @Test
    fun `chaque saisie rend la table des vecteurs - clavier, Retour, correction, majuscule, lignes et mesures`() {
        vectors().rowsOf("inputs").forEach { row ->
            val input = inputOf(row.text("input"))
            val resolved = recipe(input, hasCaption = true)
            val lines = row.getValue("lines").jsonArray
            assertThat(resolved.keyboard.name.lowercase()).isEqualTo(row.text("keyboard").lowercase())
            assertThat(resolved.returnKey.name.lowercase()).isEqualTo(row.text("returnKey").lowercase())
            assertThat(resolved.autocorrects).isEqualTo(row.bool("autocorrects"))
            assertThat(resolved.capitalization.name.lowercase()).isEqualTo(row.text("capitalization").lowercase())
            assertThat(resolved.offersClear).isEqualTo(row.bool("offersClear"))
            assertThat(resolved.lineRange).isEqualTo(lines[0].jsonPrimitive.int..lines[1].jsonPrimitive.int)
            val padding = row.getValue("padding").jsonObject
            assertThat(resolved.verticalPadding.value).isEqualTo(padding.int("vertical").toFloat())
            assertThat(resolved.horizontalPadding.value).isEqualTo(padding.int("horizontal").toFloat())
            assertThat(resolved.valueSize.value).isEqualTo(row.int("valueSize").toFloat())
            assertThat(resolved.valueIsBold).isEqualTo(row.bool("valueBold"))
            assertThat(resolved.captionSpacing.value).isEqualTo(row.int("captionSpacing").toFloat())
            assertThat(recipe(input, hasCaption = false).captionSpacing.value).isEqualTo(0f)
        }
    }

    @Test
    fun `la boite tient la cible Android et le paragraphe ses 110`() {
        val target = vectors().getValue("tapTarget").jsonObject.int("android").toFloat()
        val paragraph = vectors().getValue("geometry").jsonObject.int("paragraphMinimumHeight").toFloat()
        MeeshyFieldInput.entries.filter { it != MeeshyFieldInput.Paragraph }.forEach {
            assertThat(recipe(it).minimumHeight.value).isEqualTo(target)
        }
        assertThat(recipe(MeeshyFieldInput.Paragraph).minimumHeight.value).isEqualTo(paragraph)
    }

    @Test
    fun `les opacites viennent des vecteurs - fond, attenue, filet, desactive`() {
        val opacity = vectors().getValue("opacity").jsonObject
        assertThat(recipe(MeeshyFieldInput.Token).fillAlpha.toDouble()).isWithin(1e-6).of(opacity.double("fill"))
        assertThat(MeeshyFieldRecipe.MUTED_ALPHA.toDouble()).isWithin(1e-6).of(opacity.double("muted"))
        assertThat(recipe(MeeshyFieldInput.Token, increasedContrast = true).hairlineAlpha!!.toDouble())
            .isWithin(1e-6).of(opacity.double("hairlineEmphasis"))
        assertThat(recipe(MeeshyFieldInput.Token).hairlineAlpha).isNull()
        assertThat(recipe(MeeshyFieldInput.Token, isEnabled = false).contentAlpha.toDouble()).isWithin(1e-6).of(opacity.double("disabled"))
        assertThat(recipe(MeeshyFieldInput.Token).contentAlpha).isEqualTo(1f)
    }

    @Test
    fun `chaque ton donne l'encre des vecteurs`() {
        vectors().rowsOf("ink").forEach { row ->
            assertThat(MeeshyFieldRecipe.inkFor(toneOf(row.textOrNull("tone"))).name.lowercase()).isEqualTo(row.text("ink").lowercase())
        }
    }

    @Test
    fun `l'invite, la croix et le compteur n'existent que la ou les vecteurs les posent`() {
        vectors().rowsOf("prompt").forEach { row ->
            assertThat(MeeshyFieldRecipe.showsPrompt(row.text("text"), row.textOrNull("caption"))).isEqualTo(row.bool("shows"))
        }
        vectors().rowsOf("clear").forEach { row ->
            val shows = MeeshyFieldRecipe.showsClear(inputOf(row.text("input")), row.text("text"), row.bool("busy"), row.bool("enabled"))
            assertThat(shows).isEqualTo(row.bool("shows"))
        }
        vectors().rowsOf("counter").forEach { row ->
            val shows = MeeshyFieldRecipe.showsInlineCounter(row.intOrNull("limit"), row.text("text"), placementOf(row.text("placement")))
            assertThat(shows).isEqualTo(row.bool("shows"))
        }
    }

    @Test
    fun `le compte est en unites UTF-16 et la coupe tombe sur une frontiere de grapheme`() {
        vectors().rowsOf("count").forEach { row ->
            assertThat(MeeshyFieldLimit.count(row.text("text"))).isEqualTo(row.int("count"))
        }
        vectors().rowsOf("truncate").forEach { row ->
            val cut = MeeshyFieldLimit.truncate(row.text("text"), row.int("limit"))
            assertThat(cut).isEqualTo(row.text("result"))
            assertThat(MeeshyFieldLimit.count(cut)).isEqualTo(row.int("count"))
        }
    }

    @Test
    fun `l'alerte part a 80 pour cent et chaque franchissement montant se dit une fois`() {
        vectors().rowsOf("near").forEach { row ->
            assertThat(MeeshyFieldLimit.isNear(row.int("count"), row.int("limit"))).isEqualTo(row.bool("near"))
        }
        vectors().rowsOf("crossing").forEach { row ->
            val crossing = MeeshyFieldLimit.crossing(row.int("from"), row.int("to"), row.int("limit"))
            assertThat(crossing?.name?.lowercase()).isEqualTo(row.textOrNull("crossing"))
        }
    }

    @Test
    fun `le compteur s'ecrit et se dit comme les vecteurs en fr en et ar`() {
        vectors().rowsOf("counterText").forEach { row ->
            val written = MeeshyFieldWords.counter(row.int("count"), row.int("limit"), Locale.forLanguageTag(row.text("locale")))
            assertThat(written).isEqualTo(row.text("text"))
        }
        vectors().rowsOf("spoken").forEach { row ->
            val locale = Locale.forLanguageTag(row.text("locale"))
            val resources = resourcesFor(locale)
            val said = when (row.text("key")) {
                "count" -> MeeshyFieldWords.spokenCount(resources, row.int("count"), row.int("limit"), locale)
                "clear" -> MeeshyFieldWords.clear(resources)
                "limit_reached" -> MeeshyFieldWords.limitReached(resources)
                "busy" -> MeeshyFieldWords.busy(resources)
                else -> error("clé inconnue ${row.text("key")}")
            }
            assertThat(said).isEqualTo(row.text("said"))
        }
    }

    private fun resourcesFor(locale: Locale): Resources {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val configuration = Configuration(context.resources.configuration).apply { setLocale(locale) }
        return context.createConfigurationContext(configuration).resources
    }

    // endregion

    // region Le registre du brouillon

    @Test
    fun `une frappe au-dela du plafond est coupee et emise une fois - l'echo ne rappelle rien`() {
        val (ledger, edit) = MeeshyFieldLedger.of("abc").receive("abcdef", limit = 4)

        assertThat(edit).isEqualTo(MeeshyFieldEdit("abcd", wasTruncated = true, emits = true, crossing = MeeshyFieldLimitCrossing.Reached))
        assertThat(ledger.receive("abcd", limit = 4).second).isNull()
        assertThat(ledger.receive("abcde", limit = 4).second?.emits).isFalse()
    }

    @Test
    fun `un texte de l'hote remplace le brouillon sans etre un pas a valider, et le commit ne part qu'une fois`() {
        val (resynced, changed) = MeeshyFieldLedger.of("abc").resync("xyz")
        val (committed, first) = resynced.commit("xyzw")

        assertThat(changed).isTrue()
        assertThat(resynced.commit("xyz").second).isNull()
        assertThat(first).isEqualTo("xyzw")
        assertThat(committed.commit("xyzw").second).isNull()
        assertThat(MeeshyFieldLedger.of("abc").resync("abc").second).isFalse()
    }

    // endregion

    // region Le contraste et le mouvement

    @Test
    fun `sur la feuille sombre, texte, invite et alerte tiennent AA sur le fond du champ`() {
        val sheet = MeeshyAdaptiveColors.backgroundPrimary(isDark = true)
        val resolved = recipe(MeeshyFieldInput.Sentence)
        val ink = resolved.inkColor(isDark = true)
        val fill = ink.copy(alpha = resolved.fillAlpha).compositeOver(sheet)

        assertThat(contrast(ink, fill)).isAtLeast(AA)
        assertThat(contrast(ink.copy(alpha = MeeshyFieldRecipe.MUTED_ALPHA).compositeOver(fill), fill)).isAtLeast(AA)
        assertThat(contrast(resolved.alertColor(isDark = true), fill)).isAtLeast(AA)
    }

    @Test
    fun `reduire les animations pose la croix, la roue et le compteur sans fondu`() {
        assertThat(meeshyFieldFade(reduceMotion = true)).isInstanceOf(SnapSpec::class.java)
        assertThat(meeshyFieldFade(reduceMotion = false)).isNotInstanceOf(SnapSpec::class.java)
    }

    @Test
    fun `aux tres grandes polices le compteur passe sous la saisie`() {
        assertThat(MeeshyFieldRecipe.stacksCounter(fontScale = 1f)).isFalse()
        assertThat(MeeshyFieldRecipe.stacksCounter(fontScale = 2f)).isTrue()
    }

    private fun contrast(a: Color, b: Color): Double {
        val (light, dark) = listOf(a.luminance(), b.luminance()).sortedDescending()
        return (light + 0.05) / (dark + 0.05)
    }

    private fun Color.luminance(): Double {
        fun channel(value: Float): Double {
            val c = value.toDouble()
            return if (c <= 0.03928) c / 12.92 else Math.pow((c + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
    }

    // endregion

    // region Le comportement rendu

    private fun show(content: @Composable () -> Unit) {
        compose.setContent { MeeshyTheme(darkTheme = true) { Column { content() } } }
        compose.waitForIdle()
    }

    private fun haptics(recorder: Recorder): MeeshyHaptics = MeeshyHaptics(HapticSurfacing(recorder, 35))

    private val resources: Resources get() = ApplicationProvider.getApplicationContext<android.content.Context>().resources
    private val clearLabel: String get() = MeeshyFieldWords.clear(resources)

    @Test
    fun `chaque frappe rappelle l'hote, et au-dela du plafond la coupe annonce, previent et vibre une fois`() {
        val changes = mutableListOf<String>()
        var reached = 0
        val recorder = Recorder()
        val spoken = Spoken()
        show {
            var text by remember { mutableStateOf("") }
            MeeshyField(
                label = LABEL, text = text, onChange = { text = it; changes += it }, limit = 5,
                onLimitReached = { reached += 1 }, haptics = haptics(recorder), announcer = spoken.announcer,
            )
        }

        compose.onNodeWithContentDescription(LABEL).performTextInput("ab")
        compose.onNodeWithContentDescription(LABEL).performTextReplacement("abcdefgh")
        compose.waitForIdle()

        assertThat(changes).containsExactly("ab", "abcde").inOrder()
        assertThat(reached).isEqualTo(1)
        assertThat(recorder.received).hasSize(1)
        assertThat(spoken.said).containsExactly(MeeshyFieldWords.limitReached(resources))
        compose.onNodeWithContentDescription(LABEL).assert(editableText("abcde"))
    }

    @Test
    fun `Retour valide une fois par valeur changee, jamais sans changement`() {
        val commits = mutableListOf<String>()
        val submits = mutableListOf<String>()
        show {
            var text by remember { mutableStateOf("") }
            MeeshyField(
                label = LABEL, text = text, onChange = { text = it },
                onSubmit = { submits += it }, onCommit = { commits += it },
            )
        }

        compose.onNodeWithContentDescription(LABEL).performTextInput("salut")
        compose.onNodeWithContentDescription(LABEL).performImeAction()
        compose.onNodeWithContentDescription(LABEL).performImeAction()
        compose.waitForIdle()

        assertThat(submits).containsExactly("salut", "salut")
        assertThat(commits).containsExactly("salut")
    }

    @Test
    fun `un texte venu de l'hote remplace le brouillon`() {
        var host by mutableStateOf("avant")
        show { MeeshyField(label = LABEL, text = host, onChange = { host = it }) }

        host = "après"
        compose.waitForIdle()

        compose.onNodeWithContentDescription(LABEL).assert(editableText("après"))
    }

    @Test
    fun `la croix vide le texte, garde le focus et vibre une fois`() {
        val changes = mutableListOf<String>()
        val recorder = Recorder()
        show {
            var text by remember { mutableStateOf("Ngor") }
            MeeshyField(
                label = LABEL, text = text, onChange = { text = it; changes += it },
                input = MeeshyFieldInput.Search, haptics = haptics(recorder),
            )
        }

        compose.onNodeWithContentDescription(clearLabel).performClick()
        compose.waitForIdle()

        assertThat(changes).containsExactly("")
        assertThat(recorder.received).hasSize(1)
        compose.onNodeWithContentDescription(LABEL).assertIsFocused()
        compose.onAllNodesWithContentDescription(clearLabel).assertCountEquals(0)
    }

    @Test
    fun `avec haptic None la croix ne vibre pas`() {
        val recorder = Recorder()
        show {
            var text by remember { mutableStateOf("Ngor") }
            MeeshyField(
                label = LABEL, text = text, onChange = { text = it }, input = MeeshyFieldInput.Search,
                haptic = MeeshyFieldHaptic.None, haptics = haptics(recorder),
            )
        }

        compose.onNodeWithContentDescription(clearLabel).performClick()

        assertThat(recorder.received).isEmpty()
    }

    @Test
    fun `pas de croix sur un champ vide ni hors recherche, la roue la remplace quand l'hote est occupe`() {
        show {
            MeeshyField(label = LABEL, text = "", onChange = {}, input = MeeshyFieldInput.Search)
            MeeshyField(label = OTHER, text = "texte", onChange = {}, input = MeeshyFieldInput.Sentence)
            MeeshyField(label = BUSY, text = "Ngor", onChange = {}, input = MeeshyFieldInput.Search, isBusy = true)
        }

        compose.onAllNodesWithContentDescription(clearLabel).assertCountEquals(0)
        compose.onAllNodesWithContentDescription(MeeshyFieldWords.busy(resources)).assertCountEquals(1)
    }

    @Test
    fun `l'invite n'existe que champ vide, et jamais avec une legende`() {
        show {
            MeeshyField(label = LABEL, text = "", onChange = {}, prompt = PROMPT)
            MeeshyField(label = OTHER, text = "", onChange = {}, prompt = PROMPT, caption = CAPTION)
        }

        compose.onAllNodesWithText(PROMPT, useUnmergedTree = true).assertCountEquals(1)
    }

    @Test
    fun `la legende est l'indication du champ, jamais un noeud a part`() {
        show { MeeshyField(label = LABEL, text = "", onChange = {}, caption = CAPTION, input = MeeshyFieldInput.Paragraph) }

        compose.onNodeWithContentDescription(LABEL).assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, CAPTION))
        compose.onAllNodesWithText(CAPTION).assertCountEquals(0)
    }

    @Test
    fun `le compteur en ligne se dit en phrase, et en Hosted le champ n'en pose aucun`() {
        val spokenCount = MeeshyFieldWords.spokenCount(resources, 17, 60, Locale.getDefault())
        show {
            MeeshyField(label = LABEL, text = "Enfin en vacances", onChange = {}, limit = 60)
            MeeshyField(label = OTHER, text = "Enfin en vacances", onChange = {}, limit = 60, counter = MeeshyFieldCounterPlacement.Hosted)
        }

        compose.onAllNodesWithContentDescription(spokenCount).assertCountEquals(1)
    }

    @Test
    fun `le compteur pose par l'hote se dit comme celui du champ`() {
        val spokenCount = MeeshyFieldWords.spokenCount(resources, 86, 1000, Locale.getDefault())
        show { MeeshyFieldCounter(count = 86, limit = 1000) }

        compose.onAllNodesWithContentDescription(spokenCount).assertCountEquals(1)
    }

    @Test
    fun `un champ numerique expose ses pas a l'accessibilite`() {
        val steps = mutableListOf<Int>()
        show {
            MeeshyField(label = LABEL, text = "0:02", onChange = {}, input = MeeshyFieldInput.Numeric, caption = CAPTION, onStep = { steps += it })
        }

        val actions = compose.onNodeWithContentDescription(LABEL).fetchSemanticsNode().config.getOrNull(SemanticsActions.CustomActions)
        assertThat(actions).hasSize(2)
        actions!!.forEach { it.action() }
        assertThat(steps).containsExactly(1, -1).inOrder()
    }

    @Test
    fun `la boite et la croix tiennent 48 dp, et un champ desactive ne se saisit pas`() {
        show {
            MeeshyField(label = LABEL, text = "Ngor", onChange = {}, input = MeeshyFieldInput.Search, modifier = Modifier.testTag(BOX))
            MeeshyField(label = OTHER, text = "", onChange = {}, enabled = false)
        }

        compose.onNodeWithTag(BOX).assertHeightIsAtLeast(MeeshyControlSize.minTouchTarget)
        compose.onNodeWithContentDescription(clearLabel)
            .assertHeightIsAtLeast(MeeshyControlSize.minTouchTarget)
            .assertWidthIsAtLeast(MeeshyControlSize.minTouchTarget)
        compose.onNodeWithContentDescription(OTHER).assertIsNotEnabled()
    }

    private fun editableText(expected: String): SemanticsMatcher =
        SemanticsMatcher.expectValue(SemanticsProperties.EditableText, AnnotatedString(expected))

    // endregion

    // region La garde de source

    @Test
    fun `les sources de K08 ne portent ni verre, ni couleur, ni mesure, ni singleton en dur`() {
        val folder = generateSequence(File("").absoluteFile) { it.parentFile }
            .map { File(it, "apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/kit") }
            .first { it.exists() }
        val sources = listOf("MeeshyField.kt", "MeeshyFieldLimit.kt", "MeeshyFieldRecipe.kt").associateWith { File(folder, it).readText() }
        val forbidden = listOf("Color(0x", "MeeshyGlassSurface", "meeshyGlass", "ThemeManager", "OutlinedTextField")
        sources.forEach { (name, source) ->
            forbidden.forEach { assertWithMessage("$name contient $it").that(source).doesNotContain(it) }
        }
        assertThat(Regex("""\b\d+(\.\d+)?\.(sp|dp)\b""").containsMatchIn(sources.getValue("MeeshyField.kt"))).isFalse()
    }

    // endregion

    private companion object {
        const val AA = 4.5
        const val LABEL = "Humeur"
        const val OTHER = "Autre"
        const val BUSY = "Occupé"
        const val PROMPT = "Une phrase courte"
        const val CAPTION = "Début"
        const val BOX = "boite"
    }
}
