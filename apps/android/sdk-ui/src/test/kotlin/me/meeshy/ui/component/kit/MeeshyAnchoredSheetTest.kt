package me.meeshy.ui.component.kit

import androidx.compose.ui.graphics.Color
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import kotlin.math.pow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.float
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.ui.theme.MeeshyAdaptiveColors
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import org.junit.Test

/**
 * K15 — la feuille ancrée, lue comme des VALEURS : la hauteur et son plafond, la loi du glissé, les crans, la place
 * publiée, le mouvement, la loi 13, le contraste de l'encre. Miroir de `MeeshyAnchoredSheetTests` (iOS) et même fichier de
 * vecteurs de parité (`docs/product/kit/K15-MeeshyAnchoredSheet.vectors.json`). Le rendu vit dans
 * `MeeshyAnchoredSheetBehaviorTest`.
 *
 * Écarts assumés avec iOS (fiche K15 §11) : la fin prédite d'un glissé se déduit de la vitesse du doigt, et le reste d'un
 * défilement tiré vers le bas ferme aussi la feuille.
 */
class MeeshyAnchoredSheetTest {

    // region Hauteur

    @Test
    fun `les fractions de la planche - 0,30, 0,50 et 0,62, et 120 gardes au-dessus`() {
        val row = vectors().getValue("fractions").jsonObject
        assertThat(MeeshyAnchoredSheetMetrics.COMPACT_FRACTION).isEqualTo(row.float("compact"))
        assertThat(MeeshyAnchoredSheetMetrics.REGULAR_FRACTION).isEqualTo(row.float("regular"))
        assertThat(MeeshyAnchoredSheetMetrics.MAXIMUM_FRACTION).isEqualTo(row.float("tall"))
        assertThat(MeeshyAnchoredSheetMetrics.RESERVED_ABOVE).isEqualTo(row.float("reservedAbove"))
    }

    @Test
    fun `le plafond - la fraction maximale de la place, 120 gardes au-dessus, jamais negatif`() {
        rows("ceiling").forEach { row ->
            val ceiling = MeeshyAnchoredSheetMetrics.ceiling(row.float("available"), row.float("maximumFraction"))
            assertThat(ceiling).isWithin(EPSILON).of(row.float("ceiling"))
        }
    }

    @Test
    fun `la hauteur au repos - le contenu epouse puis plafonne, les fractions et les crans suivent les vecteurs`() {
        rows("height").forEach { row ->
            val rest = MeeshyAnchoredSheetMetrics.height(height(row), row.float("content"), row.float("available"))
            assertWithMessage("$row").that(rest).isWithin(EPSILON).of(row.float("rest"))
        }
    }

    @Test
    fun `des crans desordonnes sont ordonnes et plafonnes`() {
        rows("detents").forEach { row ->
            val fractions = row.getValue("fractions").jsonArray.map { it.jsonPrimitive.float }
            val rests = MeeshyAnchoredSheetMetrics.detentHeights(fractions, row.float("available"))
            assertThat(rests).containsExactlyElementsIn(row.getValue("rests").jsonArray.map { it.jsonPrimitive.float }).inOrder()
        }
    }

    @Test
    fun `jamais plus que la fenetre, quelle que soit la hauteur demandee`() {
        val heights = listOf(
            MeeshyAnchoredSheetHeight.Compact,
            MeeshyAnchoredSheetHeight.Regular,
            MeeshyAnchoredSheetHeight.Tall,
            MeeshyAnchoredSheetHeight.Fraction(2f),
            MeeshyAnchoredSheetHeight.Content,
            MeeshyAnchoredSheetHeight.Detents(listOf(0.2f, 1.5f), initial = 1),
        )
        listOf(0f, 40f, 200f, 480f, 852f).forEach { available ->
            heights.forEach { height ->
                val rest = MeeshyAnchoredSheetMetrics.height(height, content = 10_000f, available = available)
                assertThat(rest).isAtLeast(0f)
                assertThat(rest).isAtMost(available)
                assertThat(rest).isAtMost(available * MeeshyAnchoredSheetMetrics.MAXIMUM_FRACTION + EPSILON)
                assertThat(available - rest).isAtLeast(minOf(available, MeeshyAnchoredSheetMetrics.RESERVED_ABOVE) - EPSILON)
            }
        }
    }

