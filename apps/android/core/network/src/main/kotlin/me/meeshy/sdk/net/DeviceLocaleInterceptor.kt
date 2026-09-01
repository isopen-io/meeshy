package me.meeshy.sdk.net

import me.meeshy.sdk.lang.DeviceLocaleTag
import okhttp3.Interceptor
import okhttp3.Response
import java.util.Locale

/**
 * Sends the device locale to the gateway as `X-Device-Locale` — the Prisme
 * Linguistique's 4th-priority signal (docs 2026-05-26), the iOS parity being
 * `ClientInfoProvider` (`X-Device-Locale = Locale.current.identifier`, `_` → `-`).
 *
 * The gateway `deviceLocaleMiddleware` reduces the header (`normalizeLanguageCode`)
 * and persists `User.deviceLocale`; `/auth/me` then returns it and the pure
 * `LanguageResolver` folds it in at 4th priority. Without this header that whole arm
 * was dead on Android — the field never filled, so the device locale never moved a
 * single content resolution. The tag travels RAW (`"zh-Hant-HK"`, `"fr-FR"`); the
 * gateway is the one place it is reduced, exactly as for iOS.
 *
 * The locale is read through [localeProvider] (default: the live [Locale.getDefault])
 * on EVERY request, so a mid-session locale change is reflected without rebuilding the
 * client. A caller-set header wins and an unusable locale sends nothing — the same
 * "don't clobber, don't send garbage" contract as [ClientCapabilitiesInterceptor].
 */
class DeviceLocaleInterceptor(
    private val localeProvider: () -> Locale = { Locale.getDefault() },
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (request.header(DEVICE_LOCALE_HEADER) != null) return chain.proceed(request)
        val tag = DeviceLocaleTag.of(localeProvider()) ?: return chain.proceed(request)
        return chain.proceed(
            request.newBuilder().header(DEVICE_LOCALE_HEADER, tag).build(),
        )
    }

    private companion object {
        const val DEVICE_LOCALE_HEADER = "X-Device-Locale"
    }
}
