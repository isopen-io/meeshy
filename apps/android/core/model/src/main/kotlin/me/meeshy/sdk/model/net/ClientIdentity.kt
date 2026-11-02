package me.meeshy.sdk.model.net

/**
 * Ce que ce client DÉCLARE de lui-même à chaque requête — le contrat de
 * `packages/shared/utils/client-session.ts` (miroir de `ClientInfoProvider`, iOS).
 *
 * Aucun lieu n'en part : `country` vient de la RÉGION des réglages, pas d'une position.
 */
public data class ClientIdentity(
    val appVersion: String,
    val appBuild: String,
    val deviceName: String,
    val osVersion: String,
    val timezone: String,
    val localeTag: String?,
    val country: String?,
    val capabilities: List<ClientCapability> = ClientCapabilities.declared,
)

/** Le SEUL endroit qui orthographie les en-têtes d'identité du client. */
public object ClientIdentityHeaders {
    public const val VERSION: String = "X-Meeshy-Version"
    public const val BUILD: String = "X-Meeshy-Build"
    public const val PLATFORM: String = "X-Meeshy-Platform"
    public const val DEVICE: String = "X-Meeshy-Device"
    public const val DEVICE_NAME: String = "X-Meeshy-Device-Name"
    public const val OS: String = "X-Meeshy-OS"
    public const val TIMEZONE: String = "X-Meeshy-Timezone"
    public const val LOCALE: String = "X-Meeshy-Locale"
    public const val COUNTRY: String = "X-Meeshy-Country"

    public fun build(identity: ClientIdentity): Map<String, String> = buildMap {
        put(VERSION, identity.appVersion)
        put(BUILD, identity.appBuild)
        put(PLATFORM, AppVersionHeader.PLATFORM_VALUE)
        put(DEVICE, identity.deviceName)
        put(DEVICE_NAME, identity.deviceName)
        put(OS, identity.osVersion)
        put(TIMEZONE, identity.timezone)
        identity.localeTag?.takeIf { it.isNotBlank() }?.let { put(LOCALE, it) }
        identity.country?.takeIf { it.isNotBlank() }?.let { put(COUNTRY, it) }
        put(AppVersionHeader.VERSION_HEADER, identity.appVersion)
        put(AppVersionHeader.PLATFORM_HEADER, AppVersionHeader.PLATFORM_VALUE)
        ClientCapabilities.headerValue(identity.capabilities)?.let { put(ClientCapabilities.HEADER_NAME, it) }
    }
}
