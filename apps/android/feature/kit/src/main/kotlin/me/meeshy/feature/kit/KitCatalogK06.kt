package me.meeshy.feature.kit

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import me.meeshy.ui.component.kit.MeeshyKitCatalogBackdrop
import me.meeshy.ui.component.kit.MeeshyKitCatalogEntry
import me.meeshy.ui.component.kit.MeeshyKitCatalogState
import me.meeshy.ui.component.kit.MeeshyToggleRow
import me.meeshy.ui.component.kit.MeeshyToggleRowAccessory
import me.meeshy.ui.component.kit.MeeshyToggleRowKind
import me.meeshy.ui.component.kit.MeeshyGlassTone
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Les états de K06, ceux d'iOS (`MeeshyKitCatalog+K06`) : l'action, le sous-titre, la bascule ouverte et fermée, la coche,
 * la case, le chevron, la valeur, le destructif, l'accent, le désactivé, les emplacements, le groupe, le ton thème et la
 * teinte. Les textes sont ceux de la planche, non traduits : un échantillon de catalogue n'est pas une vue de l'app.
 */
internal val entryK06: MeeshyKitCatalogEntry = MeeshyKitCatalogEntry(
    key = "K06",
    name = "MeeshyToggleRow",
    states = listOf(
        MeeshyKitCatalogState(id = "action", boardView = "R11", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = "sous-titre", boardView = "A17", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = "sans-icone", boardView = "O10", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = "bascule-ouverte", boardView = "R11", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = "bascule-fermee", boardView = "A15", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = "coche", boardView = "A18", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = "case", boardView = "R7", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = "chevron", boardView = "A14", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = "valeur", boardView = "A15", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = "destructif", boardView = "R11", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = "accent", boardView = "A18", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = "desactive", boardView = "R7", backdrop = MeeshyKitCatalogBackdrop.Dark),
        MeeshyKitCatalogState(id = "emplacements", boardView = "A16", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = "groupe", boardView = "R11", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = "theme", backdrop = MeeshyKitCatalogBackdrop.Light, isTouchable = true),
        MeeshyKitCatalogState(id = "teinte", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
    ),
)

/** L'échantillon d'un état : une ligne (ou un groupe de lignes) posée sur le fond du catalogue. [isPressed] est ignoré, comme sur iOS. */
@Composable
@Suppress("UNUSED_PARAMETER")
internal fun ContentK06(state: MeeshyKitCatalogState, isPressed: Boolean) {
    Column(Modifier.padding(MeeshySpacing.sm)) {
        ToggleRowSample(stateId = state.id)
    }
}

@Composable
private fun ToggleRowSample(stateId: String) {
    when (stateId) {
        "action" -> MeeshyToggleRow(title = "Partager hors de Meeshy", icon = MeeshyIcons.Share, onClick = {})
        "sous-titre" -> MeeshyToggleRow(title = "Tendances", subtitle = "Monde", accessory = MeeshyToggleRowAccessory.Chevron, onClick = {})
        "sans-icone" -> MeeshyToggleRow(
            title = "Visible du début à la fin",
            accessory = MeeshyToggleRowAccessory.Toggle(isOn = false),
            onClick = {},
        )
        "bascule-ouverte" -> MeeshyToggleRow(
            title = "Reprise du son",
            subtitle = "Son original",
            accessory = MeeshyToggleRowAccessory.Toggle(isOn = true),
            onClick = {},
        )
        "bascule-fermee" -> MeeshyToggleRow(
            title = "Muet",
            icon = MeeshyIcons.VolumeOff,
            accessory = MeeshyToggleRowAccessory.Toggle(isOn = false),
            onClick = {},
        )
        "coche" -> MeeshyToggleRow(
            title = "Plage de Ngor",
            icon = MeeshyIcons.LocationFilled,
            accessory = MeeshyToggleRowAccessory.Check(isSelected = true),
            onClick = {},
        )
        "case" -> MeeshyToggleRow(title = "Story", accessory = MeeshyToggleRowAccessory.Checkbox(isChecked = true), onClick = {})
        "chevron" -> MeeshyToggleRow(title = "Langue du son", accessory = MeeshyToggleRowAccessory.Chevron, onClick = {})
        "valeur" -> MeeshyToggleRow(title = "Langue du son", accessory = MeeshyToggleRowAccessory.Value("Wolof"), onClick = {})
        "destructif" -> MeeshyToggleRow(title = "Tout effacer", kind = MeeshyToggleRowKind.Destructive, onClick = {})
        "accent" -> MeeshyToggleRow(
            title = "Autour de moi",
            icon = MeeshyIcons.MyLocation,
            kind = MeeshyToggleRowKind.Accent,
            onClick = {},
        )
        "desactive" -> MeeshyToggleRow(
            title = "Mood",
            subtitle = "Disponible en Proche",
            accessory = MeeshyToggleRowAccessory.Toggle(isOn = false),
            enabled = false,
            onClick = {},
        )
        "emplacements" -> MeeshyToggleRow(title = "Amis", onClick = {})
        "groupe" -> Column {
            MeeshyToggleRow(title = "Partager", icon = MeeshyIcons.Share, onClick = {})
            MeeshyToggleRow(title = "Copier le lien", icon = MeeshyIcons.Link, showsDivider = true, onClick = {})
            MeeshyToggleRow(title = "Tout effacer", kind = MeeshyToggleRowKind.Destructive, showsDivider = true, onClick = {})
        }
        "teinte" -> MeeshyToggleRow(
            title = "Mention",
            accessory = MeeshyToggleRowAccessory.Toggle(isOn = true),
            tint = MeeshyPalette.Indigo500,
            onClick = {},
        )
        else -> MeeshyToggleRow(
            title = "Thème",
            accessory = MeeshyToggleRowAccessory.Toggle(isOn = true),
            tone = MeeshyGlassTone.Theme,
            onClick = {},
        )
    }
}
