package me.meeshy.sdk.location

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Looper
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.model.MeeshyLocationCoordinate
import kotlin.coroutines.resume

/**
 * A fresh GPS/network fix via [android.location.LocationManager], no Play Services
 * dependency added — the single site [FeedComposerSheet] (location attachment) and
 * `NearbyScreen` (geolocated discovery) now share, replacing a private extension the
 * composer used to carry on its own.
 *
 * The caller must already hold `ACCESS_FINE_LOCATION` or `ACCESS_COARSE_LOCATION` —
 * checked by the caller before this is ever invoked, never by this function itself.
 * Android-runtime glue, exempt from JVM coverage per `TDD-COVERAGE.md`: "which
 * provider is enabled right now" is inherently a live system-state read with no
 * further pure decision to extract.
 */
@SuppressLint("MissingPermission")
suspend fun Context.awaitFreshLocationFix(timeoutMs: Long = 12_000): MeeshyLocationCoordinate? {
    val manager = getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
    val provider = when {
        manager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
        manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
        else -> return null
    }
    val fix = withTimeoutOrNull(timeoutMs) {
        suspendCancellableCoroutine<Location?> { continuation ->
            val listener = object : LocationListener {
                override fun onLocationChanged(location: Location) {
                    manager.removeUpdates(this)
                    if (continuation.isActive) continuation.resume(location)
                }
                @Deprecated("Deprecated in Java")
                override fun onStatusChanged(provider: String?, status: Int, extras: android.os.Bundle?) {}
                override fun onProviderEnabled(provider: String) {}
                override fun onProviderDisabled(provider: String) {}
            }
            continuation.invokeOnCancellation { manager.removeUpdates(listener) }
            manager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper())
        }
    }
    return fix?.let {
        MeeshyLocationCoordinate(latitude = it.latitude, longitude = it.longitude, accuracy = it.accuracy.toDouble())
    }
}
