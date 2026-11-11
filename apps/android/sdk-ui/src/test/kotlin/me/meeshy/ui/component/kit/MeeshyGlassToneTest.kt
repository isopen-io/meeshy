package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import kotlin.math.pow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.float
import kotlinx.serialization.json.floatOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.model.chrome.GlassRendering
import me.meeshy.sdk.model.theme.CanvasChromeScheme
import me.meeshy.ui.component.chrome.GlassSurfaceValues
import me.meeshy.ui.component.chrome.LiquidGlassRecipe
import org.junit.Test

/**
 * K01 — le verre du kit, lu comme des VALEURS : un composable ne s'inspecte pas, sa recette si. Chaque témoin interroge
 * la loi du ton, le choix de la matière ou la recette, jamais un rendu. Miroir de `MeeshyGlassToneTests` (iOS), et même
 * fichier de vecteurs de parité (`docs/product/kit/K01-MeeshyGlassTone.vectors.json`).
 *
 * Écart assumé avec iOS : Android n'a pas de Liquid Glass du système, donc pas de matière `liquid`, et le ton `theme`
 * garde le dessin de `MeeshyGlassSurface` tel quel (ombre comprise, y compris en opaque) — la fiche demande un rendu de
 * repos identique avant et après.
 */
class MeeshyGlassToneTest {

    // region La loi du ton

    @Test
    fun `un temoin de chaque cote de chaque seuil`() {
        assertThat(MeeshyGlassTone.resolve(0.117f)).isEqualTo(MeeshyGlassTone.Plain)
        assertThat(MeeshyGlassTone.resolve(0.119f)).isEqualTo(MeeshyGlassTone.Deep)
        assertThat(MeeshyGlassTone.resolve(0.612f)).isEqualTo(MeeshyGlassTone.Deep)
        assertThat(MeeshyGlassTone.resolve(0.614f)).isEqualTo(MeeshyGlassTone.OnLight)
    }

    @Test
    fun `luminance inconnue donne deep quel que soit le ton precedent`() {
        listOf(null, *MeeshyGlassTone.entries.toTypedArray()).forEach { previous ->
            assertThat(MeeshyGlassTone.resolve(null, previous)).isEqualTo(MeeshyGlassTone.Deep)
        }
    }

    @Test
    fun `pas de bascule dans l'hysteresis, bascule au-dela`() {
        assertThat(MeeshyGlassTone.resolve(0.14f, MeeshyGlassTone.Plain)).isEqualTo(MeeshyGlassTone.Plain)
        assertThat(MeeshyGlassTone.resolve(0.16f, MeeshyGlassTone.Plain)).isEqualTo(MeeshyGlassTone.Deep)
        assertThat(MeeshyGlassTone.resolve(0.10f, MeeshyGlassTone.Deep)).isEqualTo(MeeshyGlassTone.Deep)
        assertThat(MeeshyGlassTone.resolve(0.08f, MeeshyGlassTone.Deep)).isEqualTo(MeeshyGlassTone.Plain)
        assertThat(MeeshyGlassTone.resolve(0.63f, MeeshyGlassTone.Deep)).isEqualTo(MeeshyGlassTone.Deep)
        assertThat(MeeshyGlassTone.resolve(0.65f, MeeshyGlassTone.Deep)).isEqualTo(MeeshyGlassTone.OnLight)
        assertThat(MeeshyGlassTone.resolve(0.59f, MeeshyGlassTone.OnLight)).isEqualTo(MeeshyGlassTone.OnLight)
        assertThat(MeeshyGlassTone.resolve(0.57f, MeeshyGlassTone.OnLight)).isEqualTo(MeeshyGlassTone.Deep)
    }

    @Test
    fun `le ton theme n'est jamais tenu - il n'a pas de seuil`() {
        assertThat(MeeshyGlassTone.resolve(0.05f, MeeshyGlassTone.Theme)).isEqualTo(MeeshyGlassTone.Plain)
        assertThat(MeeshyGlassTone.resolve(0.9f, MeeshyGlassTone.Theme)).isEqualTo(MeeshyGlassTone.OnLight)
    }

