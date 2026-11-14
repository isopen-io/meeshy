package me.meeshy.feature.kit

import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import me.meeshy.ui.component.kit.MeeshyColorDot
import me.meeshy.ui.component.kit.MeeshyColorDotFill
import me.meeshy.ui.component.kit.MeeshyColorDotSize
import me.meeshy.ui.component.kit.MeeshyColorDots
import me.meeshy.ui.component.kit.MeeshyColorDotsLayout
import me.meeshy.ui.component.kit.MeeshyGlassButton
import me.meeshy.ui.component.kit.MeeshyGlassButtonSize
import me.meeshy.ui.component.kit.MeeshyGlassTone
import me.meeshy.ui.component.kit.MeeshyKitCatalogBackdrop
import me.meeshy.ui.component.kit.MeeshyKitCatalogEntry
import me.meeshy.ui.component.kit.MeeshyKitCatalogState
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyPalette

private const val STATE_TEXT = "texte"
private const val STATE_DRAWING = "dessin"
private const val STATE_BACKGROUND = "fond"
private const val STATE_NO_CURRENT = "sans-courante"
private const val STATE_GRADIENT = "degrade"
private const val STATE_THEME = "theme"
private const val STATE_DISABLED = "desactive"

/** Les largeurs des vues de la planche : A3 (358), A13 (338), S1 et les autres (342). Bornées par la scène de la tuile. */
private const val A3_WIDTH_DP = 358
private const val A13_WIDTH_DP = 338
private const val S1_WIDTH_DP = 342

/** Les états de K07, ceux de la fiche et du catalogue iOS : mêmes identifiants, mêmes fonds, mêmes tuiles pressées. */
internal val entryK07: MeeshyKitCatalogEntry = MeeshyKitCatalogEntry(
    key = "K07",
    name = "MeeshyColorDots",
    states = listOf(
        MeeshyKitCatalogState(id = STATE_TEXT, boardView = "A3", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_DRAWING, boardView = "A13", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_BACKGROUND, boardView = "S1", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_NO_CURRENT, backdrop = MeeshyKitCatalogBackdrop.Media),
        MeeshyKitCatalogState(id = STATE_GRADIENT, backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_THEME, backdrop = MeeshyKitCatalogBackdrop.Light, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_DISABLED, backdrop = MeeshyKitCatalogBackdrop.Media),
    ),
)

/** Les noms de l'échantillon : des textes de démonstration du catalogue, pas des chaînes publiées (fiche K07 § 1). */
private object ColorDotsSampleNames {
    const val TEXT_GROUP = "Couleur du texte"
    const val STROKE_GROUP = "Couleur du trait"
    const val BACKGROUND_GROUP = "Arrière-plan"
    const val ACCENT_GROUP = "Couleur d'accent"
    const val RANDOM = "Aléatoire"
}

private fun dot(id: String, color: Color, name: String? = null): MeeshyColorDot =
    MeeshyColorDot(id = id, fill = MeeshyColorDotFill.Solid(color), name = name)

/** Les palettes de démonstration, en jetons nommés : celles du catalogue iOS, dans le même ordre. */
private object ColorDotsSamplePalette {
    val drawing: List<MeeshyColorDot> = listOf(
        dot("blanc", MeeshyMediaChromeColors.OnMedia, "Blanc"),
        dot("indigo", MeeshyPalette.Indigo500, "Indigo"),
        dot("corail", MeeshyPalette.TileCoral, "Corail"),
        dot("safran", MeeshyPalette.TileSaffron, "Safran"),
        dot("emeraude", MeeshyPalette.TileEmerald, "Émeraude"),
        dot("ciel", MeeshyPalette.TileSky, "Ciel"),
        dot("amethyste", MeeshyPalette.TileAmethyst, "Améthyste"),
        dot("rose", MeeshyPalette.TileRose, "Rose"),
        dot("nuit", MeeshyPalette.Indigo950, "Nuit"),
    )

    val text: List<MeeshyColorDot> = drawing + listOf(
        dot("bleu", MeeshyPalette.TileBlue, "Bleu"),
        dot("sarcelle", MeeshyPalette.TileTeal, "Sarcelle"),
        dot("cyan", MeeshyPalette.TileCyan, "Cyan"),
        dot("ambre", MeeshyPalette.Amber500, "Ambre"),
        dot("orange", MeeshyPalette.Orange500, "Orange"),
    )

