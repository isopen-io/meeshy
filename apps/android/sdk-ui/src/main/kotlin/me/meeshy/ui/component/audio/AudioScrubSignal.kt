package me.meeshy.ui.component.audio

import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf

/**
 * Signal « scrubbing en cours » — miroir de `MediaScrubbingPreferenceKey` d'iOS. L'hôte (rangée de
 * bulle à balayage « répondre ») le lit pour désengager ses gestes horizontaux le temps du geste.
 * Un compteur plutôt qu'un booléen : deux lecteurs ne se retirent pas le signal l'un l'autre.
 */
@Stable
public class AudioScrubSignal {
    private var active by mutableIntStateOf(0)

    public val isScrubbing: Boolean get() = active > 0

    internal fun begin() {
        active += 1
    }

    internal fun end() {
        active = (active - 1).coerceAtLeast(0)
    }
}

/** Fourni par l'hôte qui veut être prévenu ; absent = personne n'écoute. */
public val LocalAudioScrubSignal: ProvidableCompositionLocal<AudioScrubSignal?> = staticCompositionLocalOf<AudioScrubSignal?> { null }
