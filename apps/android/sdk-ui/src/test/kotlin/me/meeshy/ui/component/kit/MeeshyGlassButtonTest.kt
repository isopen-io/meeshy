package me.meeshy.ui.component.kit

import androidx.compose.ui.graphics.Color
import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.float
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.meeshy.sdk.model.theme.CanvasChromeScheme
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyPalette
import org.junit.Test

/**
 * K02 — le bouton rond de verre, lu comme des VALEURS : un composable ne s'inspecte pas, sa recette si. Chaque témoin
 * interroge la recette, la loi du lecteur d'écran ou celle de l'activation, jamais un rendu. Miroir de
 * `MeeshyGlassButtonTests` (iOS), et même fichier de vecteurs de parité
 * (`docs/product/kit/K02-MeeshyGlassButton.vectors.json`).
 *
 * Écarts assumés avec iOS : Android n'a pas de Liquid Glass du système, donc les lignes `liquid` des vecteurs ne
 * s'appliquent pas, et le destructif n'y est jamais un verre teinté (il est rouge plein, comme sur un verre dessiné) ; la
 * cible tactile est de 48 dp.
 */
class MeeshyGlassButtonTest {

    // region Les tailles

    @Test
    fun `les quatre tailles suivent les vecteurs - diametre, glyphe, cible et debord`() {
        val android = vectors().getValue("tapTarget").jsonObject.getValue("android").jsonPrimitive.float
        sizes().forEach { (size, row) ->
            assertThat(size.diameterDp).isEqualTo(row.float("diameter"))
            assertThat(size.glyphSizeDp).isEqualTo(row.float("glyph"))
            assertThat(size.targetSideDp).isEqualTo(maxOf(row.float("diameter"), android))
            assertThat(size.hitSlackDp).isEqualTo((size.targetSideDp - size.diameterDp) / 2f)
        }
    }

    @Test
    fun `la cible d'une taille n'est jamais sous 48 dp et l'encombrement reste le diametre`() {
        MeeshyGlassButtonSize.entries.forEach {
            assertThat(it.targetSideDp).isAtLeast(48f)
            assertThat(it.targetSideDp).isAtLeast(it.diameterDp)
        }
        assertThat(MeeshyGlassButtonSize.S36.hitSlackDp).isEqualTo(6f)
        assertThat(MeeshyGlassButtonSize.S48.hitSlackDp).isEqualTo(0f)
    }

    // endregion

    // region La recette, etat par etat

    @Test
    fun `chaque etat, emboitement et matiere dessinee rend le fond, la demande a K01 et le voile des vecteurs`() {
        val rows = vectors().getValue("matter").jsonArray.map { it.jsonObject }.filter { it.string("material") != "liquid" }
        assertThat(rows).isNotEmpty()
        rows.forEach { row ->
            val nested = row.getValue("nested").jsonPrimitive.booleanOrNull!!
            val kind = kind(row.string("kind"))
            val rest = recipe(kind, nested = nested)
            val pressed = recipe(kind, nested = nested, pressed = true)
            val hovered = recipe(kind, nested = nested, hovered = true)
            val label = "${row.string("kind")} ${row.string("material")} emboite=$nested"

            assertWithMessage("$label fond").that(rest.fill).isEqualTo(fill(row.string("fill")))
            assertWithMessage("$label verre").that(rest.glass).isEqualTo(glass(row.string("glass")))
            assertWithMessage("$label repos").that(rest.fillOpacity).isEqualTo(row.float("restFill"))
            assertWithMessage("$label appuye").that(pressed.fillOpacity).isEqualTo(row.float("pressedFill"))
            assertWithMessage("$label survole").that(hovered.fillOpacity).isEqualTo(row.float("hoveredFill"))
            assertWithMessage("$label voile appuye").that(pressed.pressVeilOpacity).isEqualTo(row.float("pressedVeil"))
            assertWithMessage("$label voile survole").that(hovered.pressVeilOpacity).isEqualTo(row.float("hoveredVeil"))
            assertWithMessage("$label voile au repos").that(rest.pressVeilOpacity).isEqualTo(0f)
        }
    }

