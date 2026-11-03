package me.meeshy.app.reels

import androidx.compose.runtime.Stable
import me.meeshy.sdk.model.ReelPlaybackElection

/**
 * La clé d'une page du fil de réels (iOS `ReelInstantSwitch`) : ce qui, d'une page, décide si elle se
 * recompose. Quatre primitives — le réel, élu, posé, chrome masqué — comparées par valeur : une élection ne
 * change la clé que des deux pages touchées (la sortante et l'entrante), jamais des autres.
 */
@Stable
internal data class ReelPageKey(
    val reelId: String,
    val isElected: Boolean,
    val isSettled: Boolean,
    val chromeHidden: Boolean,
) {
    companion object {
        fun of(reelId: String, election: ReelPlaybackElection, chromeHidden: Boolean): ReelPageKey =
            ReelPageKey(
                reelId = reelId,
                isElected = election.activeId == reelId,
                isSettled = election.restingId == reelId,
                chromeHidden = chromeHidden,
            )
    }
}

/**
 * Les trois signaux du pager réduits à l'élection (iOS `ReelPlaybackElection`) : la page qui passe la moitié
 * de l'écran est élue PENDANT le geste, la page posée n'est confirmée qu'à l'arrêt du défilement.
 */
internal object ReelElectionReducer {
    fun reduce(
        election: ReelPlaybackElection,
        majorityId: String?,
        isScrolling: Boolean,
        settledId: String?,
    ): ReelPlaybackElection {
        val elected = majorityId?.let(election::majority) ?: election
        val scrolled = elected.scrolling(isScrolling)
        return if (isScrolling) scrolled else scrolled.settled(settledId)
    }
}
