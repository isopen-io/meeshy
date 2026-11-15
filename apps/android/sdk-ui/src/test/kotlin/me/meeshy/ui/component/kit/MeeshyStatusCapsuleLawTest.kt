package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.ui.theme.MeeshyControlSize
import org.junit.Test

/**
 * K14 — la capsule de statut : sa loi du temps, sa recette, ses natures et ses contrastes, lus sur les vecteurs partagés
 * (`docs/product/kit/K14-MeeshyStatusCapsule.vectors.json`, écrits par le lot iOS). Miroir de `MeeshyStatusCapsuleTests` (iOS).
 */
class MeeshyStatusCapsuleLawTest {

    private fun vectors(): JsonObject {
        val file = generateSequence(File("").absoluteFile) { it.parentFile }
            .map { File(it, "docs/product/kit/K14-MeeshyStatusCapsule.vectors.json") }
            .first { it.exists() }
        return Json.parseToJsonElement(file.readText()).jsonObject
    }

    private fun JsonObject.rowsOf(key: String): List<JsonObject> = getValue(key).jsonArray.map { it.jsonObject }

    private fun JsonObject.obj(key: String): JsonObject = getValue(key).jsonObject

    private fun JsonObject.int(key: String): Int = getValue(key).jsonPrimitive.int

    private fun JsonObject.intOrNull(key: String): Int? = getValue(key).takeUnless { it is JsonNull }?.jsonPrimitive?.int

    private fun JsonObject.double(key: String): Double = getValue(key).jsonPrimitive.double

    private fun JsonObject.bool(key: String): Boolean = getValue(key).jsonPrimitive.boolean

    private fun JsonObject.text(key: String): String = getValue(key).jsonPrimitive.content

    private fun JsonObject.textOrNull(key: String): String? = getValue(key).takeUnless { it is JsonNull }?.jsonPrimitive?.content

    private fun durationOf(row: JsonObject): MeeshyStatusCapsuleDuration = when (row.text("duration")) {
        "automatic" -> MeeshyStatusCapsuleDuration.Automatic
        "persistent" -> MeeshyStatusCapsuleDuration.Persistent
        else -> MeeshyStatusCapsuleDuration.Milliseconds(row.int("value"))
    }

    // region La loi du temps

    @Test
    fun `les durees de la loi sont celles des vecteurs`() {
        val timing = vectors().obj("timing")

        assertThat(MeeshyStatusCapsuleTiming.AUTOMATIC_MILLISECONDS).isEqualTo(timing.int("automaticMs"))
        assertThat(MeeshyStatusCapsuleTiming.SCREEN_READER_MILLISECONDS).isEqualTo(timing.int("screenReaderMs"))
        assertThat(MeeshyStatusCapsuleTiming.SILENCE_MILLISECONDS).isEqualTo(timing.int("silenceMs"))
    }

    @Test
    fun `la duree visible suit chaque couple duree action lecteur d'ecran`() {
        vectors().rowsOf("visible").forEach { row ->
            val visible = MeeshyStatusCapsuleTiming.visibleMilliseconds(
                duration = durationOf(row),
                hasAction = row.bool("hasAction"),
                isScreenReaderOn = row.bool("screenReader"),
            )

            assertThat(visible).isEqualTo(row.intOrNull("ms"))
        }
    }

    @Test
    fun `le meme id redit dans les deux secondes se tait, un autre id parle toujours`() {
        vectors().rowsOf("silence").forEach { row ->
            val last = row.textOrNull("lastId")?.let { MeeshyStatusCapsuleTiming.Spoken(id = it, atMillis = 0L) }

            val speaks = MeeshyStatusCapsuleTiming.speaks(id = row.text("id"), atMillis = row.int("elapsedMs").toLong(), last = last)

            assertThat(speaks).isEqualTo(row.bool("speaks"))
        }
    }

    // endregion

    // region Les natures

    @Test
    fun `la nature regle l'haptique, la priorite de l'annonce et le role, jamais la couleur`() {
        vectors().rowsOf("kinds").forEach { row ->
            val kind = MeeshyStatusCapsuleKind.entries.single { it.name.lowercase() == row.text("kind") }

            assertThat(kind.feedback.name.lowercase()).isEqualTo(row.text("haptic"))
            assertThat(if (kind.announcesUrgently) "high" else "normal").isEqualTo(row.text("priority"))
            assertThat(kind.role.name.lowercase()).isEqualTo(row.text("role"))
        }
    }

