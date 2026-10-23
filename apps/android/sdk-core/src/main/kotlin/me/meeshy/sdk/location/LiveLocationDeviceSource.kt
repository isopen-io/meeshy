package me.meeshy.sdk.location

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Looper
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import me.meeshy.sdk.model.LiveLocationFix
import javax.inject.Inject

/** Positions de l'appareil via `LocationManager` (aucune dépendance Play Services). */
@SuppressLint("MissingPermission")
class LiveLocationDeviceSource @Inject constructor(
    @ApplicationContext private val context: Context,
) : LiveLocationFixSource, LocationPermissionGate {

    override fun isGranted(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    override suspend fun currentFix(): LiveLocationFix? =
        if (isGranted()) context.awaitFreshLocationFix()?.let {
            LiveLocationFix(it.latitude, it.longitude, it.altitude, it.accuracy)
        } else null

    override fun updates(intervalMillis: Long): Flow<LiveLocationFix> = callbackFlow {
        val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        val provider = when {
            manager == null || !isGranted() -> null
            manager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
            manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
            else -> null
        }
        if (manager == null || provider == null) {
            close()
            return@callbackFlow
        }
        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                trySend(location.toFix())
            }
            @Deprecated("Deprecated in Java")
            override fun onStatusChanged(provider: String?, status: Int, extras: android.os.Bundle?) {}
            override fun onProviderEnabled(provider: String) {}
            override fun onProviderDisabled(provider: String) {}
        }
        manager.requestLocationUpdates(provider, intervalMillis, 0f, listener, Looper.getMainLooper())
        awaitClose { manager.removeUpdates(listener) }
    }

    private fun Location.toFix() = LiveLocationFix(
        latitude = latitude,
        longitude = longitude,
        altitude = if (hasAltitude()) altitude else null,
        accuracy = if (hasAccuracy()) accuracy.toDouble() else null,
        speed = if (hasSpeed()) speed.toDouble() else null,
        heading = if (hasBearing()) bearing.toDouble() else null,
    )
}
