package me.meeshy.ui.component.kit

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
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyAdaptiveColors
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyIconSize
import me.meeshy.ui.theme.MeeshySpacing
import org.junit.Test

/**
 * K04 — la rangée de puces de choix, lue comme des VALEURS : la loi du toucher, les bords, la recette, le nom et le rôle.
 * Miroir de `MeeshyChipRowTests` (iOS), et même fichier de vecteurs de parité
 * (`docs/product/kit/K04-MeeshyChipRow.vectors.json`). Le rendu, lui, vit dans `MeeshyChipRowBehaviorTest`.
 *
 * Écart assumé avec iOS : la cible tactile est de 48 dp (le jeton `minTouchTarget`), et elle tient DANS la rangée (Compose
 * ne prend aucun toucher hors des bornes de la mise en page).
 */
class MeeshyChipRowTest {

    // region La loi du toucher

    @Test
    fun `next suit les vecteurs pour chaque mode et chaque genre de puce`() {
        val rows = vectors().getValue("next").jsonArray.map { it.jsonObject }
        assertThat(rows).isNotEmpty()
        rows.forEach { row ->
            val mode = mode(row.string("mode"))
            val kind = kind(row.string("kind"))
            val selection = row.strings("selection")
            val tapped = row.string("tapped")
            val expected = row.strings("next")
            val response = MeeshyChipRowRule.response(selection, tapped, mode, kind)

            assertWithMessage("$row").that(MeeshyChipRowRule.next(selection, tapped, mode, kind)).isEqualTo(expected)
            when (response) {
                is MeeshyChipRowResponse.Ignored -> assertWithMessage("$row").that(row.string("response")).isEqualTo("ignored")
                is MeeshyChipRowResponse.Action -> assertWithMessage("$row").that(row.string("response")).isEqualTo("action")
                is MeeshyChipRowResponse.Changed -> {
                    assertWithMessage("$row").that(row.string("response")).isEqualTo("changed")
                    assertWithMessage("$row").that(response.selection).isEqualTo(expected)
                }
            }
        }
    }

    @Test
    fun `une puce d'action ou de menu n'entre jamais dans la selection`() {
        listOf(MeeshyChipKind.Action, MeeshyChipKind.Menu).forEach { kind ->
            MeeshyChipRowMode.entries.forEach { mode ->
                assertThat(MeeshyChipRowRule.response(setOf("a"), "b", mode, kind)).isEqualTo(MeeshyChipRowResponse.Action)
                assertThat(MeeshyChipRowRule.next(setOf("a"), "b", mode, kind)).isEqualTo(setOf("a"))
            }
        }
    }

    @Test
    fun `la puce a montrer est celle qui entre, sinon la premiere courante`() {
        val order = listOf("a", "b", "c", "d")
        assertThat(MeeshyChipRowRule.revealTarget(order, setOf("a"), setOf("a", "c"))).isEqualTo("c")
        assertThat(MeeshyChipRowRule.revealTarget(order, emptySet(), setOf("d", "b"))).isEqualTo("b")
        assertThat(MeeshyChipRowRule.revealTarget(order, setOf("a", "b"), setOf("b"))).isEqualTo("b")
        assertThat(MeeshyChipRowRule.revealTarget(order, setOf("a"), emptySet())).isNull()
    }

    // endregion

    // region L'activation

    @Test
    fun `un changement effectif - UN light, puis un onChange avec la selection suivante et la puce touchee`() {
        val haptics = mutableListOf<MeeshyChipRowHaptic>()
        val changes = mutableListOf<Pair<Set<String>, String>>()
        val performed = MeeshyChipRowTrigger.perform(
            response = MeeshyChipRowResponse.Changed(setOf("b")), tapped = "b", isEnabled = true, haptic = MeeshyChipRowHaptic.Light,
            play = { haptics += it }, onChange = { next, tapped -> changes += next to tapped }, onAction = null,
        )

        assertThat(performed).isTrue()
        assertThat(haptics).containsExactly(MeeshyChipRowHaptic.Light)
        assertThat(changes).containsExactly(setOf("b") to "b")
    }

    @Test
    fun `un toucher ignore ne joue rien et ne rappelle rien`() {
        var calls = 0
        val performed = MeeshyChipRowTrigger.perform(
            response = MeeshyChipRowResponse.Ignored, tapped = "a", isEnabled = true, haptic = MeeshyChipRowHaptic.Light,
            play = { calls++ }, onChange = { _, _ -> calls++ }, onAction = { calls++ },
        )

        assertThat(performed).isFalse()
        assertThat(calls).isEqualTo(0)
    }

