package me.meeshy.feature.kit

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import me.meeshy.ui.component.kit.MeeshyKitCatalogBackdrop
import me.meeshy.ui.component.kit.MeeshyKitCatalogState
import me.meeshy.ui.theme.DarkMeeshyTokens
import me.meeshy.ui.theme.LightMeeshyTokens
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshySpacing

/**
 * La scène d'une tuile : le composant, cadré à sa taille naturelle avec une marge `md`, sur le fond de son état. Le
 * catalogue et les instantanés la partagent, donc l'image prouve exactement ce que l'écran montre.
 */
@Composable
public fun MeeshyKitCatalogStage(
    key: String,
    state: MeeshyKitCatalogState,
    modifier: Modifier = Modifier,
    isPressed: Boolean = false,
    content: KitTileContent = DefaultKitTileContent,
) {
    Box(modifier.then(stageBackdrop(state.backdrop)).padding(MeeshySpacing.md)) {
        content(key, state, isPressed)
    }
}

/** Ce qu'une tuile montre : le composant de la clé, dans l'état demandé, vivant ou figé pressé. */
public typealias KitTileContent = @Composable (key: String, state: MeeshyKitCatalogState, isPressed: Boolean) -> Unit

/** Le contenu réel du catalogue : le répartiteur de [MeeshyKitCatalog]. */
public val DefaultKitTileContent: KitTileContent = { key, state, isPressed ->
    MeeshyKitCatalog.Content(key = key, state = state, isPressed = isPressed)
}

private fun stageBackdrop(backdrop: MeeshyKitCatalogBackdrop): Modifier = when (backdrop) {
    MeeshyKitCatalogBackdrop.Dark -> Modifier.background(DarkMeeshyTokens.backgroundPrimary)
    MeeshyKitCatalogBackdrop.Light -> Modifier.background(LightMeeshyTokens.backgroundPrimary)
    MeeshyKitCatalogBackdrop.Media -> Modifier.background(MeeshyGradients.brand)
}