    // endregion

    // region La matiere

    @Test
    fun `reduire la transparence donne opaque pour un verre de ton, et le dessin reste dessine sinon`() {
        listOf(MeeshyGlassTone.Plain, MeeshyGlassTone.Deep, MeeshyGlassTone.OnLight).forEach { tone ->
            assertThat(material(tone, GlassRendering.Blurred, reduceTransparency = true)).isEqualTo(MeeshyGlassMaterial.Opaque)
            assertThat(material(tone, GlassRendering.Blurred, reduceTransparency = false)).isEqualTo(MeeshyGlassMaterial.Drawn)
            assertThat(material(tone, GlassRendering.Translucent, reduceTransparency = false)).isEqualTo(MeeshyGlassMaterial.Drawn)
        }
    }

    @Test
    fun `avant l'API 31 un verre de ton reste dessine - seul le flou manque`() {
        assertThat(material(MeeshyGlassTone.Deep, GlassRendering.Opaque, reduceTransparency = false)).isEqualTo(MeeshyGlassMaterial.Drawn)
    }

    @Test
    fun `le ton theme garde la regle de MeeshyGlassSurface - opaque quand le rendu l'est`() {
        assertThat(material(MeeshyGlassTone.Theme, GlassRendering.Opaque, reduceTransparency = false)).isEqualTo(MeeshyGlassMaterial.Opaque)
        assertThat(material(MeeshyGlassTone.Theme, GlassRendering.Blurred, reduceTransparency = false)).isEqualTo(MeeshyGlassMaterial.Drawn)
        assertThat(material(MeeshyGlassTone.Theme, GlassRendering.Translucent, reduceTransparency = false)).isEqualTo(MeeshyGlassMaterial.Drawn)
    }

    @Test
    fun `aucun parametre public de MeeshyGlass ne force la matiere`() {
        val source = File(kitSources(), "MeeshyGlass.kt").readText()
        val start = source.indexOf("public fun MeeshyGlass(")
        assertWithMessage("MeeshyGlass public introuvable").that(start).isAtLeast(0)
        val signature = source.substring(start, source.indexOf("content:", start)).lowercase()
        assertThat(signature).doesNotContain("material")
        assertThat(signature).doesNotContain("drawn")
        assertThat(signature).doesNotContain("rendering")
    }

    // endregion

    // region La recette de repos et pressee

    @Test
    fun `une surface qui se touche - repos different de presse, en verre dessine`() {
        MeeshyGlassTone.entries.forEach { tone ->
            val rest = recipe(tone, interactive = true, pressed = false)
            val pressed = recipe(tone, interactive = true, pressed = true)
            assertThat(rest).isNotEqualTo(pressed)
            assertThat(rest.scale).isEqualTo(1f)
            assertThat(pressed.scale).isEqualTo(1.04f)
            assertThat(pressed.sheen + pressed.topLight).isGreaterThan(rest.sheen + rest.topLight)
        }
    }

    @Test
    fun `une surface qui ne se touche pas ne repond pas au toucher`() {
        MeeshyGlassTone.entries.forEach { tone ->
            assertThat(recipe(tone, interactive = false, pressed = true)).isEqualTo(recipe(tone, interactive = false, pressed = false))
        }
    }

    @Test
    fun `reduire les animations donne aucune echelle, le reflet repond encore`() {
        val pressed = recipe(MeeshyGlassTone.Deep, interactive = true, pressed = true, reduceMotion = true)
        assertThat(pressed.scale).isEqualTo(1f)
        assertThat(pressed).isNotEqualTo(recipe(MeeshyGlassTone.Deep, interactive = true, pressed = false, reduceMotion = true))
    }

