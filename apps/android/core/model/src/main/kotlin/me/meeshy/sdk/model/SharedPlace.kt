package me.meeshy.sdk.model

import kotlinx.serialization.Serializable
import java.util.Locale

/**
 * A shared geographic place — one type for every surface that can carry a location
 * attachment (message, comment, post, story), mirroring the gateway's `SharedPlace`
 * (`services/gateway/src/services/location/sharedPlace.ts`) and iOS's `SharedPlace`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Models/SharedPlace.swift`) field-for-field:
 * `{latitude, longitude, name, address, category}`. [name]/[address]/[category] are
 * `null` for a point captured without reverse geocoding — the exact state iOS's own
 * picker starts in before `CLGeocoder` resolves an address.
 */
@Serializable
data class SharedPlace(
    val latitude: Double,
    val longitude: Double,
    val name: String? = null,
    val address: String? = null,
    val category: String? = null,
)

/**
 * The coordinate pair formatted for display when no [SharedPlace.name]/
 * [SharedPlace.address] is available — mirror of iOS `LocationPickerView.
 * formattedCoordinates`. Always `Locale.ROOT` (never the JVM default): a
 * comma-decimal locale (`fr_FR`, `de_DE`...) would otherwise silently produce an
 * invalid wire value (`"48,86"` instead of `"48.86"`).
 */
fun SharedPlace.formattedCoordinates(decimalPlaces: Int = 5): String =
    String.format(Locale.ROOT, "%.${decimalPlaces}f, %.${decimalPlaces}f", latitude, longitude)
