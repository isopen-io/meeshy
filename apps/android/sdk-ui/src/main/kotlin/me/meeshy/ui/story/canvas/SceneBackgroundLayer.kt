package me.meeshy.ui.story.canvas

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush

/** Le fond uni ou dégradé d'une scène sans média de fond. */
@Composable
public fun SceneBackgroundLayer(brush: Brush, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize().background(brush))
}
