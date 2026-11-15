package me.meeshy.sdk.chat

import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import me.meeshy.sdk.model.feedback.DailyGestureLimit
import me.meeshy.sdk.model.net.NewcomerSlowMode
import javax.inject.Inject
import javax.inject.Singleton

/** Un refus de geste que l'écran doit DIRE, quel que soit l'écran où l'utilisateur se trouve. */
public sealed interface GestureRefusalEvent {
    /** La limite du jour est atteinte : retour à l'heure de [limit] (ou sans heure quand la passerelle ne la dit pas). */
    public data class DailyLimit(val limit: DailyGestureLimit) : GestureRefusalEvent

    /** Le mode lent des nouveaux comptes : un message toutes les 30 s, renvoi possible dans [mode]. */
    public data class SlowMode(val mode: NewcomerSlowMode) : GestureRefusalEvent
}

/**
 * Le canal UNIQUE des refus de gestes (limite du jour, mode lent) : les couches basses (file d'envoi, transport) y
 * [report]ent, un hôte global de :app les lit et lève la bannière. Un refus sans abonné est perdu : il ne se rejoue
 * pas à l'ouverture suivante. Une erreur RÉSEAU n'y passe jamais — hors ligne, aucune bannière de refus.
 */
@Singleton
public class GestureRefusalCenter @Inject constructor() {

    private val shared = MutableSharedFlow<GestureRefusalEvent>(extraBufferCapacity = BUFFER, onBufferOverflow = BufferOverflow.DROP_OLDEST)

    public val events: SharedFlow<GestureRefusalEvent> = shared.asSharedFlow()

    public fun report(limit: DailyGestureLimit) {
        shared.tryEmit(GestureRefusalEvent.DailyLimit(limit))
    }

    public fun report(mode: NewcomerSlowMode) {
        shared.tryEmit(GestureRefusalEvent.SlowMode(mode))
    }

    private companion object {
        const val BUFFER = 8
    }
}
