package me.meeshy.feature.kit

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import me.meeshy.ui.component.kit.MeeshyColorDot
import me.meeshy.ui.component.kit.MeeshyColorDotFill
import me.meeshy.ui.component.kit.MeeshyColorDotSize
import me.meeshy.ui.component.kit.MeeshyColorDots
import me.meeshy.ui.component.kit.MeeshyColorDotsLayout
import me.meeshy.ui.component.kit.MeeshyGlassTone
import me.meeshy.ui.component.kit.MeeshyKitCatalogBackdrop
import me.meeshy.ui.component.kit.MeeshyKitCatalogEntry
import me.meeshy.ui.component.kit.MeeshyKitCatalogState
import me.meeshy.ui.theme.MeeshyAdaptiveColors
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private const val STATE_TEXT = "texte"
private const val STATE_DRAWING = "dessin"
private const val STATE_BACKGROUND = "fond"
private const val STATE_NO_CURRENT = "sans-courante"
private const val STATE_GRADIENT = "degrade"
private const val STATE_THEME = "theme"
private const val STATE_DISABLED = "desactive"

/** Les noms des pastilles de l'échantillon : des identifiants de développement, pas des textes publiés (fiche K07 §1). */
private object SampleNames {
    const val TEXT_GROUP = "Couleur du texte"
    const val BACKGROUND_GROUP = "Arrière-plan"
    const val DRAWING_GROUP = "Couleur du dessin"
    const val RANDOM = "Aléatoire"
    const val CORAL = "Corail"
    const val SAFFRON = "Safran"
    const val BLUE = "Bleu"
    const val AMETHYST = "Améthyste"
    const val SKY = "Ciel"
    const val EMERALD = "Émeraude"
    const val TEAL = "Sarcelle"
    const val ROSE = "Rose"
    const val INDIGO = "Indigo"
}

/** Les états de K07, ceux de la fiche : texte, dessin, fond, sans courante, dégradé, thème et désactivé. */
internal val entryK07: MeeshyKitCatalogEntry = MeeshyKitCatalogEntry(
    key = "K07",
    name = "MeeshyColorDots",
    states = listOf(
        MeeshyKitCatalogState(id = STATE_TEXT, boardView = "A3", backdrop = MeeshyKitCatalogBackdrop.Dark),
        MeeshyKitCatalogState(id = STATE_DRAWING, boardView = "A13", backdrop = MeeshyKitCatalogBackdrop.Media),
        MeeshyKitCatalogState(id = STATE_BACKGROUND, boardView = "S1", backdrop = MeeshyKitCatalogBackdrop.Media),
        MeeshyKitCatalogState(id = STATE_NO_CURRENT, backdrop = MeeshyKitCatalogBackdrop.Dark),
        MeeshyKitCatalogState(id = STATE_GRADIENT, backdrop = MeeshyKitCatalogBackdrop.Dark),
        MeeshyKitCatalogState(id = STATE_THEME, backdrop = MeeshyKitCatalogBackdrop.Light),
        MeeshyKitCatalogState(id = STATE_DISABLED, backdrop = MeeshyKitCatalogBackdrop.Dark),
    ),
)

/** Un échantillon : les pastilles, la courante de départ, et la disposition de la vue. */
private data class ColorDotsSample(
    val dots: List<MeeshyColorDot>,
    val selection: String?,
    val label: String,
    val size: MeeshyColorDotSize,
    val layout: MeeshyColorDotsLayout,
    val tone: MeeshyGlassTone?,
    val enabled: Boolean,
    val withTrailing: Boolean,
)

private fun solid(id: String, name: String, color: Color): MeeshyColorDot =
    MeeshyColorDot(id = id, fill = MeeshyColorDotFill.Solid(color), name = name)

private val TEXT_DOTS: List<MeeshyColorDot> = listOf(
    solid("coral", SampleNames.CORAL, MeeshyPalette.TileCoral),
    solid("saffron", SampleNames.SAFFRON, MeeshyPalette.TileSaffron),
    solid("blue", SampleNames.BLUE, MeeshyPalette.TileBlue),
    solid("amethyst", SampleNames.AMETHYST, MeeshyPalette.TileAmethyst),
    solid("sky", SampleNames.SKY, MeeshyPalette.TileSky),
    solid("emerald", SampleNames.EMERALD, MeeshyPalette.TileEmerald),
    solid("teal", SampleNames.TEAL, MeeshyPalette.TileTeal),
    solid("rose", SampleNames.ROSE, MeeshyPalette.TileRose),
    solid("indigo", SampleNames.INDIGO, MeeshyPalette.Indigo950),
    solid("violet", "Violet", MeeshyPalette.Violet950),
    solid("purple", "Pourpre", MeeshyPalette.Purple500),
    solid("success", "Vert", MeeshyPalette.Success),
    solid("error", "Rouge", MeeshyPalette.Error),
    solid("warning", "Ambre", MeeshyPalette.Warning),
)

