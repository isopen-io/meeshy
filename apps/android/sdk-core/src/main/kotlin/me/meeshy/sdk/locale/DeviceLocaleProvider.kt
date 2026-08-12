package me.meeshy.sdk.locale

import java.util.Locale

/**
 * Testable seam over the device's current locale — same shape as
 * [me.meeshy.sdk.cache.CacheClock] wrapping [System.currentTimeMillis]. Exposes only the two raw
 * ISO codes the pure, `Locale`-free [me.meeshy.sdk.model.auth.SignupRegionInference] core needs
 * as inputs; this type performs no inference itself.
 */
interface DeviceLocaleProvider {
    /** Raw device language code (e.g. `"fr"`), or `null` when unavailable. */
    fun languageTag(): String?

    /** Raw device region code (e.g. `"FR"`), or `null` when unavailable. */
    fun regionTag(): String?
}

/**
 * [DeviceLocaleProvider] backed by [Locale.getDefault] — the Android/JVM equivalent of iOS
 * `Locale.current` (`RegistrationViewModel.detectLanguages()` / `detectCountry()`).
 */
object SystemDeviceLocaleProvider : DeviceLocaleProvider {
    override fun languageTag(): String? = Locale.getDefault().language.ifBlank { null }

    override fun regionTag(): String? = Locale.getDefault().country.ifBlank { null }
}