    @Test
    fun `une place non finie ne produit aucune feuille`() {
        assertThat(MeeshyAnchoredSheetMetrics.height(MeeshyAnchoredSheetHeight.Regular, 100f, Float.NaN)).isEqualTo(0f)
        assertThat(MeeshyAnchoredSheetMetrics.height(MeeshyAnchoredSheetHeight.Content, 100f, Float.POSITIVE_INFINITY)).isEqualTo(0f)
        assertThat(MeeshyAnchoredSheetMetrics.height(MeeshyAnchoredSheetHeight.Content, Float.NaN, 800f)).isEqualTo(496f)
    }

    @Test
    fun `les hauteurs nommees sont les fractions de la fiche`() {
        assertThat(MeeshyAnchoredSheetHeight.Compact).isEqualTo(MeeshyAnchoredSheetHeight.Fraction(0.3f))
        assertThat(MeeshyAnchoredSheetHeight.Regular).isEqualTo(MeeshyAnchoredSheetHeight.Fraction(0.5f))
        assertThat(MeeshyAnchoredSheetHeight.Tall).isEqualTo(MeeshyAnchoredSheetHeight.Fraction(0.62f))
    }

    // endregion

    // region Glisse

    @Test
    fun `le glisse court revient, le long ou le vif ferme - le quart parcouru, la moitie predite`() {
        rows("dismisses").forEach { row ->
            val closes = MeeshyAnchoredSheetMetrics.dismisses(row.float("translation"), row.float("predictedEnd"), row.float("height"))
            assertWithMessage("$row").that(closes).isEqualTo(row.getValue("closes").jsonPrimitive.boolean)
        }
    }

    @Test
    fun `vers le haut, la feuille ne se souleve pas - sauf la place qu'un cran plus haut offre`() {
        rows("dragOffset").forEach { row ->
            val offset = MeeshyAnchoredSheetMetrics.dragOffset(row.float("translation"), row.float("upwardRoom"))
            assertWithMessage("$row").that(offset).isWithin(EPSILON).of(row.float("offset"))
        }
    }

    @Test
    fun `le relacher conclut vers le cran le plus proche de l'endroit que la vitesse designe, ou ferme sous le plus bas`() {
        rows("settle").forEach { row ->
            val rests = row.getValue("rests").jsonArray.map { it.jsonPrimitive.float }
            val settlement = MeeshyAnchoredSheetMetrics.settle(
                translation = row.float("translation"),
                predictedEnd = row.float("predictedEnd"),
                currentIndex = row.getValue("index").jsonPrimitive.int,
                rests = rests,
            )
            val expected = when (row.getValue("settles").jsonPrimitive.content) {
                "dismiss" -> MeeshyAnchoredSheetSettlement.Dismiss
                else -> MeeshyAnchoredSheetSettlement.Rest(row.getValue("to").jsonPrimitive.int)
            }
            assertWithMessage("$row").that(settlement).isEqualTo(expected)
        }
    }

    @Test
    fun `sans cran, le relacher ne choisit qu'entre fermer et revenir`() {
        assertThat(MeeshyAnchoredSheetMetrics.settle(0f, 0f, 0, emptyList())).isEqualTo(MeeshyAnchoredSheetSettlement.Dismiss)
    }

    @Test
    fun `la fin predite est la position du doigt un quart de seconde plus tard`() {
        assertThat(MeeshyAnchoredSheetMetrics.predictedEnd(translation = 40f, velocity = 800f)).isWithin(EPSILON).of(240f)
        assertThat(MeeshyAnchoredSheetMetrics.predictedEnd(translation = 40f, velocity = 0f)).isEqualTo(40f)
        assertThat(MeeshyAnchoredSheetMetrics.PREDICTION_SECONDS).isEqualTo(0.25f)
    }

    @Test
    fun `un jet vif ferme une feuille que la distance seule laisserait revenir`() {
        val height = 400f
        val translation = 40f
        val slow = MeeshyAnchoredSheetMetrics.predictedEnd(translation, velocity = 100f)
        val quick = MeeshyAnchoredSheetMetrics.predictedEnd(translation, velocity = 1_200f)

        assertThat(MeeshyAnchoredSheetMetrics.dismisses(translation, slow, height)).isFalse()
        assertThat(MeeshyAnchoredSheetMetrics.dismisses(translation, quick, height)).isTrue()
    }

