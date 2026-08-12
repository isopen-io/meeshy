package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The auto-download decision SSOT (feature-parity §L — port of iOS
 * `MediaDownloadPolicyEngine`). A pure truth table: 4 [NetworkCondition] × 4
 * [AutoDownloadPolicy] = 16 cases plus the offline gate, driven off the
 * per-[MediaKind] policy in [MediaDownloadPreferences]. No I/O, no mutable state.
 */
class MediaDownloadPolicyEngineTest {

    private fun prefs(policy: AutoDownloadPolicy) = MediaDownloadPreferences(
        image = policy,
        audio = policy,
        audioTranslation = policy,
        video = policy,
    )

    private fun decide(policy: AutoDownloadPolicy, condition: NetworkCondition): Boolean =
        MediaDownloadPolicyEngine.shouldAutoDownload(
            kind = MediaKind.IMAGE,
            condition = condition,
            prefs = prefs(policy),
        )

    // ---- Offline gate wins over every policy ----

    @Test
    fun offline_neverDownloads_regardlessOfPolicy() {
        AutoDownloadPolicy.entries.forEach { policy ->
            assertThat(decide(policy, NetworkCondition.OFFLINE)).isFalse()
        }
    }

    // ---- NEVER ----

    @Test
    fun never_neverDownloads_onAnyOnlineCondition() {
        listOf(NetworkCondition.BAD_CELLULAR, NetworkCondition.GOOD_CELLULAR, NetworkCondition.WIFI)
            .forEach { condition ->
                assertThat(decide(AutoDownloadPolicy.NEVER, condition)).isFalse()
            }
    }

    // ---- ALWAYS ----

    @Test
    fun always_downloads_onEveryOnlineCondition() {
        listOf(NetworkCondition.BAD_CELLULAR, NetworkCondition.GOOD_CELLULAR, NetworkCondition.WIFI)
            .forEach { condition ->
                assertThat(decide(AutoDownloadPolicy.ALWAYS, condition)).isTrue()
            }
    }

    // ---- WIFI_ONLY ----

    @Test
    fun wifiOnly_downloadsOnWifiOnly() {
        assertThat(decide(AutoDownloadPolicy.WIFI_ONLY, NetworkCondition.WIFI)).isTrue()
        assertThat(decide(AutoDownloadPolicy.WIFI_ONLY, NetworkCondition.GOOD_CELLULAR)).isFalse()
        assertThat(decide(AutoDownloadPolicy.WIFI_ONLY, NetworkCondition.BAD_CELLULAR)).isFalse()
    }

    // ---- WIFI_AND_GOOD_CELLULAR ----

    @Test
    fun wifiAndGoodCellular_downloadsOnWifiAndGoodCellularButNotBad() {
        assertThat(decide(AutoDownloadPolicy.WIFI_AND_GOOD_CELLULAR, NetworkCondition.WIFI)).isTrue()
        assertThat(decide(AutoDownloadPolicy.WIFI_AND_GOOD_CELLULAR, NetworkCondition.GOOD_CELLULAR)).isTrue()
        assertThat(decide(AutoDownloadPolicy.WIFI_AND_GOOD_CELLULAR, NetworkCondition.BAD_CELLULAR)).isFalse()
    }

    // ---- Per-kind selection: the engine reads the policy for the *given* kind ----

    @Test
    fun readsThePolicyForTheGivenKind_notAGlobalOne() {
        val mixed = MediaDownloadPreferences(
            image = AutoDownloadPolicy.ALWAYS,
            audio = AutoDownloadPolicy.NEVER,
            audioTranslation = AutoDownloadPolicy.WIFI_ONLY,
            video = AutoDownloadPolicy.NEVER,
        )
        // Same condition, different kinds → different decisions.
        assertThat(
            MediaDownloadPolicyEngine.shouldAutoDownload(MediaKind.IMAGE, NetworkCondition.BAD_CELLULAR, mixed),
        ).isTrue()
        assertThat(
            MediaDownloadPolicyEngine.shouldAutoDownload(MediaKind.AUDIO, NetworkCondition.BAD_CELLULAR, mixed),
        ).isFalse()
        assertThat(
            MediaDownloadPolicyEngine.shouldAutoDownload(MediaKind.VIDEO, NetworkCondition.WIFI, mixed),
        ).isFalse()
        assertThat(
            MediaDownloadPolicyEngine.shouldAutoDownload(MediaKind.AUDIO_TRANSLATION, NetworkCondition.WIFI, mixed),
        ).isTrue()
    }
}