    @Test
    fun `desactivee, la puce ne joue rien et ne rappelle rien`() {
        var calls = 0
        val performed = MeeshyChipRowTrigger.perform(
            response = MeeshyChipRowResponse.Changed(setOf("b")), tapped = "b", isEnabled = false, haptic = MeeshyChipRowHaptic.Light,
            play = { calls++ }, onChange = { _, _ -> calls++ }, onAction = { calls++ },
        )

        assertThat(performed).isFalse()
        assertThat(calls).isEqualTo(0)
    }

    @Test
    fun `avec none, l'hote joue son haptique - le rappel part, la rangee se tait`() {
        var haptics = 0
        var changes = 0
        MeeshyChipRowTrigger.perform(
            response = MeeshyChipRowResponse.Changed(setOf("b")), tapped = "b", isEnabled = true, haptic = MeeshyChipRowHaptic.None,
            play = { haptics++ }, onChange = { _, _ -> changes++ }, onAction = null,
        )

        assertThat(haptics).isEqualTo(0)
        assertThat(changes).isEqualTo(1)
    }

    @Test
    fun `une action joue UN light et appelle onAction, jamais onChange`() {
        val haptics = mutableListOf<MeeshyChipRowHaptic>()
        val actions = mutableListOf<String>()
        var changes = 0
        MeeshyChipRowTrigger.perform(
            response = MeeshyChipRowResponse.Action, tapped = "menu", isEnabled = true, haptic = MeeshyChipRowHaptic.Light,
            play = { haptics += it }, onChange = { _, _ -> changes++ }, onAction = { actions += it },
        )

        assertThat(haptics).containsExactly(MeeshyChipRowHaptic.Light)
        assertThat(actions).containsExactly("menu")
        assertThat(changes).isEqualTo(0)
    }

    // endregion

    // region Les bords

    @Test
    fun `les bords suivent les vecteurs`() {
        val rows = vectors().getValue("edges").jsonArray.map { it.jsonObject }
        assertThat(rows).isNotEmpty()
        rows.forEach { row ->
            val edges = MeeshyScrollEdges.of(content = row.float("content"), viewport = row.float("viewport"), offset = row.float("offset"))
            assertWithMessage("$row").that(edges.start).isEqualTo(row.getValue("start").jsonPrimitive.booleanOrNull)
            assertWithMessage("$row").that(edges.end).isEqualTo(row.getValue("end").jsonPrimitive.booleanOrNull)
        }
    }

    @Test
    fun `la tolerance et la largeur de l'estompe sont celles des vecteurs`() {
        val vectors = vectors()
        assertThat(MeeshyScrollEdges.TOLERANCE).isEqualTo(vectors.float("edgeTolerance"))
        assertThat(MeeshyChipRecipe.EDGE_FADE_DP).isEqualTo(vectors.float("edgeFade"))
        assertThat(MeeshyChipRecipe.EDGE_FADE_DP).isEqualTo(MeeshyControlSize.tapTarget.value)
    }

    @Test
    fun `les bords se miroitent en RTL, le debut passe a droite`() {
        val atStart = MeeshyScrollEdges(start = false, end = true)
        assertThat(atStart.physicalSides(isRightToLeft = false)).isEqualTo(false to true)
        assertThat(atStart.physicalSides(isRightToLeft = true)).isEqualTo(true to false)
        assertThat(MeeshyScrollEdges.None.hasOverflow).isFalse()
        assertThat(atStart.hasOverflow).isTrue()
    }

    // endregion

    // region La recette

    @Test
    fun `fond, voile et encre suivent les vecteurs, par etat, surface et teinte`() {
        val rows = vectors().getValue("recipe").jsonArray.map { it.jsonObject }
        assertThat(rows).isNotEmpty()
        rows.forEach { row ->
            val recipe = MeeshyChipRecipe.resolve(
                surface = surface(row.string("surface")),
                isSelected = row.bool("selected"),
                isPressed = row.bool("pressed"),
                isHovered = row.bool("hovered"),
                isEnabled = row.bool("enabled"),
                isTinted = row.bool("tinted"),
            )
            assertWithMessage("$row fond").that(recipe.fill).isEqualTo(fill(row.string("fill")))
            assertWithMessage("$row voile").that(recipe.fillOpacity).isEqualTo(row.float("fillOpacity"))
            assertWithMessage("$row encre").that(recipe.ink).isEqualTo(ink(row.string("ink")))
            assertWithMessage("$row opacite").that(recipe.opacity).isEqualTo(row.float("opacity"))
        }
    }

