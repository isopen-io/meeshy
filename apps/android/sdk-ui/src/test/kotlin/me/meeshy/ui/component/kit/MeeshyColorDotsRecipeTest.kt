package me.meeshy.ui.component.kit

import androidx.compose.ui.graphics.Color
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import java.text.NumberFormat
import java.util.Locale
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.ui.theme.MeeshyAdaptiveColors
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyPalette
import org.junit.Test

/**
 * K07 — les pastilles de couleur : la recette et la loi, lues sur les vecteurs partagés
 * (`docs/product/kit/K07-MeeshyColorDots.vectors.json`). Miroir de `MeeshyColorDotsTests` (iOS). Android tient la cellule
 * de 48 dp au lieu de 44 pour le toucher ; la disposition se rejoue avec la cellule de la planche (44), comme iOS et web.
 */
class MeeshyColorDotsRecipeTest {

    private fun vectors(): JsonObject {
        val file = generateSequence(File("").absoluteFile) { it.parentFile }
            .map { File(it, "docs/product/kit/K07-MeeshyColorDots.vectors.json") }
            .first { it.exists() }
        return Json.parseToJsonElement(file.readText()).jsonObject
    }

    private fun JsonObject.array(key: String) = getValue(key).jsonArray.map { it.jsonObject }

    private fun JsonObject.int(key: String): Int = getValue(key).jsonPrimitive.int

    private fun JsonObject.double(key: String): Double = getValue(key).jsonPrimitive.double

    private fun sizeOf(name: String): MeeshyColorDotSize = MeeshyColorDotSize.valueOf(name.replaceFirstChar { it.uppercase() })

    private fun layoutOf(name: String): MeeshyColorDotsLayout = MeeshyColorDotsLayout.valueOf(name.replaceFirstChar { it.uppercase() })

    @Test
    fun `la disposition de chaque vecteur rejoue la recette de la planche`() {
        vectors().array("layout").forEach { row ->
            val recipe = MeeshyColorDotsRecipe.resolve(
                count = row.int("count"),
                available = row.double("available"),
                size = sizeOf(row.getValue("size").jsonPrimitive.content),
                layout = layoutOf(row.getValue("layout").jsonPrimitive.content),
                cell = row.double("cell"),
            )
            assertThat(recipe.rows).containsExactlyElementsIn(row.getValue("rows").jsonArray.map { it.jsonPrimitive.int }).inOrder()
            assertThat(recipe.scrolls).isEqualTo(row.getValue("scrolls").jsonPrimitive.content == "true")
            assertThat(recipe.size.width.toDouble()).isWithin(0.001).of(row.double("width"))
            assertThat(recipe.size.height.toDouble()).isWithin(0.001).of(row.double("height"))
        }
    }

    @Test
    fun `la courante est la seule pastille dont l'identifiant vaut la selection`() {
        assertThat(MeeshyColorDotsRecipe.isCurrent("b", selection = "b")).isTrue()
        assertThat(MeeshyColorDotsRecipe.isCurrent("a", selection = "b")).isFalse()
        assertThat(MeeshyColorDotsRecipe.isCurrent("a", selection = null)).isFalse()
    }

    @Test
    fun `le cercle suit les etats du vecteur`() {
        vectors().getValue("ringStates").jsonArray.map { it.jsonObject }.forEach { state ->
            val selected = state.getValue("selected").jsonPrimitive.content == "true"
            val pressed = state.getValue("pressed").jsonPrimitive.content == "true"
            assertThat(MeeshyColorDotsRecipe.ringOpacity(isSelected = selected, isPressed = pressed))
                .isWithin(0.001).of(state.double("opacity"))
            assertThat(MeeshyColorDotsRecipe.ringScale(isSelected = selected, isPressed = pressed))
                .isWithin(0.001).of(state.double("scale"))
        }
    }

    @Test
    fun `le filet passe de 25 a 60 pour cent au survol ou en contraste accru`() {
        vectors().getValue("hairline").jsonArray.map { it.jsonObject }.forEach { row ->
            val hovered = row.getValue("hovered").jsonPrimitive.content == "true"
            val increased = row.getValue("increasedContrast").jsonPrimitive.content == "true"
            assertThat(MeeshyColorDotsRecipe.hairline(isHovered = hovered, increasedContrast = increased))
                .isWithin(0.001).of(row.double("opacity"))
        }
    }

