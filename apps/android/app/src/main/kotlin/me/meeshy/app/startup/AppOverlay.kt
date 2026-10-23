package me.meeshy.app.startup

import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.navigation.NavHostController

/**
 * Une couche dessinee PAR-DESSUS le `NavHost` (bandeaux, pilules, feuilles globales),
 * contribuee en `@IntoSet`. Les couches sont empilees par [order] croissant (la plus
 * grande est au-dessus), toujours SOUS le splash de demarrage.
 */
interface AppOverlay {
    val order: Int get() = 0

    @Composable
    fun Content(navController: NavHostController)
}

@Composable
internal fun AppOverlayStack(overlays: List<AppOverlay>, navController: NavHostController) {
    overlays.forEach { overlay ->
        key(overlay.javaClass.name) { overlay.Content(navController) }
    }
}
