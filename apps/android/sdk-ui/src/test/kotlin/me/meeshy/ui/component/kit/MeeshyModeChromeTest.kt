package me.meeshy.ui.component.kit

import androidx.compose.ui.graphics.luminance
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import kotlin.math.pow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.model.theme.CanvasChromeScheme
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyPalette
import org.junit.Test

/**
 * K16 — le cadre d'un mode plein écran, lu comme des VALEURS : un composable ne s'inspecte pas, ses lois si. Chaque témoin
 * interroge une loi pure (la loi 13, l'ajustement de l'en-tête, la hauteur de la plaque, le mouvement, la tenue de la
 * capsule) contre le fichier de vecteurs de parité commun aux trois plateformes
 * (`docs/product/kit/K16-MeeshyModeChrome.vectors.json`). Miroir de `MeeshyModeChromeTests` (iOS). Le rendu et les gestes
 * vivent dans `MeeshyModeChromeBehaviorTest`.
 */
class MeeshyModeChromeTest {

    // region La recette

    @Test
    fun `les mesures de la recette sont celles des vecteurs`() {
        val recipe = vectors().getValue("recipe").jsonObject
        assertThat(MeeshyModeChromeRecipe.capsuleHeight).isEqualTo(recipe.float("capsuleHeight"))
        assertThat(MeeshyModeChromeRecipe.capsuleMargin).isEqualTo(recipe.float("capsuleMargin"))
        assertThat(MeeshyModeChromeRecipe.glyphGap).isEqualTo(recipe.float("glyphGap"))
        assertThat(MeeshyModeChromeRecipe.glyphSize).isEqualTo(recipe.float("glyphSize"))
        assertThat(MeeshyModeChromeRecipe.checkSize).isEqualTo(recipe.float("checkSize"))
        assertThat(MeeshyModeChromeRecipe.itemGap).isEqualTo(recipe.float("itemGap"))
        assertThat(MeeshyModeChromeRecipe.headerInset).isEqualTo(recipe.float("headerInset"))
        assertThat(MeeshyModeChromeRecipe.wideHeaderInset).isEqualTo(recipe.float("wideHeaderInset"))
        assertThat(MeeshyModeChromeRecipe.MINIMUM_LABEL_SCALE).isEqualTo(recipe.float("minimumLabelScale"))
        assertThat(MeeshyModeChromeRecipe.plateEdge).isEqualTo(recipe.float("plateEdge"))
        assertThat(MeeshyModeChromeRecipe.plateRadius).isEqualTo(recipe.float("plateRadius"))
        assertThat(MeeshyModeChromeRecipe.plateHorizontalPadding).isEqualTo(recipe.float("plateHorizontalPadding"))
        assertThat(MeeshyModeChromeRecipe.plateVerticalPadding).isEqualTo(recipe.float("plateVerticalPadding"))
        assertThat(MeeshyModeChromeRecipe.plateGap).isEqualTo(recipe.float("plateGap"))
        assertThat(MeeshyModeChromeRecipe.plateBottomGap).isEqualTo(recipe.float("plateBottomGap"))
        assertThat(MeeshyModeChromeRecipe.PLATE_MINIMUM_BOTTOM).isEqualTo(recipe.float("plateMinimumBottom"))
        assertThat(MeeshyModeChromeRecipe.PLATE_CEILING_SHARE).isEqualTo(recipe.float("plateCeilingShare"))
        assertThat(MeeshyModeChromeRecipe.PLATE_FLOOR).isEqualTo(recipe.float("plateFloor"))
        assertThat(MeeshyModeChromeRecipe.WIDE_PLATE_WIDTH).isEqualTo(recipe.float("widePlateWidth"))
        assertThat(MeeshyModeChromeRecipe.TRAVEL).isEqualTo(recipe.float("travel"))
        assertThat(MeeshyModeChromeRecipe.ENTER_MILLIS).isEqualTo(recipe.int("enterMs"))
        assertThat(MeeshyModeChromeRecipe.EXIT_MILLIS).isEqualTo(recipe.int("exitMs"))
        assertThat(MeeshyModeChromeRecipe.FADE_MILLIS).isEqualTo(recipe.int("fadeMs"))
        assertThat(MeeshyModeChromeRecipe.CONTENT_FADE_MILLIS).isEqualTo(recipe.int("contentFadeMs"))
        assertThat(MeeshyGlassButtonRecipe.REST_FILL_OPACITY).isEqualTo(recipe.float("restFillOpacity"))
        assertThat(MeeshyGlassButtonRecipe.PRESSED_ACTIVE_FILL_OPACITY).isEqualTo(recipe.float("pressedFillOpacity"))
    }

