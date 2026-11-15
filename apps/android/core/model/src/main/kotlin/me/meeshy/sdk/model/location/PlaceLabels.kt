package me.meeshy.sdk.model.location

import me.meeshy.sdk.model.SharedPlace
import java.util.Locale

/** Le soulèvement du pin central pendant le déplacement de la carte (miroir de `MapPinLift`). */
data class MapPinLiftStyle(val scale: Float, val yOffsetDp: Float, val shadowScale: Float, val shadowAlpha: Float)

object MapPinLift {
    fun style(lifted: Boolean): MapPinLiftStyle =
        if (lifted) MapPinLiftStyle(scale = 1.25f, yOffsetDp = -14f, shadowScale = 0.55f, shadowAlpha = 0.18f)
        else MapPinLiftStyle(scale = 1f, yOffsetDp = 0f, shadowScale = 1f, shadowAlpha = 0.38f)
}

/** Textes et liens d'un lieu partagé — sans libellé localisé, qui vient des ressources. */
object PlaceLabels {
    /** Deux lignes de la bulle : nom puis adresse, l'adresse seule si pas de nom, jamais de doublon. */
    fun infoLines(name: String?, address: String?): Pair<String?, String?> {
        val cleanName = name?.trim()?.ifEmpty { null }
        val cleanAddress = address?.trim()?.ifEmpty { null }
        if (cleanName == null) return cleanAddress to null
        return cleanName to cleanAddress.takeUnless { it == cleanName }
    }

    /** Nom ET adresse dédupliqués, comme la carte du bas du sélecteur iOS. */
    fun title(name: String?, address: String?): String? {
        val n = name?.trim()?.ifEmpty { null }
        val a = address?.trim()?.ifEmpty { null }
        if (n == null) return a
        if (a == null) return n
        return if (a.contains(n, ignoreCase = true)) a else "$n · $a"
    }

    /** Le nom avant l'adresse, à défaut les coordonnées — ce que « Copier l'adresse » met au presse-papiers. */
    fun copyableAddress(place: SharedPlace): String =
        place.name ?: place.address ?: "${place.latitude}, ${place.longitude}"

    fun coordinates(place: SharedPlace, decimals: Int?): String {
        val places = decimals ?: 5
        return String.format(Locale.ROOT, "%.${places}f, %.${places}f", place.latitude, place.longitude)
    }

    /** `geo:` standard : toute application de cartes l'ouvre. L'étiquette est le nom, sinon l'adresse. */
    fun geoUri(place: SharedPlace): String {
        val base = "geo:${place.latitude},${place.longitude}?q=${place.latitude},${place.longitude}"
        val label = (place.name ?: place.address)?.trim()?.ifEmpty { null } ?: return base
        return "$base(${label.replace("(", "").replace(")", "")})"
    }

    /** Repli sans application de cartes installée : la page web de Google Maps, ouverte par le navigateur. */
    fun webMapsUri(place: SharedPlace): String =
        "https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}"

    fun webDirectionsUri(place: SharedPlace): String =
        "https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}"

    /** Itinéraire pas à pas (Google Maps et compatibles) vers le lieu. */
    fun navigationUri(place: SharedPlace): String = "google.navigation:q=${place.latitude},${place.longitude}"
}

/** Éligibilité d'envoi d'un message : texte, pièce jointe ou lieu partagé suffit (miroir de `SendEligibility`). */
object ComposerSendEligibility {
    fun canSend(text: String, hasAttachments: Boolean, hasPlace: Boolean): Boolean =
        text.isNotBlank() || hasAttachments || hasPlace
}
