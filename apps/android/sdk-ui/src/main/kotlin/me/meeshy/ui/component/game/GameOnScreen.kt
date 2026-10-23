package me.meeshy.ui.component.game

import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalView
import me.meeshy.sdk.model.game.GameOnScreenLaw

/**
 * Dit à [onChange] quand la vue entre dans la zone visible ou en sort. Une boucle d'animation (le
 * vacillement de la Flamme) doit s'arrêter hors écran : `onDispose` ne le dit PAS dans une `Column`
 * défilante non paresseuse, où tout le contenu est composé d'emblée. La frame est donc comparée à la
 * fenêtre à chaque pose, défilement compris. La vue est « visible » tant qu'aucune pose ne dit le contraire.
 */
public fun Modifier.gameOnScreen(onChange: (Boolean) -> Unit): Modifier = composed {
    val view = LocalView.current
    val last = remember { mutableStateOf<Boolean?>(null) }
    onGloballyPositioned { coordinates ->
        val bounds = coordinates.boundsInWindow()
        val visible = coordinates.isAttached && GameOnScreenLaw.isVisible(
            left = bounds.left, top = bounds.top, right = bounds.right, bottom = bounds.bottom,
            windowWidth = view.rootView.width.toFloat(), windowHeight = view.rootView.height.toFloat(),
        )
        if (last.value != visible) {
            last.value = visible
            onChange(visible)
        }
    }
}