    @Test
    fun `le reste d'un defilement tire vers le bas ferme au-dela de 120 dp ou sur un jet de 900 dp par seconde`() {
        assertThat(MeeshyAnchoredSheetMetrics.pullDismisses(pulledDp = 119f, flingDpPerSecond = 0f)).isFalse()
        assertThat(MeeshyAnchoredSheetMetrics.pullDismisses(pulledDp = 120f, flingDpPerSecond = 0f)).isTrue()
        assertThat(MeeshyAnchoredSheetMetrics.pullDismisses(pulledDp = 10f, flingDpPerSecond = 899f)).isFalse()
        assertThat(MeeshyAnchoredSheetMetrics.pullDismisses(pulledDp = 10f, flingDpPerSecond = 900f)).isTrue()
    }

    // endregion

    // region Place publiee et disposition

    @Test
    fun `le haut au repos est le bas du conteneur moins la feuille`() {
        rows("restingTop").forEach { row ->
            val top = MeeshyAnchoredSheetMetrics.restingTop(row.float("containerMaxY"), row.float("height"))
            assertThat(top).isWithin(EPSILON).of(row.float("top"))
        }
    }

    @Test
    fun `la disposition d'une feuille a crans repose sur le cran courant, mise en page au plus haut`() {
        val height = MeeshyAnchoredSheetHeight.Detents(listOf(0.3f, 0.6f), initial = 0)
        val low = MeeshyAnchoredSheetLayout.resolve(height, content = null, available = 800f, maximumFraction = 0.62f, detentIndex = 0)
        val high = MeeshyAnchoredSheetLayout.resolve(height, content = null, available = 800f, maximumFraction = 0.62f, detentIndex = 1)

        assertThat(listOf(low.rest, high.rest)).containsExactly(240f, 480f).inOrder()
        assertThat(listOf(low.layoutHeight, high.layoutHeight)).containsExactly(480f, 480f).inOrder()
        assertThat(listOf(low.restOffset, high.restOffset)).containsExactly(240f, 0f).inOrder()
        assertThat(low.hasDetents && high.hasDetents).isTrue()
    }

    @Test
    fun `une feuille sans cran se met en page a sa hauteur, sans decalage`() {
        val layout = MeeshyAnchoredSheetLayout.resolve(
            MeeshyAnchoredSheetHeight.Regular, content = null, available = 800f, maximumFraction = 0.62f, detentIndex = 0,
        )

        assertThat(layout.rest).isEqualTo(400f)
        assertThat(layout.layoutHeight).isEqualTo(400f)
        assertThat(layout.restOffset).isEqualTo(0f)
        assertThat(layout.hasDetents).isFalse()
    }

    @Test
    fun `le cran d'ouverture est cherche dans l'ordre fourni, puis lu dans la liste ordonnee`() {
        assertThat(MeeshyAnchoredSheetMetrics.initialDetentIndex(listOf(0.6f, 0.3f), initial = 0)).isEqualTo(1)
        assertThat(MeeshyAnchoredSheetMetrics.initialDetentIndex(listOf(0.3f, 0.6f), initial = 5)).isEqualTo(1)
        assertThat(MeeshyAnchoredSheetMetrics.initialDetentIndex(emptyList(), initial = 0)).isEqualTo(0)
    }

    // endregion

    // region Mouvement, loi 13 et mesures

    @Test
    fun `le ressort de 0,32 sur 0,88 - sous Reduire les animations, tout est immediat`() {
        val motion = vectors().getValue("motion").jsonObject
        val normal = MeeshyAnchoredSheetMetrics.motion(reduceMotion = false)
        assertThat(normal.response).isEqualTo(motion.float("response"))
        assertThat(normal.dampingFraction).isEqualTo(motion.float("dampingFraction"))
        assertThat(normal.durationMilliseconds).isEqualTo(motion.getValue("durationMs").jsonPrimitive.int)
        assertThat(normal.isImmediate).isFalse()

        val reduced = MeeshyAnchoredSheetMetrics.motion(reduceMotion = true)
        val expected = motion.getValue("reduced").jsonObject
        assertThat(reduced.isImmediate).isEqualTo(expected.getValue("immediate").jsonPrimitive.boolean)
        assertThat(reduced.durationMilliseconds).isEqualTo(expected.getValue("durationMs").jsonPrimitive.int)
    }

