package me.meeshy.ui.story.canvas

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * L'emplacement du fond de la scène. Le fond (vidéo, image cadrée, aplat) dépend de l'hôte — un lecteur, une tuile du
 * fil, une couverture —, le canevas ne fait que lui réserver la première couche, sous tous les objets.
 */
@Composable
public fun SceneBackdropHost(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(modifier.fillMaxSize()) { content() }
}