    @Test
    fun `les retraits - 14 sur telephone, 24 sur grand ecran - et la cible de 48 dp qui deborde la capsule de 44`() {
        assertThat(MeeshyModeChromeRecipe.headerInset(isWide = false)).isEqualTo(14f)
        assertThat(MeeshyModeChromeRecipe.headerInset(isWide = true)).isEqualTo(24f)
        assertThat(MeeshyModeChromeRecipe.touchSlack).isEqualTo(2f)
    }

    // endregion

    // region La loi 13

    @Test
    fun `loi 13 - ni validation, ni centre, ni accessoire, ni plaque hors de leurs conditions - range, rien et aucun toucher`() {
        val rows = rows("rule")
        assertThat(rows).isNotEmpty()
        rows.forEach { row ->
            val rule = MeeshyModeChromeRule.resolve(
                hasConfirm = row.bool("hasConfirm"),
                hasCenter = row.bool("hasCenter"),
                hasAccessory = row.bool("hasAccessory"),
                hasPlate = row.bool("hasPlate"),
                presence = presence(row.string("presence")),
            )
            val label = row.toString()
            assertWithMessage("$label en-tete").that(rule.showsHeader).isEqualTo(row.bool("showsHeader"))
            assertWithMessage("$label quitter").that(rule.showsExit).isEqualTo(row.bool("showsExit"))
            assertWithMessage("$label validation").that(rule.showsConfirm).isEqualTo(row.bool("showsConfirm"))
            assertWithMessage("$label centre").that(rule.showsCenter).isEqualTo(row.bool("showsCenter"))
            assertWithMessage("$label accessoire").that(rule.showsAccessory).isEqualTo(row.bool("showsAccessory"))
            assertWithMessage("$label plaque").that(rule.showsPlate).isEqualTo(row.bool("showsPlate"))
            assertWithMessage("$label touchers").that(rule.acceptsTouches).isEqualTo(row.bool("acceptsTouches"))
        }
    }

    @Test
    fun `range - rien de visible ni de touchable, quoi que l'hote ait fourni`() {
        val rule = MeeshyModeChromeRule.resolve(
            hasConfirm = true, hasCenter = true, hasAccessory = true, hasPlate = true, presence = MeeshyModeChromePresence.Stowed,
        )

        assertThat(rule).isEqualTo(
            MeeshyModeChromeRule(
                showsHeader = false, showsExit = false, showsConfirm = false, showsCenter = false,
                showsAccessory = false, showsPlate = false, acceptsTouches = false,
            ),
        )
    }

    // endregion

    // region La capsule

    @Test
    fun `la largeur d'une capsule - marges, glyphe, titre a l'echelle, jamais sous 44`() {
        rows("capsuleWidth").forEach { row ->
            val width = MeeshyModeChromeRecipe.capsuleWidth(
                textWidth = row.float("textWidth"),
                hasGlyph = row.bool("hasGlyph"),
                display = display(row.string("display")),
                labelScale = row.float("labelScale"),
            )
            assertWithMessage(row.toString()).that(width).isWithin(TOLERANCE).of(row.float("width"))
            assertThat(width).isAtLeast(44f)
        }
    }

