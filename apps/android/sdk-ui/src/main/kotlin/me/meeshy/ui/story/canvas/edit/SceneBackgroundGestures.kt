package me.meeshy.ui.story.canvas.edit

import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.input.pointer.pointerInput

/**
 * Les gestes du FOND de la scène : un toucher, un double-toucher et un appui long. Le toucher n'est émis qu'APRÈS l'échec
 * du double-toucher (le délai de `detectTapGestures`), pour ne pas ouvrir deux fois le même panneau. Un geste qu'un objet
 * a déjà consommé n'arrive pas ici. [onDoubleTap] et [onLongPress] à `null` : le geste n'est pas reconnu.
 */
public fun Modifier.sceneBackgroundGestures(
    onTap: () -> Unit,
    onDoubleTap: (() -> Unit)? = null,
    onLongPress: (() -> Unit)? = null,
): Modifier = composed {
    val tap = rememberUpdatedState(onTap)
    val double = rememberUpdatedState(onDoubleTap)
    val long = rememberUpdatedState(onLongPress)
    Modifier.pointerInput(onDoubleTap != null, onLongPress != null) {
        detectTapGestures(
            onDoubleTap = if (onDoubleTap != null) ({ _ -> double.value?.invoke() }) else null,
            onLongPress = if (onLongPress != null) ({ _ -> long.value?.invoke() }) else null,
            onTap = { tap.value() },
        )
    }
}
