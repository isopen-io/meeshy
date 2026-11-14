package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.float
import kotlinx.serialization.json.floatOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import me.meeshy.ui.theme.MeeshyControlSize
import org.junit.Test

/**
 * K05 — le curseur d'un réglage continu, lu comme des VALEURS : la loi (bornage, calage, fraction, ajustement, tic), les
 * effets d'un geste ou d'une commande, la recette, les mesures et la cible. Miroir de `MeeshyLabeledSliderTests` (iOS), et
 * même fichier de vecteurs de parité (`docs/product/kit/K05-MeeshyLabeledSlider.vectors.json`). Le dessin et le geste réel
 * vivent dans les témoins de rendu ; ici, la règle que le geste applique.
 */
class MeeshyLabeledSliderTest {

    // region La loi

    @Test
    fun `la loi suit les vecteurs : bornage, calage, fraction, ajustement, tic et emission`() {
        val rows = vectors().getValue("loi").jsonArray.map { it.jsonObject }
        assertThat(rows).isNotEmpty()
        rows.forEach { row ->
            val name = row.string("nom")
            val rule = MeeshyLabeledSliderRule(range = range(row), step = row.floatOrNull("step"))
            val rtl = row.booleanOrNull("rtl") ?: false
            val expected = when {
                row.has("attendu") -> row.float("attendu")
                row.has("tic") -> row.bool("tic").asOne()
                else -> row.bool("emet").asOne()
            }
            val actual: Float = when {
                row.has("entree") && name.startsWith("fraction") -> rule.fraction(of = row.float("entree"), isRtl = rtl)
                row.has("entree") -> rule.snap(row.float("entree"))
                row.has("fraction") -> rule.value(atFraction = row.float("fraction"), isRtl = rtl)
                row.has("haut") -> rule.adjusted(row.float("valeur"), up = row.bool("haut"), coarse = row.bool("grossier"))
                row.has("tic") -> rule.detentCrossed(
                    from = row.float("de"), to = row.float("a"), neutral = row.floatOrNull("neutre"),
                ).let { if (it) 1f else 0f }
                row.has("emet") -> rule.shouldEmit(previous = row.float("de"), next = row.float("a")).let { if (it) 1f else 0f }
                else -> error("vecteur de loi sans règle : $name")
            }
            assertWithMessage(name).that(actual).isWithin(TOLERANCE).of(expected)
        }
    }

    @Test
    fun `le tic de loi suit les vecteurs pour chaque franchissement`() {
        val rows = vectors().getValue("loi").jsonArray.map { it.jsonObject }.filter { it.has("tic") }
        assertThat(rows).isNotEmpty()
        rows.forEach { row ->
            val rule = MeeshyLabeledSliderRule(range = range(row), step = row.floatOrNull("step"))
            val crossed = rule.detentCrossed(
                from = row.float("de"), to = row.float("a"), neutral = row.floatOrNull("neutre"),
            )
            assertWithMessage(row.string("nom")).that(crossed).isEqualTo(row.bool("tic"))
        }
    }

    // endregion

    // region Les effets des gestes et des commandes

    @Test
    fun `chaque geste et commande rend les effets des vecteurs`() {
        val rows = vectors().getValue("interaction").jsonArray.map { it.jsonObject }
        assertThat(rows).isNotEmpty()
        rows.forEach { row ->
            val interaction = interaction(row)
            val rtl = row.booleanOrNull("rtl") ?: false
            val current = row.optionalFloat("de") ?: 0f
            val effects = when (row.string("geste")) {
                "drag" -> interaction.drag(
                    current = current,
                    toFraction = row.float("fraction"),
                    isRtl = rtl,
                    isEditing = row.bool("edition"),
                )
                "release" -> interaction.release(isEditing = row.bool("edition"))
                "jump" -> interaction.jump(current = current, toFraction = row.float("fraction"), isRtl = rtl)
                "command" -> interaction.perform(command(row.string("commande")), from = current, isRtl = rtl)
                else -> error("geste inconnu : ${row.string("geste")}")
            }
            assertWithMessage(row.string("nom")).that(effects).isEqualTo(expectedEffects(row))
        }
    }