    @Test
    fun `le repos differe du presse pour chaque etat - la reponse existe partout`() {
        MeeshyGlassButtonKind.entries.forEach { kind ->
            listOf(false, true).forEach { nested ->
                val rest = recipe(kind, nested = nested)
                val pressed = recipe(kind, nested = nested, pressed = true)
                val answers = pressed.fillOpacity != rest.fillOpacity || pressed.pressVeilOpacity != rest.pressVeilOpacity
                val glassAnswers = pressed.glass == MeeshyGlassButtonGlassRequest.Neutral && !nested
                assertWithMessage("$kind emboite=$nested").that(answers || glassAnswers).isTrue()
            }
        }
    }

    @Test
    fun `le normal dans un conteneur n'a aucun fond et le doux est un voile sans flou`() {
        val normal = recipe(MeeshyGlassButtonKind.Normal, nested = true)
        val soft = recipe(MeeshyGlassButtonKind.Soft)

        assertThat(normal.fill).isEqualTo(MeeshyGlassButtonFill.Clear)
        assertThat(normal.fillOpacity).isEqualTo(0f)
        assertThat(soft.fill).isEqualTo(MeeshyGlassButtonFill.Veil)
        assertThat(soft.glass).isEqualTo(MeeshyGlassButtonGlassRequest.None)
    }

    @Test
    fun `l'actif porte l'ombre de la planche - le flou de CSS devient un rayon moitie moindre`() {
        val shadow = vectors().getValue("shadowActive").jsonObject
        val active = recipe(MeeshyGlassButtonKind.Active)

        assertThat(active.shadow).isNotNull()
        assertThat(active.shadow!!.opacity).isEqualTo(shadow.float("opacity"))
        assertThat(active.shadow!!.radiusDp).isEqualTo(shadow.float("blur") / 2f)
        assertThat(active.shadow!!.yDp).isEqualTo(shadow.float("y"))
        listOf(MeeshyGlassButtonKind.Normal, MeeshyGlassButtonKind.Destructive, MeeshyGlassButtonKind.Soft).forEach {
            assertThat(recipe(it).shadow).isNull()
        }
    }

    @Test
    fun `l'encre suit la tenue, le ton et la teinte du glyphe`() {
        vectors().getValue("ink").jsonArray.map { it.jsonObject }.forEach { row ->
            val tone = if (row.string("tone") == "theme") MeeshyGlassTone.Theme else MeeshyGlassTone.Deep
            val tinted = row.getValue("glyphTint").jsonPrimitive.booleanOrNull!!
            val result = recipe(kind(row.string("kind")), tone = tone, glyphTint = if (tinted) GLYPH_TINT else null)

            assertWithMessage(row.toString()).that(inkName(result.ink)).isEqualTo(row.string("ink"))
        }
    }

    @Test
    fun `l'encre posee par l'hote est celle de la teinte du glyphe`() {
        val result = recipe(MeeshyGlassButtonKind.Normal, glyphTint = GLYPH_TINT)

        assertThat(result.ink).isEqualTo(MeeshyGlassButtonInk.Custom(GLYPH_TINT))
    }

    @Test
    fun `sous le ton theme l'actif est un disque a l'encre du theme et son glyphe est inverse`() {
        val active = recipe(MeeshyGlassButtonKind.Active, tone = MeeshyGlassTone.Theme)

        assertThat(active.fill).isEqualTo(MeeshyGlassButtonFill.ThemeInk)
        assertThat(active.ink).isEqualTo(MeeshyGlassButtonInk.ThemeInverse)
    }