    // endregion

    // region La recette

    @Test
    fun `la recette porte les mesures de la planche`() {
        val recipe = vectors().obj("recipe")

        assertThat(MeeshyStatusCapsuleRecipe.radius.value).isEqualTo(recipe.double("radius").toFloat())
        assertThat(MeeshyStatusCapsuleRecipe.maxWidth.value).isEqualTo(recipe.double("maxWidth").toFloat())
        assertThat(MeeshyStatusCapsuleRecipe.paddingVertical.value).isEqualTo(recipe.double("paddingVertical").toFloat())
        assertThat(MeeshyStatusCapsuleRecipe.paddingHorizontal.value).isEqualTo(recipe.double("paddingHorizontal").toFloat())
        assertThat(MeeshyStatusCapsuleRecipe.gap.value).isEqualTo(recipe.double("gap").toFloat())
        assertThat(MeeshyStatusCapsuleRecipe.iconSize.value).isEqualTo(recipe.double("iconSize").toFloat())
        assertThat(MeeshyStatusCapsuleRecipe.messageSize.value).isEqualTo(recipe.double("messageSize").toFloat())
        assertThat(MeeshyStatusCapsuleRecipe.detailSize.value).isEqualTo(recipe.double("detailSize").toFloat())
        assertThat(MeeshyStatusCapsuleRecipe.actionHeight.value).isEqualTo(recipe.double("actionHeight").toFloat())
        assertThat(MeeshyStatusCapsuleRecipe.actionPaddingHorizontal.value).isEqualTo(recipe.double("actionPaddingHorizontal").toFloat())
        assertThat(MeeshyStatusCapsuleRecipe.actionGap.value).isEqualTo(recipe.double("actionGap").toFloat())
        assertThat(MeeshyStatusCapsuleRecipe.actionGlyphSize.value).isEqualTo(recipe.double("actionGlyphSize").toFloat())
        assertThat(MeeshyStatusCapsuleRecipe.actionSize.value).isEqualTo(recipe.double("actionSize").toFloat())
        assertThat(MeeshyStatusCapsuleRecipe.edgeGap.value).isEqualTo(recipe.double("edgeGap").toFloat())
        assertThat(MeeshyStatusCapsuleRecipe.sideMargin.value).isEqualTo(recipe.double("sideMargin").toFloat())
        assertThat(MeeshyStatusCapsuleRecipe.slideOffset.value).isEqualTo(recipe.double("slideOffset").toFloat())
        assertThat(MeeshyStatusCapsuleRecipe.REDUCED_FADE_MILLIS).isEqualTo(recipe.int("reducedFadeMs"))
        assertThat(MeeshyStatusCapsuleRecipe.dismissThreshold.value).isEqualTo(recipe.double("dismissThreshold").toFloat())
        assertThat(MeeshyStatusCapsuleRecipe.DETAIL_OPACITY.toDouble()).isWithin(1e-6).of(recipe.double("detailOpacity"))
        assertThat(MeeshyStatusCapsuleRecipe.ACTION_PRESSED_OPACITY.toDouble()).isWithin(1e-6).of(recipe.double("actionPressedOpacity"))
    }

    @Test
    fun `la cible tactile est de 48 dp sur Android et l'action se dessine en 36`() {
        val tapTarget = vectors().obj("recipe").obj("tapTarget")

        assertThat(MeeshyStatusCapsuleRecipe.tapTarget.value).isEqualTo(tapTarget.double("android").toFloat())
        assertThat(MeeshyStatusCapsuleRecipe.tapTarget).isEqualTo(MeeshyControlSize.minTouchTarget)
        assertThat(MeeshyStatusCapsuleRecipe.actionHeight).isEqualTo(MeeshyControlSize.regular)
    }