    @Test
    fun `opaque - ni flou, ni reflet, ni ombre pour un verre de ton ; la surface pleine repond par l'echelle`() {
        listOf(MeeshyGlassTone.Plain, MeeshyGlassTone.Deep, MeeshyGlassTone.OnLight).forEach { tone ->
            val rest = recipe(tone, interactive = true, material = MeeshyGlassMaterial.Opaque)
            val pressed = recipe(tone, interactive = true, pressed = true, material = MeeshyGlassMaterial.Opaque)
            assertThat(rest.blursBackdrop).isFalse()
            assertThat(rest.sheen).isEqualTo(0f)
            assertThat(rest.topLight).isEqualTo(0f)
            assertThat(rest.shadowOpacity).isEqualTo(0f)
            assertThat(rest.fillOpacity).isEqualTo(1f)
            assertThat(pressed.sheen).isEqualTo(0f)
            assertThat(pressed.topLight).isEqualTo(0f)
            assertThat(pressed.scale).isEqualTo(1.04f)
        }
    }

    @Test
    fun `survol au pointeur - reflet intermediaire, sans echelle, en verre dessine seulement`() {
        val rest = recipe(MeeshyGlassTone.Deep, interactive = true)
        val hovered = recipe(MeeshyGlassTone.Deep, interactive = true, hovered = true)
        val pressed = recipe(MeeshyGlassTone.Deep, interactive = true, pressed = true)
        assertThat(hovered.scale).isEqualTo(1f)
        assertThat(hovered.topLight).isGreaterThan(rest.topLight)
        assertThat(hovered.topLight).isLessThan(pressed.topLight)
        assertThat(recipe(MeeshyGlassTone.Deep, interactive = false, hovered = true)).isEqualTo(recipe(MeeshyGlassTone.Deep))
        assertThat(recipe(MeeshyGlassTone.Deep, interactive = true, material = MeeshyGlassMaterial.Opaque, hovered = true))
            .isEqualTo(recipe(MeeshyGlassTone.Deep, interactive = true, material = MeeshyGlassMaterial.Opaque))
    }

    @Test
    fun `le survol est a mi-chemin de l'appui - c'est ce qui permet une seule valeur animee`() {
        val rest = recipe(MeeshyGlassTone.Deep, interactive = true)
        val hovered = recipe(MeeshyGlassTone.Deep, interactive = true, hovered = true)
        val pressed = recipe(MeeshyGlassTone.Deep, interactive = true, pressed = true)
        assertThat(hovered.topLight).isWithin(EPSILON).of((rest.topLight + pressed.topLight) / 2)
        assertThat(hovered.sheen).isWithin(EPSILON).of((rest.sheen + pressed.sheen) / 2)
    }

    @Test
    fun `le ton change par un fondu de 200 ms`() {
        val milliseconds = vector("recipe").getValue("toneFadeMs").jsonPrimitive.float
        assertThat(MeeshyGlassRecipe.TONE_FADE_MILLIS.toFloat()).isEqualTo(milliseconds)
    }

    // endregion

    // region Jamais de verre sur du verre

    @Test
    fun `posee dans un verre dessine - aucune seconde matiere, la reponse au toucher gardee`() {
        listOf(MeeshyGlassTone.Plain, MeeshyGlassTone.Deep, MeeshyGlassTone.OnLight).forEach { tone ->
            listOf(MeeshyGlassMaterial.Drawn, MeeshyGlassMaterial.Opaque).forEach { material ->
                val rest = recipe(tone, interactive = true, material = material, nested = true)
                val pressed = recipe(tone, interactive = true, pressed = true, material = material, nested = true)
                assertThat(rest.blursBackdrop).isFalse()
                assertThat(rest.fillOpacity).isEqualTo(0f)
                assertThat(rest.sheen).isEqualTo(0f)
                assertThat(rest.topLight).isEqualTo(0f)
                assertThat(rest.rimLit).isEqualTo(0f)
                assertThat(rest.shadowOpacity).isEqualTo(0f)
                assertThat(pressed.scale).isEqualTo(1.04f)
            }
        }
    }