    val background: List<MeeshyColorDot> = text + listOf(
        dot("violet", MeeshyPalette.Purple600),
        dot("gris", MeeshyPalette.Neutral500),
        dot("succes", MeeshyPalette.Success),
    )

    val special: List<MeeshyColorDot> = listOf(
        MeeshyColorDot(id = "aucun", fill = MeeshyColorDotFill.Hollow, name = "Aucun"),
        MeeshyColorDot(
            id = "auto",
            fill = MeeshyColorDotFill.Solid(MeeshyMediaChromeColors.OnMedia),
            name = "Automatique",
            icon = MeeshyIcons.MagicWand,
        ),
        MeeshyColorDot(
            id = "marque",
            fill = MeeshyColorDotFill.Gradient(listOf(MeeshyPalette.Indigo500, MeeshyPalette.Purple500)),
            name = "Dégradé Meeshy",
        ),
        MeeshyColorDot(
            id = "aube",
            fill = MeeshyColorDotFill.Gradient(listOf(MeeshyPalette.TileCoral, MeeshyPalette.TileSaffron)),
            name = "Aube",
        ),
    )
}

/** L'échantillon d'un état : la planche à sa largeur, la courante de départ (la première, sauf « sans courante »). */
private data class ColorDotsSample(
    val dots: List<MeeshyColorDot>,
    val label: String,
    val widthDp: Int = S1_WIDTH_DP,
    val size: MeeshyColorDotSize = MeeshyColorDotSize.S28,
    val layout: MeeshyColorDotsLayout = MeeshyColorDotsLayout.Wrap,
    val tone: MeeshyGlassTone? = null,
    val ringless: Boolean = false,
    val enabled: Boolean = true,
    val withRandom: Boolean = false,
)

private fun sampleFor(stateId: String): ColorDotsSample = when (stateId) {
    STATE_TEXT -> ColorDotsSample(
        ColorDotsSamplePalette.text, ColorDotsSampleNames.TEXT_GROUP, widthDp = A3_WIDTH_DP, size = MeeshyColorDotSize.S32,
    )
    STATE_DRAWING -> ColorDotsSample(
        ColorDotsSamplePalette.drawing, ColorDotsSampleNames.STROKE_GROUP, widthDp = A13_WIDTH_DP, layout = MeeshyColorDotsLayout.Row,
    )
    STATE_BACKGROUND -> ColorDotsSample(ColorDotsSamplePalette.background, ColorDotsSampleNames.BACKGROUND_GROUP, withRandom = true)
    STATE_NO_CURRENT -> ColorDotsSample(ColorDotsSamplePalette.drawing, ColorDotsSampleNames.STROKE_GROUP, ringless = true)
    STATE_GRADIENT -> ColorDotsSample(ColorDotsSamplePalette.special, ColorDotsSampleNames.BACKGROUND_GROUP)
    STATE_THEME -> ColorDotsSample(ColorDotsSamplePalette.drawing, ColorDotsSampleNames.ACCENT_GROUP, tone = MeeshyGlassTone.Theme)
    else -> ColorDotsSample(ColorDotsSamplePalette.drawing, ColorDotsSampleNames.STROKE_GROUP, enabled = false)
}

/**
 * Le groupe de K07 à la largeur de sa vue : la courante change au toucher, en place ; la tuile « pressé » fige le
 * pré-cercle sur la deuxième pastille ; S1 porte « Aléatoire » (un bouton rond de K02) en fin de flux. Miroir du
 * catalogue iOS (`MeeshyKitCatalog+K07.swift`).
 */
@Composable
internal fun ContentK07(state: MeeshyKitCatalogState, isPressed: Boolean) {
    val sample = remember(state.id) { sampleFor(state.id) }
    var selection by remember(state.id) { mutableStateOf(if (sample.ringless) null else sample.dots.first().id) }
    val random: (@Composable () -> Unit)? = if (sample.withRandom) {
        {
            MeeshyGlassButton(
                icon = MeeshyIcons.Shuffle,
                label = ColorDotsSampleNames.RANDOM,
                onClick = { selection = sample.dots.random().id },
                size = MeeshyGlassButtonSize.S36,
            )
        }
    } else {
        null
    }
    MeeshyColorDots(
        dots = sample.dots,
        label = sample.label,
        modifier = Modifier.widthIn(max = sample.widthDp.dp),
        selection = selection,
        size = sample.size,
        layout = sample.layout,
        tone = sample.tone,
        enabled = sample.enabled,
        pressedDot = if (isPressed) sample.dots[1].id else null,
        onSelect = { selection = it },
        trailing = random,
    )
}
