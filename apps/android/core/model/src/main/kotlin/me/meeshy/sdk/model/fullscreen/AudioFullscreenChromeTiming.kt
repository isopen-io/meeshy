package me.meeshy.sdk.model.fullscreen

import kotlin.time.Duration

/**
 * **Quand le chrome du plein écran audio s'efface de lui-même** (miroir de `AudioFullscreenChromeTiming`) : la règle de
 * [FullscreenChromeState.autoHideDelay] — trois secondes de lecture, chrome visible, rien d'ouvert —, et jamais sous un
 * lecteur d'écran, qui ne retrouverait plus les boutons qu'il vient de parcourir.
 */
public object AudioFullscreenChromeTiming {

    public fun autoHideDelay(state: FullscreenChromeState, isPlaying: Boolean, screenReaderRunning: Boolean): Duration? =
        if (screenReaderRunning) null else state.autoHideDelay(isPlaying)
}
