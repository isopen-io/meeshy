package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable

/**
 * Les trois fonds de la planche sur lesquels le verre se juge : `.glass.deep` ([Dark]), `.onlight` ([Light]) et
 * `.glass` posé sur une photo ([Media]). Miroir de `MeeshyKitCatalogBackdrop` (iOS).
 */
public enum class MeeshyKitCatalogBackdrop { Dark, Light, Media }

/**
 * Un état d'un composant du kit. Son [id] (kebab, stable) est le nom de l'image de référence, [boardView] la vue de
 * la planche qui le dessine. Données seules : le modèle du catalogue ne porte aucun composable.
 */
@Immutable
public data class MeeshyKitCatalogState(
    val id: String,
    val boardView: String? = null,
    val backdrop: MeeshyKitCatalogBackdrop = MeeshyKitCatalogBackdrop.Dark,
    val isTouchable: Boolean = false,
)

/** Une tuile du détail : l'état vivant, ou sa jumelle figée [isPressed]. */
@Immutable
public data class MeeshyKitCatalogTile(
    val state: MeeshyKitCatalogState,
    val isPressed: Boolean = false,
) {
    public val id: String get() = if (isPressed) "${state.id}-presse" else state.id
}

/**
 * Un composant du kit au catalogue. Sans état, il n'est pas livré : la liste ne l'affiche pas (loi 13, ni ligne
 * grisée ni « à venir »).
 */
@Immutable
public data class MeeshyKitCatalogEntry(
    val key: String,
    val name: String,
    val states: List<MeeshyKitCatalogState> = emptyList(),
) {
    public val isDelivered: Boolean get() = states.isNotEmpty()

    public val accessibilityName: String get() = "$key $name"

    /**
     * Les tuiles du détail, dans l'ordre de la fiche : la tuile pressée suit la tuile vivante, et n'existe que pour un
     * état qui se touche.
     */
    public val tiles: List<MeeshyKitCatalogTile>
        get() = states.flatMap { state ->
            if (state.isTouchable) {
                listOf(MeeshyKitCatalogTile(state), MeeshyKitCatalogTile(state, isPressed = true))
            } else {
                listOf(MeeshyKitCatalogTile(state))
            }
        }
}