    @Test
    fun `desactive - ni action ni haptique ni reponse au toucher, contenu a 40 pour cent`() {
        val states = vectors().getValue("states").jsonArray.map { it.jsonObject }
        states.forEach { row ->
            val result = recipe(MeeshyGlassButtonKind.Active, pressed = true, enabled = row.bool("enabled"))

            assertThat(result.isActionEnabled).isEqualTo(row.bool("action"))
            assertThat(result.playsHaptic).isEqualTo(row.bool("haptic"))
            assertThat(result.respondsToTouch).isEqualTo(row.bool("touchResponse"))
            assertThat(result.opacity).isEqualTo(row.float("opacity"))
        }
        val disabled = recipe(MeeshyGlassButtonKind.Destructive, pressed = true, enabled = false)
        assertThat(disabled.pressVeilOpacity).isEqualTo(0f)
    }

    // endregion

    // region Le contraste, calcule depuis la recette

    @Test
    fun `le contraste des fonds pleins est calcule depuis la recette`() {
        val contrast = vectors().getValue("contrast").jsonObject
        val tolerance = contrast.float("tolerance")

        val active = recipe(MeeshyGlassButtonKind.Active).solidContrast(THEME_INK, THEME_INVERSE)
        val destructive = recipe(MeeshyGlassButtonKind.Destructive).solidContrast(THEME_INK, THEME_INVERSE)

        assertThat(active).isNotNull()
        assertThat(active!!).isWithin(tolerance.toDouble()).of(contrast.float("active").toDouble())
        assertThat(destructive).isNotNull()
        assertThat(destructive!!).isWithin(tolerance.toDouble()).of(contrast.float("destructive").toDouble())
        assertThat(destructive).isAtLeast(contrast.float("glyphMin").toDouble())
        assertThat(recipe(MeeshyGlassButtonKind.Normal).solidContrast(THEME_INK, THEME_INVERSE)).isNull()
        assertThat(recipe(MeeshyGlassButtonKind.Soft).solidContrast(THEME_INK, THEME_INVERSE)).isNull()
    }

    @Test
    fun `les encres de la planche sont celles des jetons - blanc des medias, indigo950, rouge fort`() {
        val active = recipe(MeeshyGlassButtonKind.Active)
        val destructive = recipe(MeeshyGlassButtonKind.Destructive)

        assertThat(active.inkColor(THEME_INK, THEME_INVERSE)).isEqualTo(MeeshyPalette.Indigo950)
        assertThat(active.fillColor(THEME_INK)).isEqualTo(MeeshyMediaChromeColors.OnMedia)
        assertThat(destructive.fillColor(THEME_INK)).isEqualTo(MeeshyPalette.ErrorStrong)
        assertThat(destructive.inkColor(THEME_INK, THEME_INVERSE)).isEqualTo(MeeshyMediaChromeColors.OnMedia)
    }

    @Test
    fun `le doux se lit au plancher de 3 a 1 et aux valeurs mesurees des vecteurs`() {
        val contrast = vectors().getValue("contrast").jsonObject
        val floor = contrast.float("glyphMin").toDouble()
        val tolerance = contrast.float("tolerance").toDouble()

        val onDense = softContrast(MeeshyGlassTone.Deep, MeeshyGlassDensity.Dense)
        val onLight = softContrast(MeeshyGlassTone.OnLight, MeeshyGlassDensity.Regular)

        assertThat(onDense).isWithin(tolerance).of(contrast.float("softOnDense").toDouble())
        assertThat(onLight).isWithin(tolerance).of(contrast.float("softOnLight").toDouble())
        assertThat(onDense).isAtLeast(floor)
        assertThat(onLight).isAtLeast(floor)
    }

    /** Le glyphe blanc contre le voile doux posé sur un verre sombre, au pire : une image blanche dessous. */
    private fun softContrast(tone: MeeshyGlassTone, density: MeeshyGlassDensity): Double {
        val glass = MeeshyGlassRecipe.resolve(
            tone = tone, density = density, isTinted = false, isInteractive = false, isPressed = false,
            material = MeeshyGlassMaterial.Drawn, reduceMotion = false,
        )
        val veil = recipe(MeeshyGlassButtonKind.Soft).fillOpacity
        val underVeil = 1f - glass.fillOpacity
        val channel = (underVeil * (1f - veil) + veil).toDouble()
        return CanvasChromeScheme.contrastRatio(
            CanvasChromeScheme.luminance(1.0, 1.0, 1.0),
            CanvasChromeScheme.luminance(channel, channel, channel),
        )
    }

