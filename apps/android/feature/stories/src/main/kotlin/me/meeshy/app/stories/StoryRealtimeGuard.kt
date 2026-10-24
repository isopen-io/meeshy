package me.meeshy.app.stories

import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow

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