    @Test
    fun `une surface imbriquee garde sa teinte`() {
        val nested = recipe(MeeshyGlassTone.Deep, tinted = true, nested = true)
        assertThat(nested.tintWash).isGreaterThan(0f)
    }

    @Test
    fun `le ton theme des sites existants ne change pas une fois imbrique`() {
        assertThat(recipe(MeeshyGlassTone.Theme, nested = true)).isEqualTo(recipe(MeeshyGlassTone.Theme))
    }

    @Test
    fun `un seul flou par surface, jamais en verre opaque`() {
        MeeshyGlassTone.entries.forEach { tone ->
            assertThat(recipe(tone, material = MeeshyGlassMaterial.Drawn).blursBackdrop).isTrue()
            if (tone != MeeshyGlassTone.Theme) {
                assertThat(recipe(tone, material = MeeshyGlassMaterial.Opaque).blursBackdrop).isFalse()
            }
        }
    }

    // endregion

    // region Non-regression du ton theme

    @Test
    fun `le ton theme redonne les valeurs de MeeshyGlassSurface et de LiquidGlassRecipe`() {
        listOf(false, true).forEach { isDark ->
            listOf(false, true).forEach { isTinted ->
                val legacy = LiquidGlassRecipe.resolve(isDark = isDark, isTinted = isTinted)
                val resolved = recipe(MeeshyGlassTone.Theme, tinted = isTinted, dark = isDark)
                assertThat(resolved.tintWash).isEqualTo(legacy.tintWash)
                assertThat(resolved.sheen).isEqualTo(legacy.sheen)
                assertThat(resolved.rimLit).isEqualTo(legacy.rimLit)
                assertThat(resolved.rimShade).isEqualTo(legacy.rimShade)
                assertThat(resolved.rimTail).isEqualTo(legacy.rimLit * 0.5f)
                assertThat(resolved.fill).isEqualTo(MeeshyGlassFill.System)
                assertThat(resolved.fillOpacity)
                    .isEqualTo(if (isDark) GlassSurfaceValues.FILL_ALPHA_DARK else GlassSurfaceValues.FILL_ALPHA_LIGHT)
                assertThat(resolved.blurRadiusDp).isEqualTo(GlassSurfaceValues.BLUR_RADIUS_DP)
                assertThat(resolved.shadowOpacity).isEqualTo(GlassSurfaceValues.SHADOW_ALPHA)
                assertThat(resolved.shadowRadiusDp).isEqualTo(GlassSurfaceValues.SHADOW_RADIUS_DP)
                assertThat(resolved.shadowYDp).isEqualTo(GlassSurfaceValues.SHADOW_OFFSET_Y_DP)
                assertThat(resolved.topLight).isEqualTo(0f)
                assertThat(resolved.scale).isEqualTo(1f)
            }
        }
    }

    @Test
    fun `le ton theme opaque garde le fond plein et le voile indigo de MeeshyGlassSurface`() {
        val resolved = recipe(MeeshyGlassTone.Theme, material = MeeshyGlassMaterial.Opaque)
        assertThat(resolved.fillOpacity).isEqualTo(1f)
        assertThat(resolved.tintWash).isEqualTo(GlassSurfaceValues.OPAQUE_TINT_ALPHA)
        assertThat(resolved.shadowOpacity).isEqualTo(GlassSurfaceValues.SHADOW_ALPHA)
    }

    // endregion

    // region Le contraste, calcule depuis la recette

    @Test
    fun `encre blanche au moins 4,5 pour 1 sur dense et onLight, contre le pire fond`() {
        assertThat(worstContrast(MeeshyGlassTone.Deep, MeeshyGlassDensity.Dense)).isAtLeast(4.5)
        assertThat(worstContrast(MeeshyGlassTone.OnLight, MeeshyGlassDensity.Regular)).isAtLeast(4.5)
        assertThat(worstContrast(MeeshyGlassTone.OnLight, MeeshyGlassDensity.Dense)).isAtLeast(4.5)
    }

