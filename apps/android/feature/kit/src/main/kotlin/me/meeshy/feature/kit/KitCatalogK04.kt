package me.meeshy.feature.kit

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import me.meeshy.ui.component.kit.MeeshyChip
import me.meeshy.ui.component.kit.MeeshyChipKind
import me.meeshy.ui.component.kit.MeeshyChipRow
import me.meeshy.ui.component.kit.MeeshyChipRowLayout
import me.meeshy.ui.component.kit.MeeshyChipRowMode
import me.meeshy.ui.component.kit.MeeshyChipRowSize
import me.meeshy.ui.component.kit.MeeshyChipRowSurface
import me.meeshy.ui.component.kit.MeeshyChipTrailing
import me.meeshy.ui.component.kit.MeeshyKitCatalogBackdrop
import me.meeshy.ui.component.kit.MeeshyKitCatalogEntry
import me.meeshy.ui.component.kit.MeeshyKitCatalogState
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private const val STATE_SIMPLE = "simple"
private const val STATE_ICON = "icone"
private const val STATE_OVERFLOW = "deborde"
private const val STATE_OVERFLOW_MIDDLE = "deborde-milieu"
private const val STATE_WRAPPED = "replie"
private const val STATE_MULTIPLE = "multiple"
private const val STATE_EQUAL = "egal"
private const val STATE_THEME = "theme"
private const val STATE_COMPACT = "compact"
private const val STATE_DISABLED = "desactive"

private val SAMPLE_WIDTH = 320.dp

/** Les noms de l'échantillon : des identifiants de développement, pas des textes publiés (fiche K00 §1). */
private object ChipSampleNames {
    const val OPENING_EFFECT = "Effet d'ouverture"
    const val EFFECTS = "Effets"
    const val THEMES = "Thèmes"
    const val MENTION_MODE = "Mode de la mention"
    const val RECIPIENTS = "Destinataires"
    const val CALL_TYPE = "Type d'appel"
    const val SEARCH = "Rechercher"
    const val OPEN_LIST = "Ouvre la liste"
    const val REMOVE_RECIPIENT = "Retire le destinataire"
    const val LANGUAGE = "Langue : Français"
}

/** Les états de K04, ceux d'iOS : le choix simple, l'icône, le débord (au début, au milieu), le repli, le multiple, l'égal, le thème, le compact, le désactivé. */
internal val entryK04: MeeshyKitCatalogEntry = MeeshyKitCatalogEntry(
    key = "K04",
    name = "MeeshyChipRow",
    states = listOf(
        MeeshyKitCatalogState(id = STATE_SIMPLE, boardView = "S1", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_ICON, boardView = "A2", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_OVERFLOW, boardView = "A12", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_OVERFLOW_MIDDLE, backdrop = MeeshyKitCatalogBackdrop.Dark),
        MeeshyKitCatalogState(id = STATE_WRAPPED, boardView = "A16", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_MULTIPLE, boardView = "A17", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_EQUAL, backdrop = MeeshyKitCatalogBackdrop.Dark),
        MeeshyKitCatalogState(id = STATE_THEME, backdrop = MeeshyKitCatalogBackdrop.Light),
        MeeshyKitCatalogState(id = STATE_COMPACT, backdrop = MeeshyKitCatalogBackdrop.Dark),
        MeeshyKitCatalogState(id = STATE_DISABLED, backdrop = MeeshyKitCatalogBackdrop.Dark),
    ),
)