    @Test
    fun `les voiles et les durees sont ceux des vecteurs`() {
        val vectors = vectors()
        val veils = vectors.getValue("voiles").jsonObject
        assertThat(MeeshyChipRecipe.REST_FILL_OPACITY).isEqualTo(veils.float("rest"))
        assertThat(MeeshyChipRecipe.PRESSED_FILL_OPACITY).isEqualTo(veils.float("pressed"))
        assertThat(MeeshyChipRecipe.SELECTED_PRESSED_FILL_OPACITY).isEqualTo(veils.float("selectedPressed"))
        assertThat(MeeshyChipRecipe.SELECTED_FILL_OPACITY).isEqualTo(veils.float("selected"))
        assertThat(MeeshyChipRecipe.DISABLED_OPACITY).isEqualTo(vectors.float("disabledOpacity"))
        assertThat(MeeshyChipRecipe.TONE_FADE_MILLIS.toFloat()).isEqualTo(vectors.float("toneFadeMs"))
        assertThat(MeeshyChipRecipe.EDGE_FADE_MILLIS.toFloat()).isEqualTo(vectors.float("edgeFadeMs"))
        assertThat(MeeshyChipRecipe.REVEAL_MILLIS.toFloat()).isEqualTo(vectors.float("revealMs"))
    }

    @Test
    fun `le repos ne se confond ni avec l'appui ni avec le survol, pour chaque surface`() {
        MeeshyChipRowSurface.entries.forEach { surface ->
            listOf(false, true).forEach { selected ->
                val rest = MeeshyChipRecipe.resolve(surface, selected)
                val pressed = MeeshyChipRecipe.resolve(surface, selected, isPressed = true)
                val hovered = MeeshyChipRecipe.resolve(surface, selected, isHovered = true)
                assertThat(rest).isNotEqualTo(pressed)
                assertThat(pressed).isEqualTo(hovered)
            }
        }
    }

    @Test
    fun `desactivee, la puce ne repond ni a l'appui ni au survol, et son contenu est a 40 pour cent`() {
        val rest = MeeshyChipRecipe.resolve(MeeshyChipRowSurface.OnMedia, isSelected = false, isEnabled = false)
        val pressed = MeeshyChipRecipe.resolve(
            MeeshyChipRowSurface.OnMedia, isSelected = false, isPressed = true, isHovered = true, isEnabled = false,
        )

        assertThat(rest).isEqualTo(pressed)
        assertThat(rest.opacity).isEqualTo(0.4f)
        assertThat(rest.respondsToTouch).isFalse()
        assertThat(rest.playsHaptic).isFalse()
    }

    @Test
    fun `l'encre de la courante est l'indigo 950 sur le blanc - 15,99 pour 1`() {
        val recipe = MeeshyChipRecipe.resolve(MeeshyChipRowSurface.OnMedia, isSelected = true)

        assertThat(recipe.contrast(MeeshyAdaptiveColors.backgroundPrimary(true), INK, INVERSE)).isWithin(0.05).of(15.99)
    }

    @Test
    fun `le repos tient 4,5 pour 1 sur une feuille sombre, et le theme tient 4,5 pour 1 en clair comme en sombre`() {
        val onSheet = MeeshyChipRecipe.resolve(MeeshyChipRowSurface.OnMedia, isSelected = false)
        assertThat(onSheet.contrast(MeeshyAdaptiveColors.backgroundSecondary(true), INK, INVERSE)).isAtLeast(4.5)
        listOf(false, true).forEach { isDark ->
            val backdrop = MeeshyAdaptiveColors.backgroundPrimary(isDark)
            val ink = MeeshyAdaptiveColors.textPrimary(isDark)
            val inverse = MeeshyAdaptiveColors.backgroundPrimary(isDark)
            listOf(false, true).forEach { selected ->
                val themed = MeeshyChipRecipe.resolve(MeeshyChipRowSurface.Theme, selected)
                assertWithMessage("selected=$selected dark=$isDark").that(themed.contrast(backdrop, ink, inverse)).isAtLeast(4.5)
            }
        }
    }