    @Test
    fun `un glisse qui ne change pas le cran ne rend aucune valeur`() {
        val interaction = MeeshyLabeledSliderInteraction(
            rule = MeeshyLabeledSliderRule(range = 0f..10f, step = 1f),
            neutral = null,
            haptic = MeeshyLabeledSliderHaptic.Light,
            isEnabled = true,
        )
        assertThat(interaction.drag(current = 5f, toFraction = 0.52f, isRtl = false, isEditing = true)).isEmpty()
    }

    @Test
    fun `le nom de la remise n'existe qu'avec un neutre et un nom non vide`() {
        val withNeutral = MeeshyLabeledSliderInteraction(MeeshyLabeledSliderRule(-100f..100f, 1f), 0f, MeeshyLabeledSliderHaptic.Light, true)
        val withoutNeutral = MeeshyLabeledSliderInteraction(MeeshyLabeledSliderRule(0f..100f, 1f), null, MeeshyLabeledSliderHaptic.Light, true)
        assertThat(withNeutral.resetActionName("Remettre à zéro")).isEqualTo("Remettre à zéro")
        assertThat(withNeutral.resetActionName("")).isNull()
        assertThat(withNeutral.resetActionName(null)).isNull()
        assertThat(withoutNeutral.resetActionName("Remettre à zéro")).isNull()
    }

    // endregion

    // region La recette et les mesures

    @Test
    fun `la recette suit les vecteurs pour chaque etat`() {
        vectors().getValue("recette").jsonArray.map { it.jsonObject }.forEach { row ->
            val recipe = MeeshyLabeledSliderRecipe.resolve(
                tone = MeeshyGlassTone.Deep,
                isEnabled = row.optionalBool("actif") ?: true,
                isPressed = row.bool("tenu"),
                isOffNeutral = row.bool("ecarte"),
                tint = null,
                reduceMotion = row.optionalBool("reduire") ?: false,
                isHovered = row.optionalBool("survol") ?: false,
            )
            val name = row.string("nom")
            assertWithMessage(name).that(recipe.haloOpacity).isWithin(TOLERANCE).of(row.float("halo"))
            assertWithMessage(name).that(recipe.thumbScale).isWithin(TOLERANCE).of(row.float("echelle"))
            assertWithMessage(name).that(recipe.contentOpacity).isWithin(TOLERANCE).of(row.float("contenu"))
            assertWithMessage(name).that(recipe.valueOpacity).isWithin(TOLERANCE).of(row.float("valeur"))
        }
    }

    @Test
    fun `les mesures de la planche sont celles de la recette`() {
        val mesures = vectors().getValue("mesures").jsonObject
        assertThat(MeeshyLabeledSliderRecipe.TRACK_HEIGHT_DP).isWithin(TOLERANCE).of(mesures.float("piste"))
        assertThat(MeeshyLabeledSliderRecipe.THUMB_DIAMETER_DP).isWithin(TOLERANCE).of(mesures.float("pouce"))
        assertThat(MeeshyLabeledSliderRecipe.THUMB_INSET_DP).isWithin(TOLERANCE).of(mesures.float("encart"))
        assertThat(MeeshyLabeledSliderRecipe.HALO_DIAMETER_DP).isWithin(TOLERANCE).of(mesures.float("halo"))
        assertThat(MeeshyLabeledSliderRecipe.PRESSED_SCALE).isWithin(TOLERANCE).of(mesures.float("echelleTenue"))
        assertThat(MeeshyLabeledSliderRecipe.EMPTY_TRACK_OPACITY).isWithin(TOLERANCE).of(mesures.float("pisteVide"))
        assertThat(MeeshyLabeledSliderRecipe.SHADOW_RADIUS_DP).isWithin(TOLERANCE).of(mesures.getValue("ombre").jsonObject.float("flou"))
        assertThat(MeeshyLabeledSliderRecipe.SHADOW_OFFSET_Y_DP).isWithin(TOLERANCE).of(mesures.getValue("ombre").jsonObject.float("y"))
        assertThat(MeeshyLabeledSliderRecipe.SHADOW_OPACITY).isWithin(TOLERANCE).of(mesures.getValue("ombre").jsonObject.float("opacite"))
        assertThat(MeeshyLabeledSliderRecipe.SETTLE_MILLIS.toFloat()).isWithin(TOLERANCE).of(mesures.float("glisseMs"))
        assertThat(MeeshyLabeledSliderRule.COARSE_FRACTION).isWithin(TOLERANCE).of(mesures.float("balayage"))
        assertThat(MeeshyLabeledSliderRule.FINE_FRACTION).isWithin(TOLERANCE).of(mesures.float("flecheContinue"))
    }

