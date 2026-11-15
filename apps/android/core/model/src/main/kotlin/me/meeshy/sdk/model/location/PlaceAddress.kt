package me.meeshy.sdk.model.location

import me.meeshy.sdk.model.PlaceCoarseNames

/** Les composants d'une adresse tels que le géocodeur de l'appareil les rend. */
data class AddressParts(
    val featureName: String? = null,
    val thoroughfare: String? = null,
    val subLocality: String? = null,
    val locality: String? = null,
    val administrativeArea: String? = null,
    val country: String? = null,
    val addressLines: List<String> = emptyList(),
)

/** Une adresse géocodée : la chaîne affichée ET les composants gardés séparés pour la dégradation de précision. */
data class GeocodedAddress(val text: String?, val coarse: PlaceCoarseNames)

object PlaceAddress {
    /**
     * Même composition qu'iOS : nom, voie, localité, pays, sans doublon, joints par « , ». Le
     * nom d'un POI vient de la recherche ; ici `featureName` d'un numéro de rue (« 12 ») est
     * écarté, il n'annonce rien.
     */
    fun compose(parts: AddressParts): GeocodedAddress {
        val feature = parts.featureName?.trim()?.takeUnless { it.isEmpty() || it.all(Char::isDigit) }
        val joined = listOfNotNull(feature, parts.thoroughfare, parts.locality, parts.country)
            .map(String::trim)
            .filter(String::isNotEmpty)
            .fold(emptyList<String>()) { acc, part -> if (part in acc) acc else acc + part }
            .joinToString(", ")
            .ifEmpty { null }
        return GeocodedAddress(
            text = joined,
            coarse = PlaceCoarseNames(
                subLocality = parts.subLocality?.trim()?.ifEmpty { null },
                locality = parts.locality?.trim()?.ifEmpty { null },
                administrativeArea = parts.administrativeArea?.trim()?.ifEmpty { null },
                country = parts.country?.trim()?.ifEmpty { null },
            ),
        )
    }

    /**
     * Un résultat de recherche : le nom n'est gardé que s'il en est un (pas un numéro, pas la
     * simple répétition de la localité) ; l'adresse est la ligne complète du géocodeur.
     */
    fun searchResult(point: GeoPoint, parts: AddressParts): LocationSearchResult {
        val feature = parts.featureName?.trim()
            ?.takeUnless { it.isEmpty() || it.all(Char::isDigit) || it == parts.locality }
        val address = parts.addressLines.map(String::trim).filter(String::isNotEmpty).joinToString(", ").ifEmpty { null }
        return LocationSearchResult(point = point, name = feature, address = address)
    }
}