    @Test
    fun `sans glyphe, un affichage qui le demande retombe sur le titre`() {
        MeeshyModeCapsuleDisplay.entries.forEach {
            assertThat(MeeshyModeChromeRecipe.effectiveDisplay(it, hasGlyph = false)).isEqualTo(MeeshyModeCapsuleDisplay.Title)
            assertThat(MeeshyModeChromeRecipe.effectiveDisplay(it, hasGlyph = true)).isEqualTo(it)
        }
    }

    @Test
    fun `la capsule pleine prend le fond, l'encre et l'ombre de l'actif de K02 - le verre ne peint rien`() {
        rows("style").forEach { row ->
            val style = MeeshyModeCapsuleStyle.resolve(
                kind = kind(row.string("kind")),
                isPressed = row.bool("pressed"),
                isEnabled = row.bool("enabled"),
                isBusy = row.bool("busy"),
            )
            val label = row.toString()
            assertWithMessage("$label fond").that(style.fillOpacity).isEqualTo(row.float("fillOpacity"))
            assertWithMessage("$label ombre").that(style.shadow != null).isEqualTo(row.bool("shadow"))
            assertWithMessage("$label opacite").that(style.opacity).isEqualTo(row.float("opacity"))
            assertWithMessage("$label reponse au toucher").that(style.respondsToTouch).isEqualTo(row.bool("responds"))
            assertWithMessage("$label encre pleine").that(style.inkIsSolid).isEqualTo(style.kind == MeeshyModeCapsuleKind.Solid)
        }
    }

    @Test
    fun `l'ombre de la capsule pleine est celle de l'actif de K02`() {
        val active = MeeshyGlassButtonRecipe.resolve(MeeshyGlassButtonKind.Active, MeeshyGlassButtonSize.S44)

        val style = MeeshyModeCapsuleStyle.resolve(MeeshyModeCapsuleKind.Solid, isPressed = false, isEnabled = true, isBusy = false)

        assertThat(style.shadow).isEqualTo(active.shadow)
    }

    @Test
    fun `l'action part UNE fois avec UN impact leger - rien si desactivee ou occupee`() {
        var impacts = 0
        var calls = 0
        val play: (MeeshyGlassButtonHaptic) -> Unit = { impacts += 1 }
        val action = { calls += 1 }
        fun values(enabled: Boolean = true, busy: Boolean = false, haptic: MeeshyGlassButtonHaptic = MeeshyGlassButtonHaptic.Light) =
            MeeshyModeActionValues("Valider", null, MeeshyModeCapsuleDisplay.Title, null, enabled, busy, haptic)

        assertThat(values().perform(play, action)).isTrue()
        assertThat(calls to impacts).isEqualTo(1 to 1)

        assertThat(values(enabled = false).perform(play, action)).isFalse()
        assertThat(values(busy = true).perform(play, action)).isFalse()
        assertThat(calls to impacts).isEqualTo(1 to 1)

        assertThat(values(haptic = MeeshyGlassButtonHaptic.None).perform(play, action)).isTrue()
        assertThat(calls to impacts).isEqualTo(2 to 1)
    }

