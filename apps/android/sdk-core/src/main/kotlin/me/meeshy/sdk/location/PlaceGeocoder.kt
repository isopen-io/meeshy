package me.meeshy.sdk.location

import android.content.Context
import android.location.Address
import android.location.Geocoder
import android.os.Build
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.model.location.AddressParts
import me.meeshy.sdk.model.location.GeoPoint
import me.meeshy.sdk.model.location.GeocodedAddress
import me.meeshy.sdk.model.location.LocationSearchResult
import me.meeshy.sdk.model.location.PlaceAddress
import me.meeshy.sdk.model.composer.NearbyAddress
import javax.inject.Inject
import kotlin.coroutines.resume

/** Géocodage direct et inverse d'un lieu — l'adresse d'un point, les lieux qui répondent à une requête. */
interface PlaceGeocoder {
    suspend fun reverse(point: GeoPoint): GeocodedAddress?

    suspend fun search(query: String, near: GeoPoint?, limit: Int): List<LocationSearchResult>

    /** Les adresses que l'appareil connaît autour de [point], la plus proche d'abord (#13846) ; aucune par défaut. */
    suspend fun around(point: GeoPoint, limit: Int): List<NearbyAddress> = emptyList()
}

/**
 * Le géocodeur du système (`android.location.Geocoder`) : aucune clé, aucune dépendance de plus.
 * Sans service de géocodage sur l'appareil, ou hors connexion, il ne rend rien — le sélecteur
 * reste utilisable en pointant la carte.
 */
class AndroidPlaceGeocoder @Inject constructor(
    @ApplicationContext private val context: Context,
    @IoDispatcher private val io: CoroutineDispatcher,
) : PlaceGeocoder {

    override suspend fun reverse(point: GeoPoint): GeocodedAddress? =
        fromLocation(point, 1).firstOrNull()?.let { PlaceAddress.compose(it.toParts()) }

    override suspend fun search(query: String, near: GeoPoint?, limit: Int): List<LocationSearchResult> =
        fromName(query, near, limit).mapNotNull { address ->
            if (!address.hasLatitude() || !address.hasLongitude()) return@mapNotNull null
            PlaceAddress.searchResult(GeoPoint(address.latitude, address.longitude), address.toParts())
        }

    override suspend fun around(point: GeoPoint, limit: Int): List<NearbyAddress> =
        fromLocation(point, limit).mapNotNull { address ->
            if (!address.hasLatitude() || !address.hasLongitude()) return@mapNotNull null
            NearbyAddress(GeoPoint(address.latitude, address.longitude), address.toParts())
        }

    private fun geocoder(): Geocoder? = if (Geocoder.isPresent()) Geocoder(context) else null

    @Suppress("DEPRECATION")
    private suspend fun fromLocation(point: GeoPoint, max: Int): List<Address> {
        val geocoder = geocoder() ?: return emptyList()
        return if (Build.VERSION.SDK_INT >= 33) {
            suspendCancellableCoroutine { cont ->
                geocoder.getFromLocation(point.latitude, point.longitude, max, object : Geocoder.GeocodeListener {
                    override fun onGeocode(addresses: MutableList<Address>) { if (cont.isActive) cont.resume(addresses) }
                    override fun onError(errorMessage: String?) { if (cont.isActive) cont.resume(emptyList()) }
                })
            }
        } else {
            withContext(io) { runCatching { geocoder.getFromLocation(point.latitude, point.longitude, max) }.getOrNull().orEmpty() }
        }
    }

    @Suppress("DEPRECATION")
    private suspend fun fromName(query: String, near: GeoPoint?, max: Int): List<Address> {
        val geocoder = geocoder() ?: return emptyList()
        val box = near?.let { SearchBox.around(it) }
        return if (Build.VERSION.SDK_INT >= 33) {
            suspendCancellableCoroutine { cont ->
                val listener = object : Geocoder.GeocodeListener {
                    override fun onGeocode(addresses: MutableList<Address>) { if (cont.isActive) cont.resume(addresses) }
                    override fun onError(errorMessage: String?) { if (cont.isActive) cont.resume(emptyList()) }
                }
                if (box != null) geocoder.getFromLocationName(query, max, box.south, box.west, box.north, box.east, listener)
                else geocoder.getFromLocationName(query, max, listener)
            }
        } else {
            withContext(io) {
                runCatching {
                    if (box != null) geocoder.getFromLocationName(query, max, box.south, box.west, box.north, box.east)
                    else geocoder.getFromLocationName(query, max)
                }.getOrNull().orEmpty()
            }
        }
    }

    private fun Address.toParts() = AddressParts(
        featureName = featureName,
        thoroughfare = thoroughfare,
        subLocality = subLocality,
        locality = locality,
        administrativeArea = adminArea,
        country = countryName,
        addressLines = (0..maxAddressLineIndex).mapNotNull { getAddressLine(it) },
    )
}

/** La fenêtre de recherche : ~20 km autour de l'auteur (iOS `searchRegionMeters`), sans s'y enfermer. */
internal data class SearchBox(val south: Double, val west: Double, val north: Double, val east: Double) {
    companion object {
        private const val HALF_SPAN_DEGREES = 0.18

        fun around(point: GeoPoint) = SearchBox(
            south = (point.latitude - HALF_SPAN_DEGREES).coerceAtLeast(-90.0),
            west = (point.longitude - HALF_SPAN_DEGREES).coerceAtLeast(-180.0),
            north = (point.latitude + HALF_SPAN_DEGREES).coerceAtMost(90.0),
            east = (point.longitude + HALF_SPAN_DEGREES).coerceAtMost(180.0),
        )
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class PlaceGeocoderModule {
    @Binds abstract fun geocoder(impl: AndroidPlaceGeocoder): PlaceGeocoder
}
