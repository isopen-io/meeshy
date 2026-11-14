package me.meeshy.feature.kit

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import me.meeshy.ui.component.kit.MeeshyKitCatalogBackdrop
import me.meeshy.ui.component.kit.MeeshyKitCatalogEntry
import me.meeshy.ui.component.kit.MeeshyKitCatalogState
import me.meeshy.ui.component.kit.MeeshySegmented
import me.meeshy.ui.component.kit.MeeshySegmentedOption
import me.meeshy.ui.component.kit.MeeshySegmentedRole
import me.meeshy.ui.component.kit.MeeshySegmentedTone
import me.meeshy.ui.theme.MeeshyAdaptiveColors
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Le choix de K03 : ses libellés, sa sélection, son ton, son rôle et son état, ceux de la planche (S2, A3, A10, A14, A2). */
private data class SegmentedSpec(
    val titles: List<String>,
    val selected: Int,
    val tone: MeeshySegmentedTone = MeeshySegmentedTone.Media,
    val role: MeeshySegmentedRole = MeeshySegmentedRole.Choice,
    val enabled: Boolean = true,
)

/** Les états de K03, ceux d'iOS : deux, quatre, trois (long et milieu), le ton thème, et le désactivé. */
internal val entryK03: MeeshyKitCatalogEntry = MeeshyKitCatalogEntry(
    key = "K03",
    name = "MeeshySegmented",
    states = listOf(
        MeeshyKitCatalogState(id = STATE_DEUX, boardView = "S2", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_DEUX_SECOND, boardView = "A3", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_TROIS_LONG, boardView = "A10", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_TROIS_MILIEU, boardView = "A14", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_QUATRE, boardView = "A2", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_THEME, backdrop = MeeshyKitCatalogBackdrop.Light, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_DESACTIVE, backdrop = MeeshyKitCatalogBackdrop.Dark),
    ),
)

private const val STATE_DEUX = "deux"
private const val STATE_DEUX_SECOND = "deux-second"
private const val STATE_TROIS_LONG = "trois-long"
private const val STATE_TROIS_MILIEU = "trois-milieu"
private const val STATE_QUATRE = "quatre"
private const val STATE_THEME = "theme"
private const val STATE_DESACTIVE = "desactive"

private const val SPECIMEN_WIDTH_DP = 320

/** Le libellé du groupe : il nomme le contrôle pour l'accessibilité, il ne s'affiche jamais. */
private const val SPECIMEN_LABEL = "Choix"

/**
 * L'échantillon d'un état, celui d'iOS : une piste de 320 dp posée sur un panneau opaque qui la borde ; [isPressed] fige
 * l'appui sur le premier segment non courant (un contrôle ne se tient pas pressé hors écran).
 */
@Composable
internal fun ContentK03(state: MeeshyKitCatalogState, isPressed: Boolean) {
    val spec = specFor(state.id)
    var selection by remember(state.id) { mutableStateOf(spec.selected) }
    val panelIsDark = if (state.id == STATE_THEME) MeeshyTheme.isDark else true
    Box(
        modifier = Modifier
            .background(MeeshyAdaptiveColors.backgroundPrimary(isDark = panelIsDark), RoundedCornerShape(MeeshyRadius.lg))
            .padding(MeeshySpacing.sm),
    ) {
        MeeshySegmented(
            label = SPECIMEN_LABEL,
            selected = selection,
            onSelect = { selection = it },
            options = spec.titles.mapIndexed { index, title -> MeeshySegmentedOption(id = index, title = title) },
            role = spec.role,
            tone = spec.tone,
            enabled = spec.enabled,
            pressed = if (isPressed) spec.titles.indices.firstOrNull { it != selection } else null,
            modifier = Modifier.width(SPECIMEN_WIDTH_DP.dp),
        )
    }
}

private fun specFor(id: String): SegmentedSpec = when (id) {
    STATE_DEUX -> SegmentedSpec(titles = listOf("Ajuster", "Remplir"), selected = 0)
    STATE_DEUX_SECOND -> SegmentedSpec(titles = listOf("Texte", "Contour"), selected = 1, role = MeeshySegmentedRole.Tabs)
    STATE_TROIS_LONG -> SegmentedSpec(
        titles = listOf("Filtres", "Cadres", "Effets de visage"), selected = 0, role = MeeshySegmentedRole.Tabs,
    )
    STATE_TROIS_MILIEU -> SegmentedSpec(titles = listOf("Sur la scène", "Fond de la scène", "Pièce du post"), selected = 1)
    STATE_QUATRE -> SegmentedSpec(titles = listOf("Fin", "Normal", "Semi-gras", "Gras"), selected = 3)
    STATE_THEME -> SegmentedSpec(titles = listOf("Clair", "Sombre"), selected = 0, tone = MeeshySegmentedTone.Theme)
    else -> SegmentedSpec(titles = listOf("Ajuster", "Remplir"), selected = 0, enabled = false)
}