    @Test
    fun `l'encre suit le ton, le theme passe a l'encre du theme`() {
        vectors().getValue("ink").jsonArray.map { it.jsonObject }.forEach { row ->
            val tone = MeeshyGlassTone.valueOf(row.getValue("tone").jsonPrimitive.content.replaceFirstChar { it.uppercase() })
            val recipe = MeeshyColorDotsRecipe.resolve(count = 1, available = Double.POSITIVE_INFINITY,
                size = MeeshyColorDotSize.S28, layout = MeeshyColorDotsLayout.Row, tone = tone)
            assertThat(recipe.ink.name).isEqualTo(row.getValue("ink").jsonPrimitive.content.let { if (it == "onMedia") "OnMedia" else "ThemeInk" })
        }
    }

    @Test
    fun `le nom dit est celui de la pastille, sinon sa position localisee`() {
        vectors().array("names").forEach { row ->
            val dot = MeeshyColorDot(id = "x", fill = MeeshyColorDotFill.Hollow,
                name = row.getValue("name").takeUnless { it.toString() == "null" }?.jsonPrimitive?.content)
            val said = MeeshyColorDotsWords.spokenName(
                dot = dot,
                index = row.int("index"),
                total = row.int("total"),
                position = { p, t ->
                    if (row.getValue("locale").jsonPrimitive.content == "fr") "Couleur $p sur $t" else "Color $p of $t"
                },
            )
            assertThat(said).isEqualTo(row.getValue("said").jsonPrimitive.content)
        }
    }

    @Test
    fun `les contrastes minimaux de la recette`() {
        val contrast = vectors().getValue("contrast").jsonObject
        assertThat(MeeshyColorDotsRecipe.INK_MIN_CONTRAST).isAtLeast(contrast.double("inkMin"))
        assertThat(MeeshyColorDotsRecipe.GLYPH_MIN_CONTRAST).isAtLeast(contrast.double("glyphMin"))
    }

    @Test
    fun `l'encre du cercle tient son contraste sur les fonds sombres du kit`() {
        val backdrops = listOf(MeeshyAdaptiveColors.backgroundPrimary(isDark = true), MeeshyPalette.Indigo950)

        assertThat(MeeshyColorDotsRecipe.worstContrast(MeeshyMediaChromeColors.OnMedia, backdrops))
            .isAtLeast(MeeshyColorDotsRecipe.INK_MIN_CONTRAST)
    }

    @Test
    fun `le glyphe prend la plus contrastee des deux encres, au moins 4 pour 1 sur chaque teinte du kit`() {
        val tints = listOf(
            MeeshyPalette.TileCoral, MeeshyPalette.TileSaffron, MeeshyPalette.TileBlue, MeeshyPalette.TileAmethyst,
            MeeshyPalette.TileSky, MeeshyPalette.TileEmerald, MeeshyPalette.TileTeal, MeeshyPalette.TileCyan,
            MeeshyPalette.TileRose, MeeshyPalette.Indigo500, MeeshyPalette.Indigo950, MeeshyPalette.Amber500,
            MeeshyPalette.Orange500, MeeshyPalette.Purple600, MeeshyPalette.Neutral500, MeeshyPalette.Success,
            MeeshyMediaChromeColors.OnMedia,
        )

        tints.forEach { tint ->
            val ink = MeeshyColorDotsRecipe.glyphInk(MeeshyColorDotFill.Solid(tint), groupInk = MeeshyMediaChromeColors.OnMedia)
            assertThat(MeeshyColorDotsRecipe.worstContrast(ink, listOf(tint))).isAtLeast(MeeshyColorDotsRecipe.GLYPH_MIN_CONTRAST)
        }
        assertThat(MeeshyColorDotsRecipe.glyphInk(MeeshyColorDotFill.Solid(MeeshyMediaChromeColors.OnMedia), Color.Unspecified))
            .isEqualTo(MeeshyPalette.Indigo950)
    }

    @Test
    fun `le glyphe d'un disque creux ou sans arret prend l'encre du groupe`() {
        val group = MeeshyPalette.Indigo500

        assertThat(MeeshyColorDotsRecipe.glyphInk(MeeshyColorDotFill.Hollow, group)).isEqualTo(group)
        assertThat(MeeshyColorDotsRecipe.glyphInk(MeeshyColorDotFill.Gradient(emptyList()), group)).isEqualTo(group)
    }