    // endregion

    // region L'activation et ce que le lecteur d'ecran entend

    @Test
    fun `l'activation dit l'etat et en deduit la tenue`() {
        vectors().getValue("activation").jsonArray.map { it.jsonObject }.forEach { row ->
            val activation = activation(row.string("activation"))
            val state = MeeshyGlassButtonAccessibilityState.resolve(activation)

            assertWithMessage(row.toString()).that(activation.impliedKind).isEqualTo(kind(row.string("impliedKind")))
            assertThat(state.isToggle).isEqualTo(row.bool("toggle"))
            assertThat(state.isSelected).isEqualTo(row.bool("selected"))
            assertThat(state.toggleIsOn).isEqualTo(row["toggleOn"]?.jsonPrimitive?.booleanOrNull)
        }
    }

    @Test
    fun `la valeur dite est le mot de la bascule puis ce que le controle porte deja`() {
        vectors().getValue("value").jsonArray.map { it.jsonObject }.forEach { row ->
            val said = MeeshyGlassButtonAccessibilityState.composeValue(
                toggleWord = row["toggleWord"]?.jsonPrimitive?.contentOrNull,
                value = row["value"]?.jsonPrimitive?.contentOrNull,
            )

            assertThat(said).isEqualTo(row.string("said"))
        }
    }

    @Test
    fun `l'appui long garde le nom du bouton quand l'hote n'en donne pas`() {
        assertThat(MeeshyGlassButtonAccessibilityState.longPressActionName(null, "Micro")).isEqualTo("Micro")
        assertThat(MeeshyGlassButtonAccessibilityState.longPressActionName("", "Micro")).isEqualTo("Micro")
        assertThat(MeeshyGlassButtonAccessibilityState.longPressActionName("Couper le micro", "Micro")).isEqualTo("Couper le micro")
    }

    @Test
    fun `l'appui long dure 500 ms et s'annule au-dela de 10 dp`() {
        val longPress = vectors().getValue("longPress").jsonObject

        assertThat(MeeshyGlassButtonRecipe.LONG_PRESS_MILLIS).isEqualTo(longPress.float("durationMs").toLong())
        assertThat(MeeshyGlassButtonRecipe.LONG_PRESS_MAX_MOVEMENT_DP).isEqualTo(longPress.float("maxMovement"))
    }

    // endregion

    // region Le doigt et l'activation

    @Test
    fun `le rapport du doigt - pose, leve, et leve si le bouton disparait doigt pose`() {
        vectors().getValue("pressReport").jsonArray.map { it.jsonObject }.forEach { row ->
            val to = row["to"]?.jsonPrimitive?.booleanOrNull
            val expected = row["report"]?.jsonPrimitive?.booleanOrNull

            assertWithMessage(row.toString()).that(MeeshyGlassPressReport.report(row.bool("from"), to)).isEqualTo(expected)
        }
    }

    @Test
    fun `l'activation joue UN impact leger puis l'action, aucun si l'hote joue le sien, rien si desactive`() {
        val played = mutableListOf<MeeshyGlassButtonHaptic>()
        var actions = 0

        val done = MeeshyGlassButtonTrigger.perform(true, MeeshyGlassButtonHaptic.Light, { played += it }) { actions++ }
        val silent = MeeshyGlassButtonTrigger.perform(true, MeeshyGlassButtonHaptic.None, { played += it }) { actions++ }
        val refused = MeeshyGlassButtonTrigger.perform(false, MeeshyGlassButtonHaptic.Light, { played += it }) { actions++ }

        assertThat(done).isTrue()
        assertThat(silent).isTrue()
        assertThat(refused).isFalse()
        assertThat(played).containsExactly(MeeshyGlassButtonHaptic.Light)
        assertThat(actions).isEqualTo(2)
    }

    // endregion

    // region Le focus clavier