/** L'échantillon d'un état : la vraie rangée, vivante (la sélection se change au toucher), figée « pressée » pour la tuile du même nom. */
@Composable
internal fun ContentK04(state: MeeshyKitCatalogState, isPressed: Boolean) {
    var selection by remember(state.id) { mutableStateOf(initialSelection(state.id)) }
    val onChange: (Set<String>, String) -> Unit = { next, _ -> selection = next }
    val sample = Modifier.width(SAMPLE_WIDTH)
    when (state.id) {
        STATE_ICON -> SampleRow(sample, ICONS, ChipSampleNames.EFFECTS, selection, onChange, isPressed)
        STATE_OVERFLOW, STATE_OVERFLOW_MIDDLE -> SampleRow(sample, THEMES, ChipSampleNames.THEMES, selection, onChange, isPressed)
        STATE_WRAPPED -> SampleRow(sample, MENTION_MODES, ChipSampleNames.MENTION_MODE, selection, onChange, isPressed, layout = MeeshyChipRowLayout.Wrap)
        STATE_MULTIPLE -> SampleRow(
            sample,
            AUDIENCES.map { chip ->
                if (chip.id in selection) chip.copy(trailing = MeeshyChipTrailing.Remove, hint = ChipSampleNames.REMOVE_RECIPIENT) else chip
            },
            ChipSampleNames.RECIPIENTS, selection, onChange, isPressed, mode = MeeshyChipRowMode.Multiple, layout = MeeshyChipRowLayout.Wrap,
        )
        STATE_EQUAL -> SampleRow(sample, CALL_TYPES, ChipSampleNames.CALL_TYPE, selection, onChange, isPressed, layout = MeeshyChipRowLayout.Equal)
        STATE_THEME -> SampleRow(
            sample.background(MeeshyTheme.tokens.backgroundPrimary).padding(MeeshySpacing.sm),
            EFFECTS, ChipSampleNames.OPENING_EFFECT, selection, onChange, isPressed, surface = MeeshyChipRowSurface.Theme,
        )
        STATE_COMPACT -> SampleRow(sample, EFFECTS, ChipSampleNames.OPENING_EFFECT, selection, onChange, isPressed, size = MeeshyChipRowSize.Compact)
        STATE_DISABLED -> SampleRow(sample, EFFECTS, ChipSampleNames.OPENING_EFFECT, selection, onChange, isPressed, enabled = false)
        else -> SampleRow(sample, EFFECTS, ChipSampleNames.OPENING_EFFECT, selection, onChange, isPressed)
    }
}

@Composable
private fun SampleRow(
    modifier: Modifier,
    chips: List<MeeshyChip<String>>,
    label: String,
    selection: Set<String>,
    onChange: (Set<String>, String) -> Unit,
    isPressed: Boolean,
    mode: MeeshyChipRowMode = MeeshyChipRowMode.Single,
    layout: MeeshyChipRowLayout = MeeshyChipRowLayout.Scroll,
    surface: MeeshyChipRowSurface = MeeshyChipRowSurface.OnMedia,
    size: MeeshyChipRowSize = MeeshyChipRowSize.Regular,
    enabled: Boolean = true,
) {
    MeeshyChipRow(
        chips = chips,
        selection = selection,
        label = label,
        onChange = onChange,
        modifier = modifier,
        mode = mode,
        layout = layout,
        surface = surface,
        size = size,
        enabled = enabled,
        pressedChip = if (isPressed) chips.firstOrNull { it.id !in selection && it.kind == MeeshyChipKind.Choice }?.id else null,
    )
}

private val EFFECTS = listOf("none" to "Aucun", "fade" to "Fondu", "zoom" to "Zoom", "slide" to "Glisse")
    .map { (id, title) -> MeeshyChip(id = id, title = title) }

private val ICONS = listOf(
    MeeshyChip(id = "all", title = "Tout", icon = MeeshyIcons.Globe),
    MeeshyChip(id = "favorites", title = "Favoris", icon = MeeshyIcons.Star),
    MeeshyChip(id = "search", title = "", icon = MeeshyIcons.Search, accessibilityLabel = ChipSampleNames.SEARCH),
    MeeshyChip(
        id = "language", title = ChipSampleNames.LANGUAGE, trailing = MeeshyChipTrailing.Chevron, kind = MeeshyChipKind.Menu,
        hint = ChipSampleNames.OPEN_LIST,
    ),
)

private val THEMES = listOf("Tout", "Nature", "Ville", "Fête", "Sport", "Voyage", "Cuisine", "Musique", "Art", "Cinéma", "Jeux", "Mode")
    .map { MeeshyChip(id = it, title = it) }

private val MENTION_MODES = listOf("all" to "Tout le monde", "friends" to "Mes amis", "none" to "Personne")
    .map { (id, title) -> MeeshyChip(id = id, title = title) }

private val AUDIENCES = listOf("Amis", "Famille", "Collègues", "Voisins", "Équipe").map { MeeshyChip(id = it, title = it) }

private val CALL_TYPES = listOf(MeeshyChip(id = "audio", title = "Audio"), MeeshyChip(id = "video", title = "Vidéo"))

private fun initialSelection(stateId: String): Set<String> = when (stateId) {
    STATE_OVERFLOW_MIDDLE -> setOf("Cuisine")
    STATE_ICON -> setOf("all")
    STATE_OVERFLOW -> setOf("Tout")
    STATE_WRAPPED -> setOf("friends")
    STATE_MULTIPLE -> setOf("Amis", "Équipe")
    STATE_EQUAL -> setOf("audio")
    else -> setOf("fade")
}
