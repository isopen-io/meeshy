package me.meeshy.sdk.net

import android.os.Build
import me.meeshy.sdk.model.net.AppVersionHeader
import me.meeshy.sdk.model.net.ClientCapabilities
import me.meeshy.sdk.model.net.ClientIdentity
import me.meeshy.sdk.model.net.DeviceModelName
import me.meeshy.sdk.lang.DeviceLocaleTag
import java.util.Locale
import java.util.TimeZone

/**
 * Compose, à chaque requête, ce que ce client déclare de lui — miroir de `ClientInfoProvider` (iOS).
 *
 * Version et build viennent du paquet (fournis par l'appelant) ; modèle, OS, fuseau, locale et
 * région sont lus À CHAQUE appel pour qu'un changement en cours de session soit suivi.
 */
class ClientInfoProvider(
    private val appVersion: String = AppVersionHeader.FALLBACK_VERSION,
    private val appBuild: String = "0",
    private val localeProvider: () -> Locale = { Locale.getDefault() },
    private val timeZoneProvider: () -> TimeZone = { TimeZone.getDefault() },
    private val deviceNameProvider: () -> String = {
        DeviceModelName.readable(model = Build.MODEL.orEmpty(), manufacturer = Build.MANUFACTURER.orEmpty())
    },
    private val osVersionProvider: () -> String = { "Android ${Build.VERSION.RELEASE.orEmpty()}".trim() },
) {
    fun identity(): ClientIdentity {
        val locale = localeProvider()
        return ClientIdentity(
            appVersion = appVersion,
            appBuild = appBuild,
            deviceName = deviceNameProvider(),
            osVersion = osVersionProvider(),
            timezone = timeZoneProvider().id,
            localeTag = DeviceLocaleTag.of(locale),
            country = locale.country.takeIf { it.isNotBlank() },
            capabilities = ClientCapabilities.declared,
        )
    }
}
