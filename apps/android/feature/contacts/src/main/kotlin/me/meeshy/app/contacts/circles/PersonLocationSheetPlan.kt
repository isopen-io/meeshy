package me.meeshy.app.contacts.circles

import me.meeshy.sdk.model.relation.LocationMapRules
import me.meeshy.sdk.model.relation.SharedLocationFix
import me.meeshy.sdk.model.relation.SharedLocationFreshness
import me.meeshy.sdk.model.relation.SharedLocationPin
import me.meeshy.sdk.model.relation.SharedLocationWindow

/**
 * LA FICHE DEVENUE FEUILLE BASSE (#18890, planche Carte-Personne), la part PURE : tout se lit sur la position SERVIE, rien
 * n'est plus fin. L'heure qui passe se relit sans réseau en rappelant [of] avec une horloge neuve. Un champ que le serveur
 * ne sert pas encore (la mise à jour, ma position) s'absente proprement : la feuille s'en passe, le reste part.
 */
internal data class PersonLocationSheetPlan(
    val window: SharedLocationWindow,
    val freshness: SharedLocationFreshness?,
    val distanceMeters: Double?,
    val walkMinutes: Int?,
    val directionsUri: String,
) {
    /** La jauge passe en alerte sous 15 % de la durée ouverte (iso iOS). */
    val isUrgent: Boolean get() = !window.isOver && window.fraction < URGENT_FRACTION

    companion object {
        private const val URGENT_FRACTION = 0.15

        fun of(pin: SharedLocationPin, updatedAtMillis: Long?, own: SharedLocationFix?, nowMillis: Long): PersonLocationSheetPlan {
            val point = pin.point
            val meters = own?.let {
                LocationMapRules.distanceMeters(it.latitude, it.longitude, point.latitude, point.longitude)
            }
            return PersonLocationSheetPlan(
                window = SharedLocationWindow.of(pin.deadlineMillis, nowMillis),
                freshness = updatedAtMillis?.let { SharedLocationFreshness.of(it, nowMillis) },
                distanceMeters = meters,
                walkMinutes = meters?.let(LocationMapRules::walkingMinutes),
                directionsUri = "geo:${point.latitude},${point.longitude}?q=${point.latitude},${point.longitude}",
            )
        }
    }
}
