package me.meeshy.sdk.notification

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * « Un message vient d'être accepté par le serveur » : le déclencheur qui honore le report de
 * la permission de notification. Rejoué une fois (`replay = 1`) pour qu'un envoi accepté en
 * arrière-plan soit rattrapé à la prochaine ouverture de l'app.
 */
@Singleton
public class FirstMessageAcceptedSignal @Inject constructor() {
    private val _accepted = MutableSharedFlow<Unit>(
        replay = 1,
        extraBufferCapacity = 1,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    public val accepted: SharedFlow<Unit> = _accepted.asSharedFlow()

    public fun notifyAccepted() {
        _accepted.tryEmit(Unit)
    }
}
