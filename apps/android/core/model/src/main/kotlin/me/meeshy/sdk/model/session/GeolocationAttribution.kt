package me.meeshy.sdk.model.session

import kotlinx.serialization.Serializable

/**
 * L'attribution que la licence CC-BY 4.0 de DB-IP Lite exige partout où un lieu déduit de
 * l'adresse est montré (`GEOLOCATION_ATTRIBUTION`, `packages/shared/utils/client-session.ts`).
 * Miroir de `GeolocationAttribution` (SessionService.swift).
 */
@Serializable
public data class GeolocationAttribution(
    val provider: String? = null,
    val text: String,
    val url: String? = null,
    val license: String? = null,
    val approximate: Boolean? = null,
) {
    public companion object {
        /** Le contrat serveur, pour une liste tirée du cache ou d'une passerelle antérieure à #9609. */
        public val DB_IP: GeolocationAttribution = GeolocationAttribution(
            provider = "DB-IP",
            text = "IP Geolocation by DB-IP",
            url = "https://db-ip.com",
            license = "CC-BY-4.0",
            approximate = true,
        )
    }
}