    @Test
    fun `glyphe blanc au moins 3 pour 1 sur deep, contre le pire fond`() {
        assertThat(worstContrast(MeeshyGlassTone.Deep, MeeshyGlassDensity.Regular)).isAtLeast(3.0)
    }

    @Test
    fun `plain tient 4,5 pour 1 jusqu'a la luminance 0,118, son plafond`() {
        val ratio = contrast(MeeshyGlassTone.Plain, MeeshyGlassDensity.Regular, MeeshyGlassTone.PLAIN_CEILING.toDouble())
        assertWithMessage("mesure $ratio").that(ratio).isAtLeast(4.5)
    }

    // endregion

    // region Parite : un fichier de vecteurs pour les trois suites

    @Test
    fun `la loi du ton suit les vecteurs de parite`() {
        val tone = vector("tone")
        assertThat(MeeshyGlassTone.PLAIN_CEILING).isEqualTo(tone.getValue("plainCeiling").jsonPrimitive.float)
        assertThat(MeeshyGlassTone.DEEP_CEILING).isEqualTo(tone.getValue("deepCeiling").jsonPrimitive.float)
        assertThat(MeeshyGlassTone.HYSTERESIS).isEqualTo(tone.getValue("hysteresis").jsonPrimitive.float)
        val cases: JsonArray = tone.getValue("cases").jsonArray
        assertThat(cases).isNotEmpty()
        cases.map { it.jsonObject }.forEach { case ->
            val previous = case["previous"]?.jsonPrimitive?.contentOrNull?.let(::toneNamed)
            val luminance = case["luminance"]?.jsonPrimitive?.floatOrNull
            val expected = toneNamed(case.getValue("tone").jsonPrimitive.content)
            assertWithMessage("$case").that(MeeshyGlassTone.resolve(luminance, previous)).isEqualTo(expected)
        }
    }

    @Test
    fun `la recette suit les vecteurs de parite`() {
        val vectors = vector("recipe")
        val drawn = vectors.getValue("drawn").jsonArray.map { it.jsonObject }
        assertThat(drawn).hasSize(6)
        drawn.forEach { entry ->
            val tone = toneNamed(entry.getValue("tone").jsonPrimitive.content)
            val density = if (entry.getValue("density").jsonPrimitive.content == "dense") MeeshyGlassDensity.Dense else MeeshyGlassDensity.Regular
            val resolved = recipe(tone, density = density)
            val expectedFill = if (entry.getValue("fill").jsonPrimitive.content == "light") MeeshyGlassFill.Light else MeeshyGlassFill.Dark
            assertWithMessage("$entry").that(resolved.fill).isEqualTo(expectedFill)
            assertWithMessage("$entry").that(resolved.fillOpacity).isEqualTo(entry.getValue("fillOpacity").jsonPrimitive.float)
            assertWithMessage("$entry").that(resolved.rimLit).isEqualTo(entry.getValue("rim").jsonPrimitive.float)
            assertWithMessage("$entry").that(resolved.rimShade).isEqualTo(entry.getValue("rim").jsonPrimitive.float)
            assertThat(resolved.topLight).isEqualTo(vectors.number("topLight"))
            assertThat(resolved.shadowOpacity).isEqualTo(vectors.number("shadowOpacity"))
            assertThat(resolved.shadowYDp).isEqualTo(vectors.number("shadowOffsetY"))
            assertThat(resolved.blurRadiusDp).isEqualTo(vectors.number("blurRadius"))
            assertThat(resolved.saturation).isEqualTo(vectors.number("saturation"))
        }
        val rest = recipe(MeeshyGlassTone.Deep, interactive = true, pressed = false)
        val pressed = recipe(MeeshyGlassTone.Deep, interactive = true, pressed = true)
        assertThat(pressed.scale).isEqualTo(vectors.number("pressScale"))
        assertThat(pressed.topLight).isWithin(EPSILON).of(rest.topLight * vectors.number("pressSheenFactor"))
        val hovered = recipe(MeeshyGlassTone.Deep, interactive = true, hovered = true)
        assertThat(hovered.topLight).isWithin(EPSILON).of(rest.topLight * vectors.number("hoverSheenFactor"))
    }

