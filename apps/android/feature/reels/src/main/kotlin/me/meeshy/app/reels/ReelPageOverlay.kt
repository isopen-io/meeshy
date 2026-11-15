package me.meeshy.app.reels

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import me.meeshy.ui.component.fullscreen.FullscreenChromeDimens
import me.meeshy.ui.component.fullscreen.FullscreenChromeVisibility
import me.meeshy.ui.component.fullscreen.FullscreenScrims
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Le chrome d'une page de réel : voiles, puis (en fondu, sorti de l'arbre d'accessibilité et des touches
 * dès qu'il est masqué) la rangée du bas — [info] à gauche, [rail] d'actions à droite — et la barre de
 * lecture [scrubBar] dessous. Les emplacements sont vides par défaut : chaque lot y pose le sien.
 */
@Composable
internal fun ReelPageOverlay(
    chromeHidden: Boolean,
    modifier: Modifier = Modifier,
    topEnd: @Composable BoxScope.() -> Unit = {},
    info: @Composable (Modifier) -> Unit = {},
    rail: @Composable () -> Unit = {},
    scrubBar: (@Composable () -> Unit)? = null,
) {
    // Les voiles passent SOUS le chrome : posés au-dessus, ils assombrissaient le bas du rail comme une action désactivée.
    FullscreenScrims(
        topInset = WindowInsets.statusBars.asPaddingValues().calculateTopPadding(),
        chromeVisible = !chromeHidden,
    )
    FullscreenChromeVisibility(visible = !chromeHidden, modifier = modifier.fillMaxSize()) {
        topEnd()
        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = FullscreenChromeDimens.edgeInset)
                .padding(bottom = MeeshySpacing.md),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                info(Modifier.weight(1f))
                rail()
            }
            scrubBar?.invoke()
        }
    }
}
