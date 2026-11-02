package me.meeshy.sdk.model.location

import me.meeshy.sdk.model.LocationPrecision
import me.meeshy.sdk.model.PlaceCoarseNames
import me.meeshy.sdk.model.SharedPlace
import kotlin.math.abs

/** Un résultat de recherche de lieu, déjà nommé. */
data class LocationSearchResult(
    val point: GeoPoint,
    val name: String?,
    val address: String?,
    val category: String? = null,
)

/** Où en est l'autorisation de localisation vue par le sélecteur. */
enum class LocationAccess { UNKNOWN, GRANTED, DENIED }

/** Paramètres de recherche — miroir de `LocationSearchPlan` iOS. */
object LocationSearchPlan {
    const val MAX_RESULTS: Int = 8
    const val SEARCH_DEBOUNCE_MS: Long = 300L
    const val GEOCODE_DEBOUNCE_MS: Long = 300L
    const val DEFAULT_ZOOM: Int = 16
    const val RECENTER_ZOOM: Int = 17
}

/**
 * Le sélecteur de lieu : un point central que la carte glisse dessous, son nom / son adresse
 * géocodés, la liste des résultats. Réduction d'état pure (miroir de `LocationPickerModel`) ;
 * l'écran ne fait que rendre cet état et lui adresser des événements.
 */
data class LocationPickerState(
    val selected: GeoPoint? = null,
    val name: String? = null,
    val category: String? = null,
    val address: String? = null,
    val coarse: PlaceCoarseNames = PlaceCoarseNames.EMPTY,
    val isGeocoding: Boolean = false,
    val results: List<LocationSearchResult> = emptyList(),
    val userLocation: GeoPoint? = null,
    val access: LocationAccess = LocationAccess.UNKNOWN,
) {
    val isLocationRefused: Boolean get() = access == LocationAccess.DENIED

    /**
     * Le centre de la carte a bougé. Idempotent à ~1 cm près (un callback caméra qui republie le
     * même centre ne relance rien) ; déplacer la carte après un résultat nommé abandonne le nom
     * du point qu'on a quitté.
     */
    fun moved(to: GeoPoint): LocationPickerState {
        val current = selected
        if (current != null && current.isApproximately(to)) return this
        return copy(
            selected = to,
            name = null,
            category = null,
            address = null,
            coarse = PlaceCoarseNames.EMPTY,
            isGeocoding = true,
        )
    }

    /** Le géocodage inverse de [at] est revenu. Une réponse pour un point quitté depuis est ignorée. */
    fun geocoded(at: GeoPoint, address: String?, coarse: PlaceCoarseNames): LocationPickerState {
        val current = selected ?: return this
        if (!current.isApproximately(at)) return this
        return copy(isGeocoding = false, address = address ?: this.address, coarse = coarse)
    }

    /** Le géocodage a échoué : le point reste, sans adresse. */
    fun geocodeFailed(at: GeoPoint): LocationPickerState {
        val current = selected ?: return this
        return if (current.isApproximately(at)) copy(isGeocoding = false) else this
    }

    /** Un résultat de recherche est choisi : son nom et sa catégorie sont déjà connus. */
    fun chosen(result: LocationSearchResult): LocationPickerState = copy(
        selected = result.point,
        name = result.name,
        category = result.category,
        address = result.address,
        coarse = PlaceCoarseNames.EMPTY,
        isGeocoding = true,
        results = emptyList(),
    )

    /** Premier relevé de l'appareil : il centre le sélecteur, sans écraser un point déjà choisi. */
    fun userFixed(fix: GeoPoint): LocationPickerState {
        val withUser = copy(userLocation = fix, access = LocationAccess.GRANTED)
        return if (selected == null) withUser.copy(selected = fix, isGeocoding = true) else withUser
    }

    fun withAccess(access: LocationAccess): LocationPickerState = copy(access = access)

    fun withResults(results: List<LocationSearchResult>): LocationPickerState =
        copy(results = results.take(LocationSearchPlan.MAX_RESULTS))

    /** Le lieu brut — la précision se choisit à l'envoi, sans re-géocoder. */
    val rawPlace: SharedPlace?
        get() = selected?.let { SharedPlace(it.latitude, it.longitude, name, address, category) }

    /** Ce qui PARTIRA, précision appliquée : la carte du bas montre exactement ce que le destinataire reçoit. */
    fun place(precision: LocationPrecision): SharedPlace? = rawPlace?.let { precision.coarsen(it, coarse) }
}

fun GeoPoint.isApproximately(other: GeoPoint, tolerance: Double = 1e-7): Boolean =
    abs(latitude - other.latitude) < tolerance && abs(longitude - other.longitude) < tolerance