private val SAMPLES: Map<String, ColorDotsSample> = mapOf(
    STATE_TEXT to ColorDotsSample(
        dots = TEXT_DOTS, selection = "rose", label = SampleNames.TEXT_GROUP,
        size = MeeshyColorDotSize.S32, layout = MeeshyColorDotsLayout.Wrap, tone = null, enabled = true, withTrailing = false,
    ),
    STATE_DRAWING to ColorDotsSample(
        dots = TEXT_DOTS.take(9), selection = "indigo", label = SampleNames.DRAWING_GROUP,
        size = MeeshyColorDotSize.S28, layout = MeeshyColorDotsLayout.Row, tone = null, enabled = true, withTrailing = false,
    ),
    STATE_BACKGROUND to ColorDotsSample(
        dots = TEXT_DOTS + TEXT_DOTS.take(3), selection = "blue", label = SampleNames.BACKGROUND_GROUP,
        size = MeeshyColorDotSize.S28, layout = MeeshyColorDotsLayout.Wrap, tone = null, enabled = true, withTrailing = true,
    ),
    STATE_NO_CURRENT to ColorDotsSample(
        dots = TEXT_DOTS.take(5), selection = null, label = SampleNames.TEXT_GROUP,
        size = MeeshyColorDotSize.S28, layout = MeeshyColorDotsLayout.Wrap, tone = null, enabled = true, withTrailing = false,
    ),
    STATE_GRADIENT to ColorDotsSample(
        dots = listOf(
            MeeshyColorDot(id = "none", fill = MeeshyColorDotFill.Hollow, name = SampleNames.RANDOM),
            MeeshyColorDot(
                id = "sunrise",
                fill = MeeshyColorDotFill.Gradient(listOf(MeeshyPalette.TileCoral, MeeshyPalette.TileSaffron)),
                name = SampleNames.CORAL,
            ),
        ) + TEXT_DOTS.take(3),
        selection = "sunrise", label = SampleNames.BACKGROUND_GROUP,
        size = MeeshyColorDotSize.S28, layout = MeeshyColorDotsLayout.Wrap, tone = null, enabled = true, withTrailing = false,
    ),
    STATE_THEME to ColorDotsSample(
        dots = TEXT_DOTS.take(6), selection = "blue", label = SampleNames.TEXT_GROUP,
        size = MeeshyColorDotSize.S28, layout = MeeshyColorDotsLayout.Wrap, tone = MeeshyGlassTone.Theme, enabled = true, withTrailing = false,
    ),
    STATE_DISABLED to ColorDotsSample(
        dots = TEXT_DOTS.take(4), selection = "coral", label = SampleNames.TEXT_GROUP,
        size = MeeshyColorDotSize.S28, layout = MeeshyColorDotsLayout.Wrap, tone = null, enabled = false, withTrailing = false,
    ),
)

private val RANDOM_ACTION: @Composable () -> Unit = {
    Text(text = SampleNames.RANDOM)
}

/** Le groupe de K07 dans son panneau : la courante change au toucher, en place. */
@Composable
@Suppress("UNUSED_PARAMETER")
internal fun ContentK07(state: MeeshyKitCatalogState, isPressed: Boolean) {
    val sample = SAMPLES.getValue(state.id)
    var selection by remember(state.id) { mutableStateOf(sample.selection) }
    val panelIsDark = if (state.id == STATE_THEME) MeeshyTheme.isDark else true
    Box(
        modifier = Modifier
            .background(MeeshyAdaptiveColors.backgroundPrimary(isDark = panelIsDark), RoundedCornerShape(MeeshyRadius.lg))
            .padding(MeeshySpacing.sm),
    ) {
        MeeshyColorDots(
            dots = sample.dots,
            label = sample.label,
            modifier = Modifier,
            selection = selection,
            size = sample.size,
            layout = sample.layout,
            tone = sample.tone,
            enabled = sample.enabled,
            onSelect = { selection = it },
            trailing = if (sample.withTrailing) RANDOM_ACTION else null,
        )
    }
}
