package me.meeshy.sdk.lang

import java.util.Locale

/**
 * The device locale, formatted for the `X-Device-Locale` request header.
 *
 * The 4th priority of the Prisme Linguistique (docs 2026-05-26) is the device
 * locale: after `systemLanguage`, `regionalLanguage`, `customDestinationLanguage`.
 * The gateway learns it from the `X-Device-Locale` header — iOS sends
 * `Locale.current.identifier` (POSIX `_` → RFC 5646 `-`) and the middleware
 * `deviceLocaleMiddleware` runs it through `normalizeLanguageCode` before persisting
 * `User.deviceLocale`. This is Android's mirror of that source: the RAW BCP-47 tag,
 * reduced by the gateway — never here, so `"zh-Hant-HK"` reaches the server intact
 * and the server keys it exactly as it keys iOS.
 *
 * [of] returns the tag to send, or `null` when the locale carries nothing worth
 * signalling — an absent language subtag ([Locale.ROOT], a region-only locale), or
 * an ill-formed one that [Locale.toLanguageTag] collapses to `"und"`. A `null` tells
 * the caller to omit the header entirely rather than put `"und"` on every request.
 *
 * Pure, clockless, IO-less `:core:model` building block: the "when" (which locale,
 * when to read it) belongs to the caller (`DeviceLocaleInterceptor`).
 */
object DeviceLocaleTag {

    private const val UNDETERMINED = "und"

    /** The BCP-47 tag to send for [locale], or `null` when there is no usable language. */
    fun of(locale: Locale): String? {
        if (locale.language.isBlank()) return null
        val tag = locale.toLanguageTag()
        if (tag.isBlank() || tag == UNDETERMINED) return null
        return tag
    }
}
