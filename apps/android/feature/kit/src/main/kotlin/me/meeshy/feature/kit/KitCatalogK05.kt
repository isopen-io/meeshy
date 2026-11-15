package me.meeshy.feature.kit

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt
import me.meeshy.ui.component.kit.LocalMeeshyGlassTone
import me.meeshy.ui.component.kit.LocalMeeshyLabeledSliderForcesPressed
import me.meeshy.ui.component.kit.MeeshyGlassTone
import me.meeshy.ui.component.kit.MeeshyKitCatalogBackdrop
import me.meeshy.ui.component.kit.MeeshyKitCatalogEntry
import me.meeshy.ui.component.kit.MeeshyKitCatalogState
import me.meeshy.ui.component.kit.MeeshyLabeledSlider
import me.meeshy.ui.component.kit.MeeshySliderTrack
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/** Les états de K05, ceux d'iOS : la planche A2, O5, le ton `theme`, le désactivé et la piste seule. */
internal val entryK05: MeeshyKitCatalogEntry = MeeshyKitCatalogEntry(
    key = "K05",
    name = "MeeshyLabeledSlider",
    states = listOf(
        MeeshyKitCatalogState(id = STATE_VALUE, boardView = "A2", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_NO_VALUE, boardView = "O5", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_LOWEST, boardView = "O5", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_NEUTRAL, backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_TINTED, backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_THEME, backdrop = MeeshyKitCatalogBackdrop.Light, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_DISABLED, backdrop = MeeshyKitCatalogBackdrop.Media),
        MeeshyKitCatalogState(id = STATE_TRACK, backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_GRID, boardView = "O5", backdrop = MeeshyKitCatalogBackdrop.Media),
    ),
)

private const val STATE_VALUE = "valeur"
private const val STATE_NO_VALUE = "sans-valeur"
private const val STATE_LOWEST = "borne-basse"
private const val STATE_NEUTRAL = "neutre"
private const val STATE_TINTED = "teinte"
private const val STATE_THEME = "theme"
private const val STATE_DISABLED = "desactive"
private const val STATE_TRACK = "piste-seule"
private const val STATE_GRID = "grille"

private const val RESET_LABEL = "Remettre à zéro"

private val PANEL_WIDTH: Dp = 300.dp
private val COLUMN_WIDTH: Dp = 162.dp

/** Un réglage du catalogue : ce que l'hôte passerait au curseur. Libellés de développement, comme K02. */
private data class SampleSetting(
    val label: String,
    val initial: Float,
    val range: ClosedFloatingPointRange<Float> = 0f..100f,
    val unit: String = "",
    val neutral: Float? = null,
) {
    fun valueText(value: Float): String {
        val rounded = value.roundToInt()
        val signed = if (neutral != null && rounded > 0) "+$rounded" else "$rounded"
        return if (unit.isEmpty()) signed else "$signed $unit"
    }
}

/** Les onze réglages d'O5, dans l'ordre de la planche, rangés par deux. */
private val photoAdjustmentRows: List<List<SampleSetting>> = listOf(
    listOf(SampleSetting("Exposition", 10f, -100f..100f, neutral = 0f), SampleSetting("Luminosité", 24f, -100f..100f, neutral = 0f)),
    listOf(SampleSetting("Contraste", 16f, -100f..100f, neutral = 0f), SampleSetting("Saturation", 40f, -100f..100f, neutral = 0f)),
    listOf(SampleSetting("Vibrance", 0f, -100f..100f, neutral = 0f), SampleSetting("Température", -12f, -100f..100f, neutral = 0f)),
    listOf(SampleSetting("Netteté", 30f), SampleSetting("Flou", 0f)),
    listOf(SampleSetting("Vignette", 20f), SampleSetting("Bloom", 10f)),
    listOf(SampleSetting("Grain", 15f)),
)

/**
 * L'échantillon d'un état. Chaque curseur vit : il garde sa propre valeur. La tuile « pressé » fige le pouce tenu, rien
 * d'autre (un curseur ne se tient pas pressé hors écran).
 */
@Composable
internal fun ContentK05(state: MeeshyKitCatalogState, isPressed: Boolean) {
    CompositionLocalProvider(
        LocalMeeshyLabeledSliderForcesPressed provides isPressed,
        LocalMeeshyGlassTone provides if (state.id == STATE_THEME) MeeshyGlassTone.Theme else MeeshyGlassTone.Deep,
    ) {
        when (state.id) {
            STATE_VALUE -> SampleRow(SampleSetting("Taille", 40f, 14f..160f, unit = "pt"), width = PANEL_WIDTH)
            STATE_NO_VALUE -> SampleRow(
                SampleSetting("Luminosité", 24f, -100f..100f, neutral = 0f), showsValue = false, width = PANEL_WIDTH,
            )
            STATE_LOWEST -> SampleRow(SampleSetting("Flou", 0f), showsValue = false, width = PANEL_WIDTH)
            STATE_NEUTRAL -> SampleRow(SampleSetting("Contraste", 0f, -100f..100f, neutral = 0f), width = PANEL_WIDTH)
            STATE_TINTED -> SampleRow(
                SampleSetting("Volume", 70f, unit = "%"), tint = MeeshyPalette.Indigo500, width = PANEL_WIDTH,
            )
            STATE_THEME -> SampleRow(SampleSetting("Volume", 70f, unit = "%"), width = PANEL_WIDTH)
            STATE_DISABLED -> SampleRow(
                SampleSetting("Épaisseur", 2f, 1f..24f, unit = "pt"), enabled = false, width = PANEL_WIDTH,
            )
            STATE_TRACK -> SampleTrack()
            else -> SampleGrid()
        }
    }
}

/** Un curseur du catalogue, vivant, avec son nom et sa valeur. */
@Composable
private fun SampleRow(
    setting: SampleSetting,
    width: Dp,
    showsValue: Boolean = true,
    tint: Color? = null,
    enabled: Boolean = true,
) {
    var value by remember(setting) { mutableFloatStateOf(setting.initial) }
    MeeshyLabeledSlider(
        label = setting.label,
        value = value,
        onValueChange = { value = it },
        valueText = setting.valueText(value),
        modifier = Modifier.width(width),
        range = setting.range,
        step = 1f,
        showsValue = showsValue,
        neutral = setting.neutral,
        resetLabel = if (setting.neutral == null) null else RESET_LABEL,
        tint = tint,
        enabled = enabled,
    )
}

/** La piste seule du catalogue : nom et valeur annoncés, aucun en-tête visible. */
@Composable
private fun SampleTrack() {
    var value by remember { mutableFloatStateOf(0.6f) }
    MeeshySliderTrack(
        label = "Intensité",
        value = value,
        onValueChange = { value = it },
        valueText = "${(value * 100f).roundToInt()} %",
        modifier = Modifier.width(PANEL_WIDTH),
        range = 0f..1f,
    )
}

/** Les onze réglages d'O5 sur deux colonnes, sans valeur visible. */
@Composable
private fun SampleGrid() {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        photoAdjustmentRows.forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.lg)) {
                row.forEach { setting ->
                    SampleRow(setting, width = COLUMN_WIDTH, showsValue = false)
                }
            }
        }
    }
}