    @Test
    fun `le cercle en transition rejoint les etats du vecteur a ses deux bouts, le doigt pose sans attendre`() {
        listOf(false, true).forEach { pressed ->
            assertThat(MeeshyColorDotsRecipe.ringOpacity(selectedFraction = 0.0, isPressed = pressed))
                .isWithin(0.001).of(MeeshyColorDotsRecipe.ringOpacity(isSelected = false, isPressed = pressed))
            assertThat(MeeshyColorDotsRecipe.ringOpacity(selectedFraction = 1.0, isPressed = pressed))
                .isWithin(0.001).of(MeeshyColorDotsRecipe.ringOpacity(isSelected = true, isPressed = pressed))
            assertThat(MeeshyColorDotsRecipe.ringScale(selectedFraction = 0.0, isPressed = pressed))
                .isWithin(0.001).of(MeeshyColorDotsRecipe.ringScale(isSelected = false, isPressed = pressed))
            assertThat(MeeshyColorDotsRecipe.ringScale(selectedFraction = 1.0, isPressed = pressed))
                .isWithin(0.001).of(MeeshyColorDotsRecipe.ringScale(isSelected = true, isPressed = pressed))
        }
        assertThat(MeeshyColorDotsRecipe.ringOpacity(selectedFraction = 1.2, isPressed = false)).isWithin(0.001).of(1.0)
    }

    @Test
    fun `une ligne qui defile centre la courante, jamais avant le debut`() {
        assertThat(MeeshyColorDotsRecipe.scrollTarget(index = 6, cell = 48.0, viewport = 200.0)).isWithin(0.001).of(212.0)
        assertThat(MeeshyColorDotsRecipe.scrollTarget(index = 0, cell = 48.0, viewport = 200.0)).isWithin(0.001).of(0.0)
        assertThat(MeeshyColorDotsRecipe.scrollTarget(index = -1, cell = 48.0, viewport = 200.0)).isWithin(0.001).of(0.0)
    }

    private fun positionTemplate(qualifier: String): String {
        val file = generateSequence(File("").absoluteFile) { it.parentFile }
            .map { File(it, "apps/android/sdk-ui/src/main/res/$qualifier/strings_generated.xml") }
            .first { it.exists() }
        val match = Regex("""<string name="kit_color_dots_position">([^<]+)</string>""").find(file.readText())
        return checkNotNull(match) { "kit_color_dots_position absente de $qualifier" }.groupValues[1]
    }

    @Test
    fun `la position s'ecrit dans les chiffres du lecteur, sans placeholder brut`() {
        val arabic = Locale.forLanguageTag("ar-SA")
        val said = MeeshyColorDotsWords.position(index = 2, total = 17, locale = arabic, template = positionTemplate("values-ar"))
        val numbers = NumberFormat.getIntegerInstance(arabic)

        assertThat(said).contains(numbers.format(3))
        assertThat(said).contains(numbers.format(17))
        listOf("values" to Locale.ENGLISH, "values-fr" to Locale.FRENCH, "values-ar" to arabic).forEach { (qualifier, locale) ->
            val rendered = MeeshyColorDotsWords.position(index = 2, total = 17, locale = locale, template = positionTemplate(qualifier))
            listOf("%s", "%d", "%1$", "%2$").forEach { assertThat(rendered).doesNotContain(it) }
        }
        assertThat(MeeshyColorDotsWords.position(index = 4, total = 17, locale = Locale.FRENCH, template = positionTemplate("values-fr")))
            .isEqualTo("Couleur 5 sur 17")
    }

    @Test
    fun `les fichiers de K07 ne portent ni verre ni code de couleur`() {
        val forbidden = Regex("""\bMeeshyGlass\(|MeeshyGlassGroup|MeeshyGlassSurface|LiquidGlass|Color\(0x|#[0-9A-Fa-f]{6}\b""")
        listOf("MeeshyColorDots.kt", "MeeshyColorDotsRecipe.kt").forEach { name ->
            val file = generateSequence(File("").absoluteFile) { it.parentFile }
                .map { File(it, "apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/kit/$name") }
                .first { it.exists() }
            assertWithMessage(name).that(forbidden.find(file.readText())?.value).isNull()
        }
    }
}