    @Test
    fun `la raideur Compose est celle d'un ressort de periode 0,32 s`() {
        val stiffness = MeeshyAnchoredSheetMetrics.motion(reduceMotion = false).stiffness

        assertThat(stiffness).isWithin(1f).of(385.5f)
    }

    @Test
    fun `loi 13 - ni poignee, ni en-tete, ni croix, ni voile hors de leurs conditions, modale en Dismisses seulement`() {
        rows("law13").forEach { row ->
            val expect = row.getValue("expect").jsonObject
            val chrome = MeeshyAnchoredSheetChrome.resolve(
                hasTitle = row.flag("title"),
                hasTrailing = row.flag("trailing"),
                hasCloseLabel = row.flag("closeLabel"),
                showsHandle = row.flag("showsHandle"),
                isDragDismissEnabled = row.flag("drag"),
                hasDetents = row.flag("detents"),
                outside = if (row.getValue("outside").jsonPrimitive.content == "dismisses") {
                    MeeshyAnchoredSheetOutside.Dismisses
                } else {
                    MeeshyAnchoredSheetOutside.PassesThrough
                },
                scrim = row.flag("scrim"),
            )
            val message = "$row"
            assertWithMessage(message).that(chrome.showsHandle).isEqualTo(expect.flag("handle"))
            assertWithMessage(message).that(chrome.handleIsAdjustable).isEqualTo(expect.flag("adjustable"))
            assertWithMessage(message).that(chrome.showsHeader).isEqualTo(expect.flag("header"))
            assertWithMessage(message).that(chrome.showsClose).isEqualTo(expect.flag("close"))
            assertWithMessage(message).that(chrome.showsScrim).isEqualTo(expect.flag("scrim"))
            assertWithMessage(message).that(chrome.isModal).isEqualTo(expect.flag("modal"))
        }
    }

    @Test
    fun `la poignee a crans dit agrandie sur le cran le plus haut, reduite ailleurs`() {
        rows("handleValue").forEach { row ->
            val expanded = MeeshyAnchoredSheetMetrics.isExpanded(row.getValue("index").jsonPrimitive.int, row.getValue("count").jsonPrimitive.int)
            assertWithMessage("$row").that(expanded).isEqualTo(row.flag("expanded"))
        }
    }

    @Test
    fun `la poignee, l'ombre et le voile de la planche vivent dans la loi, nulle part ailleurs`() {
        val chrome = vectors().getValue("chrome").jsonObject
        val handle = chrome.getValue("handle").jsonObject
        val shadow = chrome.getValue("shadow").jsonObject
        assertThat(MeeshyAnchoredSheetMetrics.HANDLE_WIDTH).isEqualTo(handle.float("width"))
        assertThat(MeeshyAnchoredSheetMetrics.HANDLE_HEIGHT).isEqualTo(handle.float("height"))
        assertThat(MeeshyAnchoredSheetMetrics.handleOpacity(MeeshyAnchoredSheetSurface.Dark)).isEqualTo(handle.float("opacityDark"))
        assertThat(MeeshyAnchoredSheetMetrics.handleOpacity(MeeshyAnchoredSheetSurface.Theme)).isEqualTo(handle.float("opacityTheme"))
        assertThat(MeeshyAnchoredSheetMetrics.SHADOW_RADIUS).isEqualTo(shadow.float("radius"))
        assertThat(MeeshyAnchoredSheetMetrics.SHADOW_Y_OFFSET).isEqualTo(shadow.float("y"))
        assertThat(MeeshyAnchoredSheetMetrics.SHADOW_OPACITY).isEqualTo(shadow.float("opacity"))
        assertThat(MeeshyAnchoredSheetMetrics.SCRIM_OPACITY).isEqualTo(chrome.float("scrimOpacity"))
        assertThat(MeeshyRadius.xxl.value).isEqualTo(chrome.float("radius"))
        assertThat(MeeshySpacing.xxl.value).isEqualTo(chrome.float("bottomMargin"))
        assertThat(MeeshyControlSize.tapTarget.value).isEqualTo(chrome.float("headerMinHeight"))
    }

