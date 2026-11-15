package me.meeshy.app.feed

import kotlin.math.round
import kotlin.math.roundToInt

/** A distance from the viewer, pre-bucketed into the unit the UI renders. */
sealed interface NearbyDistanceLabel {
    data class Meters(val meters: Int) : NearbyDistanceLabel
    data class Kilometers(val km: Double) : NearbyDistanceLabel
}

/**
 * Pure distance formatting for the Nearby screen — the localized unit strings are
 * rendered by the Composable caller (never a [androidx.compose.ui.res.stringResource]
 * inside a pure function); this object only decides which unit and value to show.
 */
object NearbyDistanceFormat {
    fun label(meters: Double): NearbyDistanceLabel =
        if (meters < 1000.0) {
            NearbyDistanceLabel.Meters(meters.roundToInt())
        } else {
            NearbyDistanceLabel.Kilometers(round(meters / 100.0) / 10.0)
        }
}
