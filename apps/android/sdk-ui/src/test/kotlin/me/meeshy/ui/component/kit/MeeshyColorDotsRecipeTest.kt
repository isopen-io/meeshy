package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
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
}
