package me.meeshy.app.calls

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import me.meeshy.sdk.model.call.CallChromeStow
import me.meeshy.sdk.model.call.CallModeChromeMotion
import me.meeshy.sdk.model.call.CallScreenMode

/**
 * #17814 · C1.12 — la couche d'un mode (loi 17) : elle fond à l'entrée comme à la sortie, interruptible, et ne quitte la
 * composition qu'au bout du fondu. Ce que [content] pose avec le modificateur `chrome` qu'il reçoit (la barre et le
 * carrousel) monte du bas et y redescend quand [CallModeChromeMotion] le veut : jamais pour Effets, jamais sous
 * « Réduire les animations », où le seul fondu court de [CallChromeStow] reste. Seules l'opacité et la position bougent,
 * lues au placement et au dessin : aucune recomposition par image. Miroir de la transition de iOS `CallView+Mode`.
 */
@Composable
internal fun CallModeLayer(
    visible: Boolean,
    mode: CallScreenMode,
    reduceMotion: Boolean,
    content: @Composable BoxScope.(chrome: Modifier) -> Unit,
) {
    val millis = CallChromeStow.fadeMillis(reduceMotion)
    val rises = CallModeChromeMotion.risesFromBottom(mode, reduceMotion)
    AnimatedVisibility(
        visible = visible,
        modifier = Modifier.fillMaxSize(),
        enter = fadeIn(tween(millis)),
        exit = fadeOut(tween(millis)),
    ) {
        val chrome = Modifier.animateEnterExit(
            enter = if (rises) slideInVertically(tween(millis)) { it } + fadeIn(tween(millis)) else EnterTransition.None,
            exit = if (rises) slideOutVertically(tween(millis)) { it } + fadeOut(tween(millis)) else ExitTransition.None,
        )
        Box(Modifier.fillMaxSize()) { content(chrome) }
    }
}
