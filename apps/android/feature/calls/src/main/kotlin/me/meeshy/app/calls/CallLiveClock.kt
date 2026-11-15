package me.meeshy.app.calls

import androidx.compose.runtime.State
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.mutableLongStateOf
import me.meeshy.sdk.model.call.CallDuration

/**
 * Les secondes du chrono VIVANT, fournies comme un [State] et non comme une valeur : l'hôte de
 * l'écran ne le lit jamais, seules les feuilles qui affichent le temps le font — ce qui borne
 * la recomposition de 1 Hz à ces feuilles ([CallUiState.withFrozenClock]).
 */
internal val LocalCallLiveSeconds = compositionLocalOf<State<Long>> { mutableLongStateOf(0L) }

/** Le temps à afficher : le vivant tant que le chrono tourne, sinon la durée figée de l'état. */
internal fun liveOrFixedSeconds(live: Boolean, live1Hz: State<Long>, fixed: Long): Long =
    if (live) live1Hz.value else fixed

internal fun clockLabel(seconds: Long): String = CallDuration.clock(seconds)