    @Test
    fun `l'anneau du focus clavier prend la couleur que son ton laisse lisible, et l'encre de la planche dans un verre`() {
        val expected = mapOf(
            MeeshyGlassTone.Plain to MeeshyGlassButtonFocusRing.OnMedia,
            MeeshyGlassTone.Deep to MeeshyGlassButtonFocusRing.MediaBackdrop,
            MeeshyGlassTone.OnLight to MeeshyGlassButtonFocusRing.MediaBackdrop,
            MeeshyGlassTone.Theme to MeeshyGlassButtonFocusRing.ThemeInk,
        )

        MeeshyGlassButtonKind.entries.forEach { kind ->
            expected.forEach { (tone, ring) ->
                assertWithMessage("$kind sur $tone").that(recipe(kind, tone = tone).focusRing).isEqualTo(ring)
                assertWithMessage("$kind emboite sur $tone").that(recipe(kind, tone = tone, nested = true).focusRing)
                    .isEqualTo(MeeshyGlassButtonFocusRing.OnMedia)
            }
        }
        assertThat(MeeshyGlassButtonRecipe.FOCUS_RING_WIDTH_DP).isEqualTo(2f)
        assertThat(MeeshyGlassButtonRecipe.FOCUS_RING_OFFSET_DP).isEqualTo(2f)
    }

    @Test
    fun `l'anneau du focus a les encres des jetons - blanc des medias, sombre du verre, encre du theme`() {
        val focus = recipe(MeeshyGlassButtonKind.Normal)

        assertThat(focus.copy(focusRing = MeeshyGlassButtonFocusRing.OnMedia).focusRingColor(THEME_INK)).isEqualTo(MeeshyMediaChromeColors.OnMedia)
        assertThat(focus.copy(focusRing = MeeshyGlassButtonFocusRing.MediaBackdrop).focusRingColor(THEME_INK)).isEqualTo(MeeshyMediaChromeColors.MediaBackdrop)
        assertThat(focus.copy(focusRing = MeeshyGlassButtonFocusRing.ThemeInk).focusRingColor(THEME_INK)).isEqualTo(THEME_INK)
    }

    // endregion

    // region Les gardes de source

    @Test
    fun `aucun verre dessine dans les fichiers de K02 - le verre passe par K01 et par lui seul`() {
        val forbidden = Regex("""\b(glassEffect|adaptiveGlass|MeeshyGlassSurface|meeshyComposerGlass|composerInnerGlass|liquidGlassRim|liquidGlassSheen|BlurEffect|blur)\(""")
        val sources = k02Sources()

        assertThat(sources).isNotEmpty()
        sources.forEach { file ->
            val code = file.readLines().filterNot { it.trimStart().startsWith("*") || it.trimStart().startsWith("//") || it.trimStart().startsWith("/*") }
            code.forEachIndexed { index, line ->
                assertWithMessage("${file.name}:${index + 1} dessine du verre : $line").that(forbidden.containsMatchIn(line)).isFalse()
            }
        }
    }

    @Test
    fun `aucune couleur ni legende en dur dans les fichiers de K02`() {
        val hardCoded = Regex("""Color\(0x|Color\.(White|Black|Red)\b""")
        k02Sources().forEach { file ->
            file.readLines().filterNot { it.trimStart().startsWith("*") || it.trimStart().startsWith("//") }.forEachIndexed { index, line ->
                assertWithMessage("${file.name}:${index + 1} : $line").that(hardCoded.containsMatchIn(line)).isFalse()
            }
        }
    }

    // endregion

    // region Aides

    private fun recipe(
        kind: MeeshyGlassButtonKind,
        size: MeeshyGlassButtonSize = MeeshyGlassButtonSize.S44,
        tone: MeeshyGlassTone = MeeshyGlassTone.Deep,
        nested: Boolean = false,
        pressed: Boolean = false,
        hovered: Boolean = false,
        enabled: Boolean = true,
        glyphTint: Color? = null,
    ): MeeshyGlassButtonRecipe = MeeshyGlassButtonRecipe.resolve(
        kind = kind, size = size, tone = tone, isNested = nested, isPressed = pressed, isHovered = hovered,
        isEnabled = enabled, glyphTint = glyphTint,
    )