    @Test
    fun `deux lignes de message au plus, quatre en grande police ou l'action passe sous le texte`() {
        val recipe = vectors().obj("recipe")

        assertThat(MeeshyStatusCapsuleRecipe.messageLines(fontScale = 1f)).isEqualTo(recipe.int("messageLines"))
        assertThat(MeeshyStatusCapsuleRecipe.messageLines(fontScale = 2f)).isEqualTo(recipe.int("messageLinesLargeText"))
        assertThat(MeeshyStatusCapsuleRecipe.actionIsBelowText(fontScale = 1f)).isFalse()
        assertThat(MeeshyStatusCapsuleRecipe.actionIsBelowText(fontScale = 2f)).isTrue()
    }

    @Test
    fun `un message vide ne fait pas de capsule et un detail vide n'existe pas`() {
        assertThat(MeeshyStatusCapsuleRecipe.isVisible("")).isFalse()
        assertThat(MeeshyStatusCapsuleRecipe.isVisible("  \n")).isFalse()
        assertThat(MeeshyStatusCapsuleRecipe.isVisible("Limite atteinte")).isTrue()
        assertThat(MeeshyStatusCapsuleRecipe.visibleDetail("  ")).isNull()
        assertThat(MeeshyStatusCapsuleRecipe.visibleDetail(null)).isNull()
        assertThat(MeeshyStatusCapsuleRecipe.visibleDetail("Réessaie")).isEqualTo("Réessaie")
    }

    @Test
    fun `l'annonce dit le message puis le detail`() {
        assertThat(MeeshyStatusCapsuleRecipe.spokenText("Échec", "Réseau coupé")).isEqualTo("Échec, Réseau coupé")
        assertThat(MeeshyStatusCapsuleRecipe.spokenText("Échec", " ")).isEqualTo("Échec")
    }

    @Test
    fun `le detail est a 85 pour cent sauf en encre pleine sur le ton clair`() {
        assertThat(MeeshyStatusCapsuleRecipe.detailInkOpacity(MeeshyGlassTone.Deep)).isEqualTo(0.85f)
        assertThat(MeeshyStatusCapsuleRecipe.detailInkOpacity(MeeshyGlassTone.OnLight)).isEqualTo(1f)
    }

    @Test
    fun `sans action ni fermeture le toucher traverse jusqu'a la scene`() {
        assertThat(MeeshyStatusCapsuleRecipe.takesTouches(hasAction = false, hasDismiss = false)).isFalse()
        assertThat(MeeshyStatusCapsuleRecipe.takesTouches(hasAction = true, hasDismiss = false)).isTrue()
        assertThat(MeeshyStatusCapsuleRecipe.takesTouches(hasAction = false, hasDismiss = true)).isTrue()
    }

    @Test
    fun `l'ordre de lecture est le texte, l'action, puis la croix`() {
        val ordered = MeeshyStatusCapsulePart.entries.sortedBy { MeeshyStatusCapsuleRecipe.readingOrder(it) }

        assertThat(ordered).containsExactly(MeeshyStatusCapsulePart.Text, MeeshyStatusCapsulePart.Action, MeeshyStatusCapsulePart.Close).inOrder()
    }

    @Test
    fun `elle suit le doigt vers son bord seulement et se ferme a 24 dp`() {
        assertThat(MeeshyStatusCapsuleRecipe.dragOffset(30f, MeeshyStatusCapsuleEdge.Bottom)).isEqualTo(30f)
        assertThat(MeeshyStatusCapsuleRecipe.dragOffset(-30f, MeeshyStatusCapsuleEdge.Bottom)).isEqualTo(0f)
        assertThat(MeeshyStatusCapsuleRecipe.dragOffset(-30f, MeeshyStatusCapsuleEdge.Top)).isEqualTo(-30f)
        assertThat(MeeshyStatusCapsuleRecipe.dragOffset(30f, MeeshyStatusCapsuleEdge.Top)).isEqualTo(0f)
        assertThat(MeeshyStatusCapsuleRecipe.shouldDismiss(23.9f, MeeshyStatusCapsuleEdge.Bottom)).isFalse()
        assertThat(MeeshyStatusCapsuleRecipe.shouldDismiss(24f, MeeshyStatusCapsuleEdge.Bottom)).isTrue()
        assertThat(MeeshyStatusCapsuleRecipe.shouldDismiss(-24f, MeeshyStatusCapsuleEdge.Top)).isTrue()
        assertThat(MeeshyStatusCapsuleRecipe.shouldDismiss(-40f, MeeshyStatusCapsuleEdge.Bottom)).isFalse()
    }