    // endregion

    // region Fabriques et lecture du disque

    private fun JsonObject.number(name: String): Float = getValue(name).jsonPrimitive.float

    private fun toneNamed(name: String): MeeshyGlassTone = when (name) {
        "plain" -> MeeshyGlassTone.Plain
        "deep" -> MeeshyGlassTone.Deep
        "onLight" -> MeeshyGlassTone.OnLight
        "theme" -> MeeshyGlassTone.Theme
        else -> error("ton inconnu dans les vecteurs : $name")
    }

    private fun material(tone: MeeshyGlassTone, rendering: GlassRendering, reduceTransparency: Boolean): MeeshyGlassMaterial =
        MeeshyGlassMaterial.resolve(tone = tone, rendering = rendering, reduceTransparency = reduceTransparency)

    private fun recipe(
        tone: MeeshyGlassTone,
        density: MeeshyGlassDensity = MeeshyGlassDensity.Regular,
        tinted: Boolean = false,
        interactive: Boolean = false,
        pressed: Boolean = false,
        material: MeeshyGlassMaterial = MeeshyGlassMaterial.Drawn,
        reduceMotion: Boolean = false,
        dark: Boolean = false,
        nested: Boolean = false,
        hovered: Boolean = false,
    ): MeeshyGlassRecipe = MeeshyGlassRecipe.resolve(
        tone = tone,
        density = density,
        isTinted = tinted,
        isInteractive = interactive,
        isPressed = pressed,
        material = material,
        reduceMotion = reduceMotion,
        isDark = dark,
        isNested = nested,
        isHovered = hovered,
    )

    /**
     * Contraste de l'encre blanche sur le fond de luminance [backdropLuminance] une fois recouvert du remplissage de la
     * recette (composition en sRGB encodé).
     */
    private fun contrast(tone: MeeshyGlassTone, density: MeeshyGlassDensity, backdropLuminance: Double): Double {
        val recipe = recipe(tone, density = density)
        val backdrop = encoded(backdropLuminance)
        val inkLevel = if (recipe.fill == MeeshyGlassFill.Light) 1.0 else 0.0
        val covered = backdrop * (1 - recipe.fillOpacity) + inkLevel * recipe.fillOpacity
        val luminance = CanvasChromeScheme.luminance(covered, covered, covered)
        return CanvasChromeScheme.contrastRatio(1.0, luminance)
    }

    /** Le pire fond du ton : le plus clair qu'il accepte (`plain` s'arrête à son plafond). */
    private fun worstContrast(tone: MeeshyGlassTone, density: MeeshyGlassDensity): Double {
        val worst = if (tone == MeeshyGlassTone.Plain) MeeshyGlassTone.PLAIN_CEILING.toDouble() else 1.0
        return contrast(tone, density, worst)
    }

    private fun encoded(luminance: Double): Double =
        if (luminance <= 0.0031308) luminance * 12.92 else 1.055 * luminance.pow(1 / 2.4) - 0.055

    private fun repositoryRoot(): File {
        val start = File("").absoluteFile
        return generateSequence(start) { it.parentFile }
            .firstOrNull { File(it, VECTORS).isFile }
            ?: File(start, "../..").canonicalFile.also { check(File(it, VECTORS).isFile) { "dépôt introuvable depuis ${start.absolutePath}" } }
    }

    private fun kitSources(): File =
        File(repositoryRoot(), "apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/kit")

    private fun vector(key: String): JsonObject {
        val root = Json.parseToJsonElement(File(repositoryRoot(), VECTORS).readText()).jsonObject
        return root.getValue(key).jsonObject
    }

    // endregion

    private companion object {
        const val VECTORS = "docs/product/kit/K01-MeeshyGlassTone.vectors.json"
        const val EPSILON = 1e-6f
    }
}