    // endregion

    // region Contraste

    @Test
    fun `le titre tient 4,5 sur 1 et la poignee 3 sur 1 sur la surface sombre, calcules depuis la recette`() {
        val contrast = vectors().getValue("contrast").jsonObject
        val surface = MeeshyPalette.Indigo950
        val title = contrast(MeeshyMediaChromeColors.OnMedia, alpha = 1f, on = surface)
        val handle = contrast(MeeshyMediaChromeColors.OnMedia, MeeshyAnchoredSheetMetrics.HANDLE_OPACITY_DARK, on = surface)

        assertThat(title).isAtLeast(contrast.float("titleMin").toDouble())
        assertThat(handle).isAtLeast(contrast.float("handleMin").toDouble())
    }

    @Test
    fun `sur la surface du theme, clair et sombre - titre 4,5 sur 1, poignee 3 sur 1`() {
        val contrast = vectors().getValue("contrast").jsonObject
        listOf(false, true).forEach { isDark ->
            val surface = MeeshyAdaptiveColors.backgroundPrimary(isDark)
            val ink = MeeshyAdaptiveColors.textPrimary(isDark)
            val title = contrast(ink, alpha = 1f, on = surface)
            val handle = contrast(ink, MeeshyAnchoredSheetMetrics.HANDLE_OPACITY_THEME, on = surface)

            assertWithMessage("sombre=$isDark titre").that(title).isAtLeast(contrast.float("titleMin").toDouble())
            assertWithMessage("sombre=$isDark poignee").that(handle).isAtLeast(contrast.float("handleMin").toDouble())
        }
    }

    // endregion

    // region Mots

    @Test
    fun `le nom de la croix, celui de la poignee et celui de la zone hors feuille sont traduits dans les sept langues`() {
        val names = listOf(
            "kit_anchored_sheet_close", "kit_anchored_sheet_height", "kit_anchored_sheet_height_reduced",
            "kit_anchored_sheet_height_expanded", "kit_anchored_sheet_dismiss",
        )
        listOf("values", "values-fr", "values-es", "values-de", "values-it", "values-pt", "values-ar").forEach { folder ->
            val text = File(repositoryRoot(), "$RES/$folder").listFiles { f -> f.name.startsWith("strings") }.orEmpty()
                .joinToString("\n") { it.readText() }
            names.forEach { name ->
                assertWithMessage("$folder : $name").that(Regex("""<string name="$name">[^<]+</string>""").containsMatchIn(text)).isTrue()
            }
        }
    }

    // endregion

    // region Gardes de source

    @Test
    fun `aucun verre, aucune couleur en dur, aucun type du composer ni singleton dans les fichiers de K15`() {
        k15Sources().forEach { file ->
            val code = code(file)
            val name = file.name
            assertWithMessage("$name Color(0x").that(code).doesNotContain("Color(0x")
            assertWithMessage("$name Color.White").that(code).doesNotContain("Color.White")
            assertWithMessage("$name Color.Black").that(code).doesNotContain("Color.Black")
            assertWithMessage("$name MeeshyGlassSurface").that(code).doesNotContain("MeeshyGlassSurface")
            assertWithMessage("$name Composer").that(code).doesNotContain("Composer")
            assertWithMessage("$name blur").that(code).doesNotContain("blur(")
            assertWithMessage("$name app").that(code).doesNotContain("me.meeshy.app")
        }
    }

    @Test
    fun `la feuille lit sa loi 13 dans la loi pure, sans la reecrire`() {
        val code = code(File(repositoryRoot(), "$KIT/MeeshyAnchoredSheet.kt"))

        assertThat(code).contains("MeeshyAnchoredSheetChrome.resolve(")
        assertThat(code).contains("MeeshyAnchoredSheetMetrics.isExpanded(")
        assertThat(code).doesNotContain("outside == MeeshyAnchoredSheetOutside.Dismisses")
    }

