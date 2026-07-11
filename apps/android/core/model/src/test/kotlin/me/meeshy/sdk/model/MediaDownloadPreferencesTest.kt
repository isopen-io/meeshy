package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The media-download preference block (feature-parity §L — port of iOS
 * `MediaDownloadPreferences`): its per-kind default policies, the [MediaDownloadPreferences.policy]
 * lens, and the durable JSON codec ([storageValue] / [mediaDownloadPreferencesFromStorage]) with
 * its corruption-safe decode.
 */
class MediaDownloadPreferencesTest {

    // ---- Defaults mirror iOS ----

    @Test
    fun defaults_mirrorIos_conservativeForHeavyMedia() {
        val prefs = MediaDownloadPreferences()
        assertThat(prefs.image).isEqualTo(AutoDownloadPolicy.WIFI_AND_GOOD_CELLULAR)
        assertThat(prefs.audio).isEqualTo(AutoDownloadPolicy.WIFI_AND_GOOD_CELLULAR)
        assertThat(prefs.audioTranslation).isEqualTo(AutoDownloadPolicy.WIFI_ONLY)
        assertThat(prefs.video).isEqualTo(AutoDownloadPolicy.WIFI_ONLY)
    }

    // ---- policy(for:) lens ----

    @Test
    fun policyForKind_returnsTheMatchingPerKindPolicy() {
        val prefs = MediaDownloadPreferences(
            image = AutoDownloadPolicy.ALWAYS,
            audio = AutoDownloadPolicy.WIFI_ONLY,
            audioTranslation = AutoDownloadPolicy.NEVER,
            video = AutoDownloadPolicy.WIFI_AND_GOOD_CELLULAR,
        )
        assertThat(prefs.policy(MediaKind.IMAGE)).isEqualTo(AutoDownloadPolicy.ALWAYS)
        assertThat(prefs.policy(MediaKind.AUDIO)).isEqualTo(AutoDownloadPolicy.WIFI_ONLY)
        assertThat(prefs.policy(MediaKind.AUDIO_TRANSLATION)).isEqualTo(AutoDownloadPolicy.NEVER)
        assertThat(prefs.policy(MediaKind.VIDEO)).isEqualTo(AutoDownloadPolicy.WIFI_AND_GOOD_CELLULAR)
    }

    @Test
    fun withPolicy_setsExactlyTheGivenKind_leavingOthersUntouched() {
        val prefs = MediaDownloadPreferences()
        val next = prefs.withPolicy(MediaKind.VIDEO, AutoDownloadPolicy.ALWAYS)
        assertThat(next.video).isEqualTo(AutoDownloadPolicy.ALWAYS)
        assertThat(next.image).isEqualTo(prefs.image)
        assertThat(next.audio).isEqualTo(prefs.audio)
        assertThat(next.audioTranslation).isEqualTo(prefs.audioTranslation)
    }

    // ---- Codec ----

    @Test
    fun codec_roundTripsEveryKind() {
        val prefs = MediaDownloadPreferences(
            image = AutoDownloadPolicy.NEVER,
            audio = AutoDownloadPolicy.ALWAYS,
            audioTranslation = AutoDownloadPolicy.WIFI_AND_GOOD_CELLULAR,
            video = AutoDownloadPolicy.WIFI_ONLY,
        )
        assertThat(mediaDownloadPreferencesFromStorage(prefs.storageValue)).isEqualTo(prefs)
    }

    @Test
    fun codec_serialNames_matchIosRawValues() {
        val json = MediaDownloadPreferences(
            image = AutoDownloadPolicy.WIFI_AND_GOOD_CELLULAR,
            video = AutoDownloadPolicy.WIFI_ONLY,
        ).storageValue
        assertThat(json).contains("wifiAndGoodCellular")
        assertThat(json).contains("wifiOnly")
    }

    @Test
    fun codec_blankOrNull_degradesToDefaults() {
        assertThat(mediaDownloadPreferencesFromStorage(null)).isEqualTo(MediaDownloadPreferences())
        assertThat(mediaDownloadPreferencesFromStorage("")).isEqualTo(MediaDownloadPreferences())
        assertThat(mediaDownloadPreferencesFromStorage("   ")).isEqualTo(MediaDownloadPreferences())
    }

    @Test
    fun codec_malformedToken_degradesToDefaults() {
        assertThat(mediaDownloadPreferencesFromStorage("{not json")).isEqualTo(MediaDownloadPreferences())
        assertThat(mediaDownloadPreferencesFromStorage("[]")).isEqualTo(MediaDownloadPreferences())
    }

    @Test
    fun codec_partialToken_fillsMissingKindsWithDefaults() {
        val decoded = mediaDownloadPreferencesFromStorage("""{"video":"always"}""")
        assertThat(decoded.video).isEqualTo(AutoDownloadPolicy.ALWAYS)
        assertThat(decoded.image).isEqualTo(MediaDownloadPreferences().image)
        assertThat(decoded.audio).isEqualTo(MediaDownloadPreferences().audio)
        assertThat(decoded.audioTranslation).isEqualTo(MediaDownloadPreferences().audioTranslation)
    }

    @Test
    fun codec_unknownKeys_areIgnored() {
        val decoded = mediaDownloadPreferencesFromStorage("""{"image":"never","legacyField":true}""")
        assertThat(decoded.image).isEqualTo(AutoDownloadPolicy.NEVER)
    }

    @Test
    fun codec_unknownPolicyValue_degradesToDefaults() {
        // A whole-block decode failure (unknown enum token) must not crash — it falls back.
        assertThat(mediaDownloadPreferencesFromStorage("""{"image":"turbo"}"""))
            .isEqualTo(MediaDownloadPreferences())
    }
}
