package me.meeshy.ui.component.kit

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * Regroupe des surfaces de verre voisines. Android n'a pas de Liquid Glass à fusionner : le groupe garde une matière par
 * surface, et une surface posée DANS un verre dessiné n'en porte pas de seconde (`LocalMeeshyGlassNested`). Il ne
 * réordonne rien pour les lecteurs d'écran. Pendant iOS : `MeeshyGlassGroup`.
 *
 * L'appui d'un verre dessiné vient de la source d'interaction de son contrôle, passée à `MeeshyGlass` : aucun style de
 * bouton à poser ici.
 */
@Composable
public fun MeeshyGlassGroup(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(modifier = modifier, content = content)
}
