package me.meeshy.app.stories

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import me.meeshy.ui.component.fullscreen.FullscreenScrims

/**
 * Les voiles de lisibilité du lecteur (iOS `StoryReaderScrims`) : deux dégradés noirs, en haut et en bas de l'écran,
 * qui n'existent QUE pour les contrôles et s'effacent avec eux — la lecture immersive montre l'image telle qu'elle a
 * été publiée. Le dessin est celui du kit plein écran, que la galerie et le réel montent aussi.
 */
@Composable
internal fun StoryReadingScrims(chromeVisible: Boolean, modifier: Modifier = Modifier) {
    FullscreenScrims(
        topInset = WindowInsets.statusBars.asPaddingValues().calculateTopPadding(),
        chromeVisible = chromeVisible,
        modifier = modifier,
    )
}