    @Test
    fun `la cible tactile fait au moins 48 dp, et le pouce garde son contraste`() {
        val cible = vectors().getValue("cible_minimale").jsonObject
        assertThat(MeeshyControlSize.minTouchTarget.value).isAtLeast(cible.float("android_dp"))
        assertThat(MeeshyLabeledSliderRecipe.HIT_HEIGHT_DP).isAtLeast(cible.float("android_dp"))
        val contrast = vectors().getValue("contraste_min").jsonObject.float("pouce")
        assertThat(MeeshyLabeledSliderRecipe.thumbContrast(MeeshyLabeledSliderInk.OnMedia, isDark = true))
            .isAtLeast(contrast.toDouble())
    }

    // endregion

    // region Helpers

    private fun interaction(row: JsonObject): MeeshyLabeledSliderInteraction = MeeshyLabeledSliderInteraction(
        rule = MeeshyLabeledSliderRule(range = range(row), step = row.floatOrNull("step")),
        neutral = row.floatOrNull("neutre"),
        haptic = if (row.optionalString("haptique") == "none") MeeshyLabeledSliderHaptic.None else MeeshyLabeledSliderHaptic.Light,
        isEnabled = row.optionalBool("actif") ?: true,
    )

    private fun expectedEffects(row: JsonObject): List<MeeshyLabeledSliderEffect> =
        row.getValue("effets").jsonArray.map { element ->
            val effect = element.jsonObject
            when {
                effect.has("editing") -> MeeshyLabeledSliderEffect.Editing(effect.bool("editing"))
                effect.has("value") -> MeeshyLabeledSliderEffect.Value(effect.float("value"))
                effect.has("haptic") -> MeeshyLabeledSliderEffect.Haptic
                else -> error("effet inconnu : $effect")
            }
        }

    private fun command(name: String): MeeshyLabeledSliderCommand = MeeshyLabeledSliderCommand.entries.first { it.name.replaceFirstChar { c -> c.lowercase() } == name }

    private fun range(row: JsonObject): ClosedFloatingPointRange<Float> {
        val bounds = row.getValue("range").jsonArray.map { it.jsonPrimitive.float }
        return bounds[0]..bounds[1]
    }

    private fun JsonObject.has(key: String): Boolean = containsKey(key)
    private fun JsonObject.string(key: String): String = getValue(key).jsonPrimitive.contentOrNull!!
    private fun JsonObject.optionalString(key: String): String? = this[key]?.jsonPrimitive?.contentOrNull
    private fun JsonObject.bool(key: String): Boolean = getValue(key).jsonPrimitive.booleanOrNull!!
    private fun JsonObject.optionalBool(key: String): Boolean? = this[key]?.jsonPrimitive?.booleanOrNull
    private fun JsonObject.float(key: String): Float = getValue(key).jsonPrimitive.float
    private fun JsonObject.optionalFloat(key: String): Float? = this[key]?.jsonPrimitive?.floatOrNull
    private fun Boolean.asOne(): Float = if (this) 1f else 0f
    private fun JsonObject.floatOrNull(key: String): Float? = this[key]?.jsonPrimitive?.floatOrNull

    private fun vectors(): JsonObject = Json.parseToJsonElement(File(repositoryRoot(), VECTORS).readText()).jsonObject

    private fun repositoryRoot(): File {
        val start = File("").absoluteFile
        return generateSequence(start) { it.parentFile }
            .firstOrNull { File(it, VECTORS).isFile }
            ?: File(start, "../..").canonicalFile.also { check(File(it, VECTORS).isFile) { "dépôt introuvable depuis ${start.absolutePath}" } }
    }

    private companion object {
        const val VECTORS = "docs/product/kit/K05-MeeshyLabeledSlider.vectors.json"
        const val TOLERANCE = 1e-4f
    }

    // endregion
}
