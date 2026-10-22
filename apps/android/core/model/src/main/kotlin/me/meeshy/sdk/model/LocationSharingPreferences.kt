package me.meeshy.sdk.model

import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.pow

/**
 * À quel grain la position de l'utilisateur est transmise — port de `LocationPrecision`
 * (LocationSharingPreferences.swift).
 *
 * L'enum ne porte AUCUN libellé : c'est de la donnée. Les libellés (« Quartier », « ~1 km »)
 * sont résolus côté application depuis les chaînes localisées.
 */
enum class LocationPrecision(val storageValue: String) {
    /** Aucun arrondi — au mieux de ce que rend le GPS. */
    EXACT("exact"),

    /** ~100 m. */
    AROUND("around"),

    /** ~1 km. */
    NEIGHBORHOOD("neighborhood"),

    /** ~10 km. */
    CITY("city"),
    ;

    /**
     * Décimales conservées sur latitude et longitude, `null` = pas d'arrondi. 1 décimale de
     * latitude ≈ 11 km, 2 ≈ 1,1 km, 3 ≈ 111 m — d'où la correspondance avec les rayons annoncés.
     */
    val decimalPlaces: Int?
        get() = when (this) {
            EXACT -> null
            AROUND -> 3
            NEIGHBORHOOD -> 2
            CITY -> 1
        }

    /** Rayon d'imprécision annoncé à l'utilisateur, en mètres (`null` = exact). */
    val approximateRadiusMeters: Double?
        get() = when (this) {
            EXACT -> null
            AROUND -> 100.0
            NEIGHBORHOOD -> 1_000.0
            CITY -> 10_000.0
        }

    /** Arrondit une latitude ou une longitude au grain choisi (identité pour [EXACT]). */
    fun roundCoordinate(value: Double): Double {
        val places = decimalPlaces ?: return value
        return roundAwayFromZero(value, places)
    }

    /**
     * Applique la dégradation au lieu choisi. Arrondir les coordonnées ne suffit pas : envoyer
     * « 12 rue de la Paix, Paris » avec une position à ±10 km annulerait l'arrondi. Aux deux
     * paliers grossiers, le nom et l'adresse sont REMPLACÉS par le composant géographique de
     * granularité correspondante, et la catégorie POI est vidée. Sans composant disponible, le
     * résultat ne porte que les coordonnées arrondies.
     */
    fun coarsen(place: SharedPlace, names: PlaceCoarseNames = PlaceCoarseNames.EMPTY): SharedPlace {
        if (decimalPlaces == null) return place
        val latitude = roundCoordinate(place.latitude)
        val longitude = roundCoordinate(place.longitude)
        return when (this) {
            EXACT -> place
            AROUND -> place.copy(latitude = latitude, longitude = longitude)
            NEIGHBORHOOD -> {
                val name = names.subLocality ?: names.locality
                SharedPlace(
                    latitude = latitude,
                    longitude = longitude,
                    name = name,
                    address = join(listOf(names.locality, names.country), name),
                    category = null,
                )
            }
            CITY -> {
                val name = names.locality ?: names.administrativeArea
                SharedPlace(
                    latitude = latitude,
                    longitude = longitude,
                    name = name,
                    address = join(listOf(names.administrativeArea, names.country), name),
                    category = null,
                )
            }
        }
    }

    companion object {
        /** Décodage tolérant : valeur inconnue ou absente = [EXACT]. */
        fun fromStorage(raw: String?): LocationPrecision =
            entries.firstOrNull { it.storageValue == raw } ?: EXACT

        /** Arrondi au plus proche en s'éloignant de zéro, donc symétrique autour de 0. */
        private fun roundAwayFromZero(value: Double, places: Int): Double {
            val factor = 10.0.pow(places)
            val scaled = abs(value) * factor
            val rounded = floor(scaled + 0.5)
            return (if (value < 0) -rounded else rounded) / factor
        }

        private fun join(parts: List<String?>, excluding: String?): String? =
            parts.filterNotNull().filter { it != excluding }.takeIf { it.isNotEmpty() }?.joinToString(", ")
    }
}

/**
 * Composants géographiques d'un lieu conservés SÉPARÉMENT, pour que la dégradation choisisse le
 * bon grain (quartier, ville) au lieu d'une seule chaîne d'adresse.
 */
data class PlaceCoarseNames(
    val subLocality: String? = null,
    val locality: String? = null,
    val administrativeArea: String? = null,
    val country: String? = null,
) {
    companion object {
        val EMPTY = PlaceCoarseNames()
    }
}

/** Rendu de la carte partagée — miroir de `SharedMapStyle`. */
enum class SharedMapStyle(val storageValue: String) {
    STANDARD("standard"),
    HYBRID("hybrid"),
    IMAGERY("imagery"),
    ;

    companion object {
        fun fromStorage(raw: String?): SharedMapStyle =
            entries.firstOrNull { it.storageValue == raw } ?: STANDARD
    }
}

/**
 * Préférences APPLICATIVES de partage de position (pas par conversation). Défaut = comportement
 * iOS : `exact` / `standard` — changer silencieusement la précision d'un utilisateur existant
 * serait une régression fonctionnelle déguisée en réglage.
 */
data class LocationSharingPreferences(
    val precision: LocationPrecision = LocationPrecision.EXACT,
    val mapStyle: SharedMapStyle = SharedMapStyle.STANDARD,
)