    // endregion

    // region Les mesures

    @Test
    fun `hauteur, marge et corps de chaque taille suivent les vecteurs`() {
        val rows = vectors().getValue("sizes").jsonArray.map { it.jsonObject }
        assertThat(rows).hasSize(MeeshyChipRowSize.entries.size)
        MeeshyChipRowSize.entries.forEach { size ->
            val row = rows.first { it.string("size").equals(size.name, ignoreCase = true) }
            assertThat(size.heightDp).isEqualTo(row.float("height"))
            assertThat(size.horizontalPaddingDp).isEqualTo(row.float("padding"))
            assertThat(size.fontSizeSp).isEqualTo(row.float("font"))
        }
        assertThat(MeeshyFontSize.subhead.value).isEqualTo(MeeshyChipRowSize.Regular.fontSizeSp)
    }

    @Test
    fun `la cible tactile atteint 48 dp en hauteur, capsule centree`() {
        val android = vectors().getValue("tapTarget").jsonObject.float("android")
        MeeshyChipRowSize.entries.forEach { size ->
            assertThat(size.targetHeightDp).isEqualTo(android)
            assertThat(size.heightDp + 2 * size.verticalSlackDp).isEqualTo(size.targetHeightDp)
        }
    }

    @Test
    fun `l'ecart entre deux rangees repliees vaut la cible moins la capsule - 12 dp en regulier`() {
        val spacing = vectors().getValue("spacing").jsonObject
        assertThat(MeeshyChipRowSize.Regular.wrappedRowGapDp).isEqualTo(MeeshyControlSize.minTouchTarget.value - MeeshyControlSize.regular.value)
        assertThat(MeeshyChipRowSize.Regular.wrappedRowGapDp).isEqualTo(12f)
        assertThat(MeeshySpacing.xsPlus.value).isEqualTo(spacing.float("chips"))
        assertThat(MeeshySpacing.xsPlus.value).isEqualTo(spacing.float("glyphAndText"))
        assertThat(spacing.float("rows")).isEqualTo(MeeshySpacing.sm.value)
    }

    @Test
    fun `les glyphes sont ceux des vecteurs`() {
        val glyph = vectors().getValue("glyph").jsonObject
        assertThat(glyph.float("leading")).isEqualTo(MeeshyIconSize.sm.value)
        assertThat(glyph.float("alone")).isEqualTo(MeeshyIconSize.md.value)
        assertThat(glyph.float("trailing")).isEqualTo(MeeshyIconSize.xs.value)
    }

    // endregion

    // region Nom, role, valeur

    @Test
    fun `un choix simple est un choix, un choix multiple une bascule, des onglets des onglets`() {
        fun state(
            mode: MeeshyChipRowMode,
            semantics: MeeshyChipRowSemantics = MeeshyChipRowSemantics.Choice,
            kind: MeeshyChipKind = MeeshyChipKind.Choice,
            selected: Boolean = true,
        ) = MeeshyChipAccessibility.resolve(mode, semantics, kind, selected)

        assertThat(state(MeeshyChipRowMode.Single)).isEqualTo(MeeshyChipAccessibility(MeeshyChipRole.Choice, true))
        assertThat(state(MeeshyChipRowMode.SingleOrNone, selected = false)).isEqualTo(MeeshyChipAccessibility(MeeshyChipRole.Choice, false))
        assertThat(state(MeeshyChipRowMode.Multiple)).isEqualTo(MeeshyChipAccessibility(MeeshyChipRole.Toggle, true))
        assertThat(state(MeeshyChipRowMode.Single, MeeshyChipRowSemantics.Tabs)).isEqualTo(MeeshyChipAccessibility(MeeshyChipRole.Tab, true))
        assertThat(state(MeeshyChipRowMode.Single, kind = MeeshyChipKind.Action)).isEqualTo(MeeshyChipAccessibility(MeeshyChipRole.Button, false))
        assertThat(state(MeeshyChipRowMode.Actions)).isEqualTo(MeeshyChipAccessibility(MeeshyChipRole.Button, false))
        assertThat(state(MeeshyChipRowMode.Single, kind = MeeshyChipKind.Menu)).isEqualTo(MeeshyChipAccessibility(MeeshyChipRole.Menu, false))
    }

