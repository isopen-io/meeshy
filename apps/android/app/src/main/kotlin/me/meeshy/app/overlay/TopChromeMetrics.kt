package me.meeshy.app.overlay

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.chrome.TopChromeBarMotion

/** Hauteur agregee (dp) du chrome du haut, exposee aux ecrans : le max des barres visibles. */
@Singleton
class TopChromeMetrics @Inject constructor() {
    private val _heightDp = MutableStateFlow(0f)
    val heightDp: StateFlow<Float> = _heightDp.asStateFlow()

    fun publish(barHeightsDp: List<Float>) {
        _heightDp.value = TopChromeBarMotion.aggregateHeightDp(barHeightsDp)
    }
}