    // endregion

    // region Le contraste, calculé depuis la recette

    @Test
    fun `le message, le detail et l'action tiennent le plancher de 4,5 au pire sur blanc pur`() {
        val contrast = vectors().obj("contrast")
        val floor = contrast.double("floor")

        assertThat(MeeshyStatusCapsuleRecipe.messageContrast(MeeshyGlassTone.Deep)).isAtLeast(contrast.double("messageDeepDense"))
        assertThat(MeeshyStatusCapsuleRecipe.messageContrast(MeeshyGlassTone.OnLight)).isAtLeast(contrast.double("messageOnLight"))
        assertThat(MeeshyStatusCapsuleRecipe.detailContrast(MeeshyGlassTone.Deep)).isAtLeast(contrast.double("detailDeepDense"))
        assertThat(MeeshyStatusCapsuleRecipe.actionContrast()).isAtLeast(contrast.double("actionOnWhite"))
        listOf(MeeshyGlassTone.Deep, MeeshyGlassTone.OnLight).forEach { tone ->
            assertThat(MeeshyStatusCapsuleRecipe.detailContrast(tone)).isAtLeast(floor)
        }
        assertThat(MeeshyStatusCapsuleRecipe.messageContrast(MeeshyGlassTone.Deep)).isAtLeast(floor)
    }

    // endregion

    // region Les éléments

    @Test
    fun `un element est egal par valeurs, jamais par fermetures`() {
        val one = MeeshyStatusCapsuleItem(id = "limit.text", message = "Limite", onDismiss = { })
        val again = MeeshyStatusCapsuleItem(id = "limit.text", message = "Limite", onDismiss = { })
        val redit = MeeshyStatusCapsuleItem(id = "limit.text", message = "Limite", onDismiss = { }, occurrence = 1)
        val noDismiss = MeeshyStatusCapsuleItem(id = "limit.text", message = "Limite")

        assertThat(one).isEqualTo(again)
        assertThat(one.hashCode()).isEqualTo(again.hashCode())
        assertThat(one).isNotEqualTo(redit)
        assertThat(one).isNotEqualTo(noDismiss)
    }

    @Test
    fun `une action est egale par ses mots`() {
        assertThat(MeeshyStatusCapsuleAction("Réessayer") { }).isEqualTo(MeeshyStatusCapsuleAction("Réessayer") { })
        assertThat(MeeshyStatusCapsuleAction("Réessayer") { }).isNotEqualTo(MeeshyStatusCapsuleAction("Annuler") { })
    }

    // endregion

    // region Les gardes de source

    @Test
    fun `aucun verre dessine, aucune couleur en dur, aucun retour haptique maison ni singleton dans les fichiers de K14`() {
        val forbidden = listOf(
            "MeeshyGlassSurface", "meeshyComposerGlass", "composerInnerGlass", "liquidGlass", "RenderEffect", "BlurEffect", ".blur(",
            "Color(0x", "Color.White", "Color.Black", "performHapticFeedback", "LocalHapticFeedback", "HapticFeedbackType",
            "getInstance(", ".shared",
        )
        val sources = k14Sources()

        assertThat(sources.map { it.name }).containsExactly(
            "MeeshyStatusCapsule.kt", "MeeshyStatusCapsuleHost.kt", "MeeshyStatusCapsuleRecipe.kt",
        )
        sources.forEach { file ->
            val code = withoutComments(file.readText())
            forbidden.forEach { word -> assertWithMessage("${file.name} contient $word").that(code.contains(word)).isFalse() }
        }
    }

    private fun withoutComments(source: String): String =
        source
            .replace(Regex("""/\*.*?\*/""", RegexOption.DOT_MATCHES_ALL), "")
            .replace(Regex("""//[^\n]*"""), "")

    private fun k14Sources(): List<File> {
        val root = generateSequence(File("").absoluteFile) { it.parentFile }
            .first { File(it, "docs/product/kit/K14-MeeshyStatusCapsule.vectors.json").exists() }
        return File(root, "apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/kit")
            .listFiles { file -> file.name.startsWith("MeeshyStatusCapsule") && file.extension == "kt" }
            .orEmpty()
            .toList()
    }

    // endregion
}
