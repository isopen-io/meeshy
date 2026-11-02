package me.meeshy.app.stories

import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf

/**
 * Le transport de la frise (#13481), partagé par l'hôte du compositeur : la frise dit si elle LIT, et qu'elle est
 * ouverte ; la scène vivante ([rememberComposerLive]) y règle ses lecteurs sur la tête de lecture tant qu'une frise est
 * montée — en lecture avec elle, figés sur l'image de l'instant à l'arrêt.
 */
@Stable
internal class FriseTransport {
    var playing by mutableStateOf(false)
    private var mounted by mutableIntStateOf(0)

    val isOpen: Boolean get() = mounted > 0

    fun mount() {
        mounted += 1
    }

    fun unmount() {
        mounted = maxOf(0, mounted - 1)
        if (mounted == 0) playing = false
    }
}

internal val LocalFriseTransport = staticCompositionLocalOf<FriseTransport?> { null }