    @Test
    fun `le nom est l'accessibilityLabel, sinon le titre - une puce sans titre ni nom est refusee`() {
        assertThat(MeeshyChip(id = "a", title = "Fondu").name).isEqualTo("Fondu")
        assertThat(MeeshyChip(id = "a", title = "Fondu", accessibilityLabel = "Effet fondu").name).isEqualTo("Effet fondu")
        val glyph = MeeshyChip(id = "s", title = "", icon = MeeshyIcons.Search)
        assertThat(glyph.hasAccessibleName).isFalse()
        assertThat(glyph.isGlyphOnly).isTrue()
        assertThat(glyph.copy(accessibilityLabel = "Rechercher").hasAccessibleName).isTrue()
        assertThat(MeeshyChip(id = "a", title = "Fondu", icon = MeeshyIcons.Star).isGlyphOnly).isFalse()
    }

    // endregion

    // region Les sources

    @Test
    fun `aucun verre, aucune couleur en dur, aucune echelle, aucun impact maison dans les fichiers de K04`() {
        val forbidden = listOf(
            "MeeshyGlass", "meeshyComposerGlass", "MeeshyGlassSurface", "liquidGlass", "RenderEffect", "BlurEffect", ".blur(",
            "Color(0x", "Color(0xFF", "Color.White", "Color.Black", "scale(", "graphicsLayer { scaleX", "performHapticFeedback",
            "HapticFeedbackType", "LocalHapticFeedback",
        )
        k04Sources().forEach { file ->
            val code = withoutComments(file.readText())
            forbidden.forEach { word -> assertWithMessage("${file.name} contient $word").that(code.contains(word)).isFalse() }
        }
    }

    @Test
    fun `les sources de K04 existent`() {
        assertThat(k04Sources().map { it.name }).containsAtLeast(
            "MeeshyChipRow.kt", "MeeshyChipCell.kt", "MeeshyChipRowRule.kt", "MeeshyChipRecipe.kt", "MeeshyScrollEdges.kt",
        )
    }

    // endregion

    // region Aides

    private fun mode(name: String): MeeshyChipRowMode = MeeshyChipRowMode.entries.first { it.name.equals(name, ignoreCase = true) }

    private fun kind(name: String): MeeshyChipKind = MeeshyChipKind.entries.first { it.name.equals(name, ignoreCase = true) }

    private fun surface(name: String): MeeshyChipRowSurface = MeeshyChipRowSurface.entries.first { it.name.equals(name, ignoreCase = true) }

    private fun fill(name: String): MeeshyChipFill = MeeshyChipFill.entries.first { it.name.equals(name, ignoreCase = true) }

    private fun ink(name: String): MeeshyChipInk = MeeshyChipInk.entries.first { it.name.equals(name, ignoreCase = true) }

    private fun JsonObject.string(key: String): String = getValue(key).jsonPrimitive.contentOrNull!!

    private fun JsonObject.bool(key: String): Boolean = getValue(key).jsonPrimitive.booleanOrNull!!

    private fun JsonObject.float(key: String): Float = getValue(key).jsonPrimitive.float

    private fun JsonObject.strings(key: String): Set<String> = getValue(key).jsonArray.map { it.jsonPrimitive.content }.toSet()

    private fun withoutComments(source: String): String =
        source
            .replace(Regex("""/\*.*?\*/""", RegexOption.DOT_MATCHES_ALL), "")
            .replace(Regex("""//[^\n]*"""), "")

    private fun repositoryRoot(): File {
        val start = File("").absoluteFile
        return generateSequence(start) { it.parentFile }
            .firstOrNull { File(it, VECTORS).isFile }
            ?: File(start, "../..").canonicalFile.also { check(File(it, VECTORS).isFile) { "dépôt introuvable depuis ${start.absolutePath}" } }
    }

    private fun vectors(): JsonObject = Json.parseToJsonElement(File(repositoryRoot(), VECTORS).readText()).jsonObject

    private fun k04Sources(): List<File> =
        File(repositoryRoot(), "apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/kit")
            .listFiles { file ->
                file.extension == "kt" && (file.name.startsWith("MeeshyChip") || file.name == "MeeshyScrollEdges.kt")
            }
            .orEmpty()
            .toList()

    // endregion

    private companion object {
        const val VECTORS = "docs/product/kit/K04-MeeshyChipRow.vectors.json"
        val INK = MeeshyAdaptiveColors.textPrimary(true)
        val INVERSE = MeeshyAdaptiveColors.backgroundPrimary(true)
    }
}
