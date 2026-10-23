package me.meeshy.sdk.call

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.call.CallQualityReading
import me.meeshy.sdk.model.call.CallQualityTick
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Le relais de la dernière lecture de qualité, de l'échantillonneur vers l'écran (feuille de
 * qualité, glyphe). Il ne dépend NI du moteur NI de la pile WebRTC : le construire avant un appel
 * ne coûte rien (miroir de iOS `CallQualityStatsFeed`). Hors appel ou après sa fin, [reset] efface
 * la lecture — aucune barre fantôme.
 */
@Singleton
public class CallQualityStatsFeed @Inject constructor() {
    private val latest = MutableStateFlow<CallQualityReading?>(null)
    private var previous: CallQualityTick? = null

    public val readings: StateFlow<CallQualityReading?> = latest.asStateFlow()

    @Synchronized
    public fun record(tick: CallQualityTick) {
        latest.value = CallQualityReading.derive(tick, previous)
        previous = tick
    }

    @Synchronized
    public fun reset() {
        previous = null
        latest.value = null
    }
}