    @Test
    fun `le nom d'une action est obligatoire et non vide, meme en coche`() {
        val failure = runCatching { MeeshyModeAction(title = "", onClick = {}) }.exceptionOrNull()

        assertThat(failure).isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `les valeurs d'une action se comparent sans la fermeture`() {
        val first = MeeshyModeAction(title = "Valider", onClick = {})
        val second = MeeshyModeAction(title = "Valider", onClick = { })
        val other = MeeshyModeAction(title = "Valider", onClick = {}, busy = true)

        assertThat(first.values).isEqualTo(second.values)
        assertThat(first.values).isNotEqualTo(other.values)
    }

    // endregion

    // region L'ajustement de l'en-tete

    @Test
    fun `la largeur requise - cotes joints par l'ecart, centre pose au milieu du cadre`() {
        rows("requiredWidth").forEach { row ->
            val width = MeeshyModeHeaderFit.requiredWidth(
                exit = row.float("exit"),
                center = row.floatOrNull("center"),
                accessory = row.floatOrNull("accessory"),
                confirm = row.floatOrNull("confirm"),
            )
            assertWithMessage(row.toString()).that(width).isWithin(TOLERANCE).of(row.float("width"))
        }
    }

    @Test
    fun `chaque vecteur de largeurs rend la reduction attendue, dans l'ordre - centre, validation, libelles`() {
        rows("fit").forEach { row ->
            val result = MeeshyModeHeaderFit.resolve(
                available = row.float("available"),
                exit = item(row.getValue("exit")),
                center = row["center"]?.takeUnless { it is JsonNull }?.let(::item),
                accessory = row.floatOrNull("accessory"),
                confirm = row["confirm"]?.takeUnless { it is JsonNull }?.let(::item),
            )
            val label = row.string("case")
            assertWithMessage("$label pas").that(result.step).isEqualTo(step(row.string("step")))
            assertWithMessage("$label largeur").that(result.width).isWithin(TOLERANCE).of(row.float("width"))
            assertWithMessage("$label tient").that(result.fits).isEqualTo(row.bool("fits"))
        }
    }

    @Test
    fun `l'ordre des pas - le centre d'abord, la validation ensuite, les libelles en dernier`() {
        assertThat(MeeshyModeHeaderFit.Step.entries).containsExactly(
            MeeshyModeHeaderFit.Step.Full,
            MeeshyModeHeaderFit.Step.CenterGlyph,
            MeeshyModeHeaderFit.Step.ConfirmGlyph,
            MeeshyModeHeaderFit.Step.Compact,
        ).inOrder()
        assertThat(MeeshyModeHeaderFit.Step.entries.map { it.reducesCenter }).containsExactly(false, true, true, true).inOrder()
        assertThat(MeeshyModeHeaderFit.Step.entries.map { it.reducesConfirm }).containsExactly(false, false, true, true).inOrder()
        assertThat(MeeshyModeHeaderFit.Step.entries.map { it.labelScale }).containsExactly(1f, 1f, 1f, 0.8f).inOrder()
    }

    @Test
    fun `le partage de la place - le centre cede d'abord, puis la validation, Quitter en dernier`() {
        rows("allocate").forEach { row ->
            val allocation = MeeshyModeHeaderFit.allocate(
                available = row.float("available"),
                exit = row.float("exit"),
                center = row.floatOrNull("center"),
                accessory = row.floatOrNull("accessory"),
                confirm = row.floatOrNull("confirm"),
            )
            val expected = row.getValue("allocation").jsonObject
            val label = row.toString()
            assertWithMessage("$label quitter").that(allocation.exit).isWithin(TOLERANCE).of(expected.float("exit"))
            assertNullableWidth("$label centre", allocation.center, expected.floatOrNull("center"))
            assertNullableWidth("$label accessoire", allocation.accessory, expected.floatOrNull("accessory"))
            assertNullableWidth("$label validation", allocation.confirm, expected.floatOrNull("confirm"))
        }
    }

    @Test
    fun `une place non finie ou negative ne casse rien`() {
        val nan = MeeshyModeHeaderFit.allocate(available = Float.NaN, exit = 80f, center = null, accessory = null, confirm = 100f)
        val negative = MeeshyModeHeaderFit.resolve(
            available = -5f,
            exit = MeeshyModeHeaderFit.Item(52f, hasGlyph = false, display = MeeshyModeCapsuleDisplay.Title),
            center = null,
            accessory = null,
            confirm = null,
        )

        assertThat(nan.exit).isEqualTo(0f)
        assertThat(negative.fits).isFalse()
    }

    // endregion

    // region La plaque

    @Test
    fun `le plafond - 42 pour cent de la fenetre, jamais sous 160, jamais d'entree non finie`() {
        plate("maxHeight").forEach { row ->
            val maxHeight = MeeshyModePlateMetrics.maxHeight(row.float("windowHeight"))
            assertWithMessage(row.toString()).that(maxHeight).isWithin(TOLERANCE).of(row.float("maxHeight"))
        }
    }

    @Test
    fun `la plaque epouse son contenu - au moins 1, plafonnee`() {
        plate("height").forEach { row ->
            val height = MeeshyModePlateMetrics.height(row.float("content"), row.float("windowHeight"))
            assertWithMessage(row.toString()).that(height).isWithin(TOLERANCE).of(row.float("height"))
        }
    }

    @Test
    fun `elle defile des que son contenu depasse le plafond`() {
        plate("scrolls").forEach { row ->
            val scrolls = MeeshyModePlateMetrics.scrolls(row.float("content"), row.float("windowHeight"))
            assertWithMessage(row.toString()).that(scrolls).isEqualTo(row.bool("scrolls"))
        }
    }

    @Test
    fun `le bas - la zone sure plus 12, jamais sous 28`() {
        plate("bottom").forEach { row ->
            assertWithMessage(row.toString()).that(MeeshyModePlateMetrics.bottomMargin(row.float("safeBottom"))).isEqualTo(row.float("bottom"))
        }
    }

    @Test
    fun `la largeur - la place moins deux bords de 12, bornee par l'hote`() {
        plate("width").forEach { row ->
            val width = MeeshyModePlateMetrics.width(row.float("available"), row.floatOrNull("maxWidth"))
            assertWithMessage(row.toString()).that(width).isEqualTo(row.float("width"))
        }
    }

    // endregion

    // region Le mouvement

    @Test
    fun `le mouvement - translation de 12 et 250 ms a l'entree, 200 ms a la sortie - mouvement reduit, fondu de 150 ms`() {
        rows("motion").forEach { row ->
            val motion = MeeshyModeChromeRecipe.motion(reduceMotion = row.bool("reduceMotion"))
            val label = row.toString()
            assertWithMessage("$label deplacement").that(motion.travelDp).isEqualTo(row.float("travel"))
            assertWithMessage("$label entree").that(motion.enterMillis).isEqualTo(row.int("enterMs"))
            assertWithMessage("$label sortie").that(motion.exitMillis).isEqualTo(row.int("exitMs"))
            assertWithMessage("$label fondu seul").that(motion.isFadeOnly).isEqualTo(row.bool("fadeOnly"))
        }
    }

    @Test
    fun `la duree suit la presence visee`() {
        val motion = MeeshyModeChromeRecipe.motion(reduceMotion = false)

        assertThat(motion.durationToward(MeeshyModeChromePresence.Shown)).isEqualTo(250)
        assertThat(motion.durationToward(MeeshyModeChromePresence.Stowed)).isEqualTo(200)
    }

    // endregion

    // region Le contraste

    @Test
    fun `l'encre indigo950 sur la capsule pleine - 15,99 pour 1 - le libelle blanc sur le verre dense - 6,12 et 5,07`() {
        val vectors = vectors().getValue("contrast").jsonObject
        val recipe = MeeshyGlassButtonRecipe.resolve(MeeshyGlassButtonKind.Active, MeeshyGlassButtonSize.S44)

        val solid = CanvasChromeScheme.contrastRatio(
            MeeshyPalette.Indigo950.luminance().toDouble(), MeeshyMediaChromeColors.OnMedia.luminance().toDouble(),
        )
        assertThat(recipe.ink).isEqualTo(MeeshyGlassButtonInk.OnSolid)
        assertThat(solid).isWithin(0.01).of(vectors.double("solidInkOnFill"))
        assertThat(glassContrast(MeeshyGlassTone.Deep)).isAtLeast(vectors.double("glassDeepDense"))
        assertThat(glassContrast(MeeshyGlassTone.OnLight)).isAtLeast(vectors.double("glassOnLightDense"))
    }

    // endregion

    // region Les sources

    @Test
    fun `aucun verre ecrit a la main, aucune couleur ni rayon en dur, aucune legende, aucun type du composer ni des appels`() {
        val forbidden = listOf(
            "MeeshyGlassSurface", "meeshyComposerGlass", "composerInnerGlass", "liquidGlassRim", "liquidGlassSheen",
            "BlurEffect", "Modifier.blur", "Color(0x", "Color(0X", "Color.White", "Color.Black", "Color.Gray", "Color.Red",
            "Color.Transparent.copy", "RoundedCornerShape(1", "RoundedCornerShape(2", "RoundedCornerShape(3",
            "Composer", "Story", "Call", "HapticFeedback", "0x",
        )
        val sources = k16Sources()
        assertThat(sources.map { it.name }).containsAtLeast(
            "MeeshyModeChrome.kt", "MeeshyModeHeader.kt", "MeeshyModePlate.kt", "MeeshyModeCapsule.kt",
            "MeeshyModeChromeRecipe.kt", "MeeshyModeChromeRule.kt",
        )
        sources.forEach { file ->
            val code = file.readLines().filterNot { it.trim().let { line -> line.startsWith("//") || line.startsWith("*") || line.startsWith("/*") } }
                .joinToString("\n")
            forbidden.forEach { word -> assertWithMessage("${file.name} contient $word").that(code.contains(word)).isFalse() }
        }
    }

    @Test
    fun `la roue d'une capsule occupee est celle du systeme - aucune roue redessinee`() {
        val capsule = k16Sources().single { it.name == "MeeshyModeCapsule.kt" }.readText()

        assertThat(capsule).contains("CircularProgressIndicator(")
        listOf("rememberInfiniteTransition", "drawArc", "infiniteRepeatable").forEach { word ->
            assertWithMessage("MeeshyModeCapsule.kt redessine la roue : $word").that(capsule.contains(word)).isFalse()
        }
    }

    // endregion

    // region Aides

    private fun assertNullableWidth(label: String, actual: Float?, expected: Float?) {
        if (expected == null) {
            assertWithMessage(label).that(actual).isNull()
        } else {
            assertWithMessage(label).that(actual).isNotNull()
            assertWithMessage(label).that(actual!!).isWithin(TOLERANCE).of(expected)
        }
    }

    private fun item(element: JsonElement): MeeshyModeHeaderFit.Item {
        val row = element.jsonObject
        return MeeshyModeHeaderFit.Item(row.float("textWidth"), row.bool("hasGlyph"), display(row.string("display")))
    }

    private fun presence(name: String): MeeshyModeChromePresence = when (name) {
        "shown" -> MeeshyModeChromePresence.Shown
        "stowed" -> MeeshyModeChromePresence.Stowed
        else -> error("presence inconnue dans les vecteurs : $name")
    }

    private fun display(name: String): MeeshyModeCapsuleDisplay = when (name) {
        "title" -> MeeshyModeCapsuleDisplay.Title
        "glyph" -> MeeshyModeCapsuleDisplay.Glyph
        "glyphAndTitle" -> MeeshyModeCapsuleDisplay.GlyphAndTitle
        else -> error("affichage inconnu dans les vecteurs : $name")
    }

    private fun kind(name: String): MeeshyModeCapsuleKind = when (name) {
        "glass" -> MeeshyModeCapsuleKind.Glass
        "solid" -> MeeshyModeCapsuleKind.Solid
        else -> error("tenue inconnue dans les vecteurs : $name")
    }

    private fun step(name: String): MeeshyModeHeaderFit.Step = when (name) {
        "full" -> MeeshyModeHeaderFit.Step.Full
        "centerGlyph" -> MeeshyModeHeaderFit.Step.CenterGlyph
        "confirmGlyph" -> MeeshyModeHeaderFit.Step.ConfirmGlyph
        "compact" -> MeeshyModeHeaderFit.Step.Compact
        else -> error("pas inconnu dans les vecteurs : $name")
    }

    /** Le contraste de l'encre blanche sur le pire fond du ton, recouvert du remplissage DENSE de la recette de K01. */
    private fun glassContrast(tone: MeeshyGlassTone): Double {
        val recipe = MeeshyGlassRecipe.resolve(
            tone = tone,
            density = MeeshyGlassDensity.Dense,
            isTinted = false,
            isInteractive = false,
            isPressed = false,
            material = MeeshyGlassMaterial.Drawn,
            reduceMotion = false,
            isDark = false,
            isNested = false,
            isHovered = false,
        )
        val backdrop = encoded(if (tone == MeeshyGlassTone.Plain) MeeshyGlassTone.PLAIN_CEILING.toDouble() else 1.0)
        val inkLevel = if (recipe.fill == MeeshyGlassFill.Light) 1.0 else 0.0
        val covered = backdrop * (1 - recipe.fillOpacity) + inkLevel * recipe.fillOpacity
        return CanvasChromeScheme.contrastRatio(1.0, CanvasChromeScheme.luminance(covered, covered, covered))
    }

    private fun encoded(luminance: Double): Double =
        if (luminance <= 0.0031308) luminance * 12.92 else 1.055 * luminance.pow(1 / 2.4) - 0.055

    private fun k16Sources(): List<File> =
        File(repositoryRoot(), "apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/kit")
            .listFiles { file -> file.name.startsWith("MeeshyMode") && file.extension == "kt" }
            .orEmpty()
            .toList()

    private fun repositoryRoot(): File {
        val start = File("").absoluteFile
        return generateSequence(start) { it.parentFile }
            .firstOrNull { File(it, VECTORS).isFile }
            ?: File(start, "../..").canonicalFile.also { check(File(it, VECTORS).isFile) { "dépôt introuvable depuis ${start.absolutePath}" } }
    }

    private fun vectors(): JsonObject = Json.parseToJsonElement(File(repositoryRoot(), VECTORS).readText()).jsonObject

    private fun rows(key: String): List<JsonObject> = vectors().getValue(key).jsonArray.map { it.jsonObject }

    private fun plate(key: String): List<JsonObject> = vectors().getValue("plate").jsonObject.getValue(key).jsonArray.map { it.jsonObject }

    private fun JsonObject.string(name: String): String = getValue(name).jsonPrimitive.content

    private fun JsonObject.bool(name: String): Boolean = getValue(name).jsonPrimitive.booleanOrNull!!

    private fun JsonObject.int(name: String): Int = getValue(name).jsonPrimitive.doubleOrNull!!.toInt()

    private fun JsonObject.double(name: String): Double = getValue(name).jsonPrimitive.doubleOrNull!!

    private fun JsonObject.float(name: String): Float = numeric(getValue(name))!!

    private fun JsonObject.floatOrNull(name: String): Float? = this[name]?.let(::numeric)

    /** Un nombre des vecteurs ; `"nan"` est le seul texte admis, il devient un non-nombre ; `null` reste absent. */
    private fun numeric(element: JsonElement): Float? {
        if (element is JsonNull) return null
        val primitive: JsonPrimitive = element.jsonPrimitive
        return primitive.doubleOrNull?.toFloat() ?: if (primitive.contentOrNull == "nan") Float.NaN else error("nombre attendu : $primitive")
    }

    // endregion

    private companion object {
        const val VECTORS = "docs/product/kit/K16-MeeshyModeChrome.vectors.json"
        const val TOLERANCE = 0.01f
    }
}