    private fun sizes(): List<Pair<MeeshyGlassButtonSize, JsonObject>> =
        vectors().getValue("sizes").jsonArray.map { it.jsonObject }.map { row ->
            MeeshyGlassButtonSize.valueOf(row.string("size").uppercase()) to row
        }

    private fun kind(name: String): MeeshyGlassButtonKind = when (name) {
        "normal" -> MeeshyGlassButtonKind.Normal
        "active" -> MeeshyGlassButtonKind.Active
        "destructive" -> MeeshyGlassButtonKind.Destructive
        "soft" -> MeeshyGlassButtonKind.Soft
        else -> error("tenue inconnue : $name")
    }

    private fun fill(name: String): MeeshyGlassButtonFill = when (name) {
        "none" -> MeeshyGlassButtonFill.Clear
        "white" -> MeeshyGlassButtonFill.White
        "red" -> MeeshyGlassButtonFill.Red
        "veil" -> MeeshyGlassButtonFill.Veil
        else -> error("fond inconnu : $name")
    }

    private fun glass(name: String): MeeshyGlassButtonGlassRequest = when (name) {
        "none" -> MeeshyGlassButtonGlassRequest.None
        "neutral" -> MeeshyGlassButtonGlassRequest.Neutral
        else -> error("demande de verre sans Liquid Glass : $name")
    }

    private fun activation(name: String): MeeshyGlassButtonActivation = when (name) {
        "none" -> MeeshyGlassButtonActivation.None
        "toggle(true)" -> MeeshyGlassButtonActivation.Toggle(true)
        "toggle(false)" -> MeeshyGlassButtonActivation.Toggle(false)
        "selected(true)" -> MeeshyGlassButtonActivation.Selected(true)
        "selected(false)" -> MeeshyGlassButtonActivation.Selected(false)
        "expanded(true)" -> MeeshyGlassButtonActivation.Expanded(true)
        "expanded(false)" -> MeeshyGlassButtonActivation.Expanded(false)
        else -> error("activation inconnue : $name")
    }

    private fun JsonObject.string(key: String): String = getValue(key).jsonPrimitive.content

    private fun JsonObject.float(key: String): Float = getValue(key).jsonPrimitive.float

    private fun JsonObject.bool(key: String): Boolean = getValue(key).jsonPrimitive.booleanOrNull!!

    private fun inkName(ink: MeeshyGlassButtonInk): String = when (ink) {
        MeeshyGlassButtonInk.OnMedia -> "onMedia"
        MeeshyGlassButtonInk.OnSolid -> "onSolid"
        MeeshyGlassButtonInk.ThemeInk -> "themeInk"
        MeeshyGlassButtonInk.ThemeInverse -> "themeInverse"
        is MeeshyGlassButtonInk.Custom -> "custom"
    }

    private fun repositoryRoot(): File {
        val start = File("").absoluteFile
        return generateSequence(start) { it.parentFile }
            .firstOrNull { File(it, VECTORS).isFile }
            ?: File(start, "../..").canonicalFile.also { check(File(it, VECTORS).isFile) { "dépôt introuvable depuis ${start.absolutePath}" } }
    }

    private fun vectors(): JsonObject = Json.parseToJsonElement(File(repositoryRoot(), VECTORS).readText()).jsonObject

    private fun k02Sources(): List<File> =
        File(repositoryRoot(), "apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/kit")
            .listFiles { file -> file.name.startsWith("MeeshyGlassButton") && file.extension == "kt" }
            .orEmpty()
            .toList()

    // endregion

    private companion object {
        const val VECTORS = "docs/product/kit/K02-MeeshyGlassButton.vectors.json"
        val GLYPH_TINT = Color(0xFFFFB020)
        val THEME_INK = Color(0xFF111111)
        val THEME_INVERSE = Color(0xFFFAFAFA)
    }
}
