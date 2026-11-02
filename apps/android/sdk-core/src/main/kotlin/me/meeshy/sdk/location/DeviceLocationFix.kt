package me.meeshy.sdk.location

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Looper
import android.os.SystemClock
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.model.MeeshyLocationCoordinate
import me.meeshy.sdk.model.location.DeviceFixPolicy
import me.meeshy.sdk.model.location.KnownFix

/**
 * Un relevé UNIQUE de l'appareil via [android.location.LocationManager], sans Play Services — le
 * site que [FeedComposerSheet] (pièce jointe de lieu), `NearbyScreen` (découverte géolocalisée),
 * le sélecteur de lieu et le partage en direct partagent.
 *
 * En intérieur le GPS n'a pas de fix : tous les fournisseurs actifs (GPS ET réseau) sont donc
 * interrogés ensemble. Une position déjà connue et récente ([DeviceFixPolicy.immediate]) est
 * rendue tout de suite ; sinon le PREMIER relevé qui arrive gagne, borné par [timeoutMs] ; à
 * l'échéance, la dernière position encore plausible sert de repli. `removeUpdates` passe dans tous
 * les cas (relevé, délai, annulation).
 *
 * L'appelant détient déjà `ACCESS_FINE_LOCATION` ou `ACCESS_COARSE_LOCATION` — vérifié par lui,
 * jamais par cette fonction. Colle d'exécution Android, hors couverture JVM (`TDD-COVERAGE.md`) :
 * la décision pure vit dans [DeviceFixPolicy].
 */
@SuppressLint("MissingPermission")
suspend fun Context.awaitFreshLocationFix(timeoutMs: Long = 12_000): MeeshyLocationCoordinate? {
    val manager = getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
    val providers = manager.enabledFixProviders()
    if (providers.isEmpty()) return null
    val known = providers.mapNotNull { provider ->
        runCatching { manager.getLastKnownLocation(provider) }.getOrNull()?.let { KnownFix(it.toCoordinate(), it.ageMillis()) }
    }
    DeviceFixPolicy.immediate(known)?.let { return it }

    val arrived = CompletableDeferred<Location>()
    val listener = object : LocationListener {
        override fun onLocationChanged(location: Location) {
            arrived.complete(location)
        }
        @Deprecated("Deprecated in Java")
        override fun onStatusChanged(provider: String?, status: Int, extras: android.os.Bundle?) {}
        override fun onProviderEnabled(provider: String) {}
        override fun onProviderDisabled(provider: String) {}
    }
    val fresh = try {
        val listening = providers.count { provider ->
            runCatching { manager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper()) }.isSuccess
        }
        if (listening == 0) null else withTimeoutOrNull(timeoutMs) { arrived.await() }
    } finally {
        manager.removeUpdates(listener)
    }
    return fresh?.toCoordinate() ?: DeviceFixPolicy.fallback(known)
}

/** Les fournisseurs qui peuvent répondre maintenant : GPS et réseau, dans cet ordre. */
internal fun LocationManager.enabledFixProviders(): List<String> =
    listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).filter { isProviderEnabled(it) }

private fun Location.toCoordinate() =
    MeeshyLocationCoordinate(latitude = latitude, longitude = longitude, accuracy = accuracy.toDouble())

private fun Location.ageMillis(): Long = (SystemClock.elapsedRealtimeNanos() - elapsedRealtimeNanos) / NANOS_PER_MILLI

private const val NANOS_PER_MILLI = 1_000_000L
