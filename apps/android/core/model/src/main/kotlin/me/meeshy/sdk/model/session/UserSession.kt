package me.meeshy.sdk.model.session

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.WireDate

/**
 * Une session ouverte du compte, telle que `GET /auth/sessions` la sert (`sessionSchema`,
 * `packages/shared/types/api-schemas/session.ts`). Miroir de `UserSession` (SessionService.swift).
 *
 * Tout est FACULTATIF sauf l'identifiant (#9223) : une passerelle antérieure au relevé (#9610) ou
 * à la géolocalisation locale (#9609) sert une session sans version, sans moyen de connexion ni
 * ville, et elle se décode quand même. Les noms de propriétés sont ceux du fil.
 */
@Serializable
public data class UserSession(
    val id: String,
    val deviceName: String? = null,
    val ipAddress: String? = null,
    val lastActivityAt: String? = null,
    val createdAt: String? = null,
    val isCurrentSession: Boolean = false,
    val deviceType: String? = null,
    val deviceVendor: String? = null,
    val deviceModel: String? = null,
    val osName: String? = null,
    val osVersion: String? = null,
    val browserName: String? = null,
    val browserVersion: String? = null,
    val isMobile: Boolean? = null,
    val appVersion: String? = null,
    val appBuild: String? = null,
    /** `ios` · `web` · `pwa` · `android-shell`. */
    val platform: String? = null,
    /** Posé par le SERVEUR (`SESSION_LOGIN_METHODS`). */
    val loginMethod: String? = null,
    /** ISO 3166-1 alpha-2. */
    val country: String? = null,
    /** APPROXIMATIVE : tirée de l'adresse IP par une base locale (#9609). */
    val city: String? = null,
    val location: String? = null,
    /** Fuseau IANA déclaré par le client. */
    val timezone: String? = null,
    val isTrusted: Boolean? = null,
) {
    public val createdAtMillis: Long? get() = WireDate.epochMillis(createdAt)
    public val lastActiveMillis: Long? get() = WireDate.epochMillis(lastActivityAt)
}

/** `data` de `GET /auth/sessions` : les sessions et l'attribution du lieu. */
@Serializable
public data class UserSessionsPayload(
    val sessions: List<UserSession> = emptyList(),
    val totalCount: Int = 0,
    val geolocation: GeolocationAttribution? = null,
) {
    /** L'attribution du serveur l'emporte dès qu'il la sert ; sinon celle de DB-IP. */
    public val attribution: GeolocationAttribution get() = geolocation ?: GeolocationAttribution.DB_IP
}
