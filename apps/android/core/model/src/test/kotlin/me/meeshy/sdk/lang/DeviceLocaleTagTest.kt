package me.meeshy.sdk.lang

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.util.Locale

/**
 * The device-locale header carries the RAW OS locale tag; the gateway reduces it.
 *
 * iOS sends `Locale.current.identifier` (POSIX `_` → RFC 5646 `-`) as `X-Device-Locale`,
 * the middleware `normalizeLanguageCode`s it into `User.deviceLocale`. Android's mirror
 * is `Locale.getDefault().toLanguageTag()` — already BCP-47. [DeviceLocaleTag.of] adds
 * only the two guards that keep an UNUSABLE locale off the wire (a device with no
 * language subtag, or an ill-formed one): those must resolve to `null` so the interceptor
 * omits the header entirely rather than sending `"und"`, which the gateway would drop
 * anyway but which would still be a meaningless request header on every call.
 */
class DeviceLocaleTagTest {

    @Test
    fun `a language+region locale yields its raw BCP-47 tag`() {
        assertThat(DeviceLocaleTag.of(Locale.FRANCE)).isEqualTo("fr-FR")
    }

    @Test
    fun `a language-only locale yields the bare language tag`() {
        assertThat(DeviceLocaleTag.of(Locale.ENGLISH)).isEqualTo("en")
    }

    @Test
    fun `script and region are preserved verbatim for the gateway to reduce`() {
        assertThat(DeviceLocaleTag.of(Locale.forLanguageTag("zh-Hant-HK")))
            .isEqualTo("zh-Hant-HK")
    }

    @Test
    fun `a regional variant keeps its region`() {
        assertThat(DeviceLocaleTag.of(Locale.forLanguageTag("pt-BR"))).isEqualTo("pt-BR")
    }

    @Test
    fun `the undetermined root locale is omitted`() {
        assertThat(DeviceLocaleTag.of(Locale.ROOT)).isNull()
    }

    @Test
    fun `a locale with a region but no language is omitted`() {
        // toLanguageTag() → "und-FR": there is no language to signal, so nothing goes out.
        @Suppress("DEPRECATION")
        assertThat(DeviceLocaleTag.of(Locale("", "FR"))).isNull()
    }

    @Test
    fun `an ill-formed language subtag is omitted`() {
        // getLanguage() is non-blank ("123") yet toLanguageTag() collapses to "und":
        // a distinct branch from the blank-language guard, and it must also be dropped.
        @Suppress("DEPRECATION")
        assertThat(DeviceLocaleTag.of(Locale("123"))).isNull()
    }

    @Test
    fun `a legacy language code is emitted in its modern form`() {
        // toLanguageTag() normalises the JVM's legacy "iw" to modern "he".
        @Suppress("DEPRECATION")
        assertThat(DeviceLocaleTag.of(Locale("he"))).isEqualTo("he")
    }
}
