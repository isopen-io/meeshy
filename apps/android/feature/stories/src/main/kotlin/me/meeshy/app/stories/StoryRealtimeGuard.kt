package me.meeshy.app.stories

import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharedFlow
import me.meeshy.sdk.socket.collectArrived

private const val TAG = "StoryRealtime"

/**
 * Collecte un flux temps réel (`story:*`, cache des stories) sans qu'un élément qui fait
 * échouer sa projection ne ferme l'app : l'exception sortait de `viewModelScope` vers le
 * gestionnaire non intercepté du thread principal pendant qu'une story était à l'écran
 * (CLAUDE.md § Async EventEmitter Hazard). L'élément fautif est écarté, l'écouteur reste
 * vivant pour le suivant ; l'annulation, elle, se propage.
 */
internal suspend fun <T> Flow<T>.collectEachSafely(action: suspend (T) -> Unit) {
    collect { value ->
        try {
            action(value)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "élément temps réel écarté", e)
        }
    }
}

/**
 * [collectEachSafely] d'un flux de socket SOUS le compte auquel chaque trame est arrivée (#13576) : le cache Room que
 * [action] écrit ne reçoit pas la story de A parce que B s'est connecté pendant que la trame attendait.
 */
internal suspend fun <T> SharedFlow<T>.collectEachArrivedSafely(action: suspend (T) -> Unit) {
    collectArrived { value ->
        try {
            action(value)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "élément temps réel écarté", e)
        }
    }
}