    @Test
    fun `le decalage du doigt n'est lu qu'en phase de mise en page, jamais par le contenu`() {
        val code = code(File(repositoryRoot(), "$KIT/MeeshyAnchoredSheet.kt"))

        assertThat(code).contains(".offset { IntOffset(0, (restOffsetPx.value + dragPx).roundToInt()) }")
        assertThat(code).doesNotContain("graphicsLayer")
    }

    @Test
    fun `la place n'est publiee qu'au repos - elle ne lit jamais le decalage du doigt`() {
        val code = code(File(repositoryRoot(), "$KIT/MeeshyAnchoredSheet.kt"))
        val publication = code.substringAfter("val restPx").substringBefore("if (chrome.isModal)")

        assertThat(publication).contains("layout.rest")
        assertThat(publication).doesNotContain("dragPx")
    }

    // endregion

    // region Aides

    private fun contrast(ink: Color, alpha: Float, on: Color): Double {
        fun mixed(i: Float, s: Float): Float = i * alpha + s * (1 - alpha)
        val drawn = luminance(Color(mixed(ink.red, on.red), mixed(ink.green, on.green), mixed(ink.blue, on.blue)))
        val base = luminance(on)
        val lighter = maxOf(drawn, base)
        val darker = minOf(drawn, base)
        return (lighter + 0.05) / (darker + 0.05)
    }

    private fun luminance(color: Color): Double {
        fun channel(c: Float): Double = c.toDouble().let { if (it <= 0.03928) it / 12.92 else ((it + 0.055) / 1.055).pow(2.4) }
        return 0.2126 * channel(color.red) + 0.7152 * channel(color.green) + 0.0722 * channel(color.blue)
    }

    private fun height(row: JsonObject): MeeshyAnchoredSheetHeight = when (row.getValue("height").jsonPrimitive.content) {
        "content" -> MeeshyAnchoredSheetHeight.Content
        "compact" -> MeeshyAnchoredSheetHeight.Compact
        "regular" -> MeeshyAnchoredSheetHeight.Regular
        "tall" -> MeeshyAnchoredSheetHeight.Tall
        "fraction" -> MeeshyAnchoredSheetHeight.Fraction(row.float("fraction"))
        else -> MeeshyAnchoredSheetHeight.Detents(
            row.getValue("fractions").jsonArray.map { it.jsonPrimitive.float },
            row.getValue("initial").jsonPrimitive.int,
        )
    }

    private fun JsonObject.float(name: String): Float = getValue(name).jsonPrimitive.float

    private fun JsonObject.flag(name: String): Boolean = getValue(name).jsonPrimitive.booleanOrNull ?: error("$name n'est pas un booléen")

    private fun rows(key: String): List<JsonObject> = vectors().getValue(key).jsonArray.map { it.jsonObject }.also { assertThat(it).isNotEmpty() }

    private fun repositoryRoot(): File {
        val start = File("").absoluteFile
        return generateSequence(start) { it.parentFile }
            .firstOrNull { File(it, VECTORS).isFile }
            ?: File(start, "../..").canonicalFile.also { check(File(it, VECTORS).isFile) { "dépôt introuvable depuis ${start.absolutePath}" } }
    }

    private fun vectors(): JsonObject = Json.parseToJsonElement(File(repositoryRoot(), VECTORS).readText()).jsonObject

    private fun k15Sources(): List<File> =
        File(repositoryRoot(), KIT).listFiles { file -> file.extension == "kt" && file.name.startsWith("MeeshyAnchoredSheet") }.orEmpty().toList()
            .also { assertThat(it).hasSize(4) }

    /** Le code d'un fichier, commentaires retirés : une garde de source lit ce qui s'exécute, pas ce qui s'explique. */
    private fun code(file: File): String = file.readLines()
        .filterNot { it.trim().let { line -> line.startsWith("//") || line.startsWith("*") || line.startsWith("/*") } }
        .joinToString("\n")

    // endregion

    private companion object {
        const val VECTORS = "docs/product/kit/K15-MeeshyAnchoredSheet.vectors.json"
        const val KIT = "apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/kit"
        const val RES = "apps/android/sdk-ui/src/main/res"
        const val EPSILON = 0.0001f
    }
}
