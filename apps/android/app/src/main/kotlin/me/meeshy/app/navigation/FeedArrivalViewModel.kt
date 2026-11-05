package me.meeshy.app.navigation

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

/** Ramasse, à l'arrivée sur le Flux, le composeur qu'un autre écran a demandé (iOS `consumePendingFeedComposer`). */
@HiltViewModel
class FeedArrivalViewModel @Inject constructor(
    private val requests: NavigationRequests,
) : ViewModel() {
    fun consumeComposerRequest(): Boolean = requests.consumeFeedComposer()
}
