package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The first media-pipeline consumer of [MediaDownloadPolicyEngine] (feature-parity §L —
 * port of the guard chain iOS inlines in `ConversationMediaViews`'s auto-download `.task`).
 * A pure state machine layering the availability gates (unsupported / already-available /
 * in-flight) over the policy truth table, so a media view only has to ask "should I start
 * this download?" and paint the answer.
 */
class MediaAutoDownloadDeciderTest {

    private fun prefs(policy: AutoDownloadPolicy) = MediaDownloadPreferences(
        image = policy, audio = policy, audioTranslation = policy, video = policy,
    )

    // ---- Unsupported kind short-circuits before anything else ----

    @Test
    fun unsupportedKind_isSkippedAsUnsupported_evenWhenPolicyWouldAllow() {
        val decision = MediaAutoDownloadDecider.decide(
            kind = null,
            availability = MediaAvailability.NEEDS_DOWNLOAD,
            condition = NetworkCondition.WIFI,
            prefs = prefs(AutoDownloadPolicy.ALWAYS),
        )
        assertThat(decision).isEqualTo(AutoDownloadDecision.SKIP_UNSUPPORTED)
        assertThat(decision.shouldDownload).isFalse()
    }

    @Test
    fun unsupportedKind_isSkippedAsUnsupported_regardlessOfAvailability() {
        MediaAvailability.entries.forEach { availability ->
            assertThat(
                MediaAutoDownloadDecider.decide(
                    kind = null,
                    availability = availability,
                    condition = NetworkCondition.WIFI,
                    prefs = prefs(AutoDownloadPolicy.ALWAYS),
                ),
            ).isEqualTo(AutoDownloadDecision.SKIP_UNSUPPORTED)
        }
    }

    // ---- Availability gates (a supported kind whose policy would otherwise say DOWNLOAD) ----

    @Test
    fun alreadyAvailable_isSkipped_notReDownloaded() {
        val decision = MediaAutoDownloadDecider.decide(
            kind = MediaKind.IMAGE,
            availability = MediaAvailability.AVAILABLE,
            condition = NetworkCondition.WIFI,
            prefs = prefs(AutoDownloadPolicy.ALWAYS),
        )
        assertThat(decision).isEqualTo(AutoDownloadDecision.SKIP_ALREADY_AVAILABLE)
    }

    @Test
    fun downloadInFlight_isSkipped_notStartedAgain() {
        val decision = MediaAutoDownloadDecider.decide(
            kind = MediaKind.IMAGE,
            availability = MediaAvailability.DOWNLOADING,
            condition = NetworkCondition.WIFI,
            prefs = prefs(AutoDownloadPolicy.ALWAYS),
        )
        assertThat(decision).isEqualTo(AutoDownloadDecision.SKIP_IN_FLIGHT)
    }

    // ---- Needs-download + policy arm ----

    @Test
    fun needsDownload_andPolicyAllows_downloads() {
        val decision = MediaAutoDownloadDecider.decide(
            kind = MediaKind.IMAGE,
            availability = MediaAvailability.NEEDS_DOWNLOAD,
            condition = NetworkCondition.GOOD_CELLULAR,
            prefs = prefs(AutoDownloadPolicy.WIFI_AND_GOOD_CELLULAR),
        )
        assertThat(decision).isEqualTo(AutoDownloadDecision.DOWNLOAD)
        assertThat(decision.shouldDownload).isTrue()
    }

    @Test
    fun needsDownload_butPolicyDenies_isSkippedByPolicy() {
        val decision = MediaAutoDownloadDecider.decide(
            kind = MediaKind.VIDEO,
            availability = MediaAvailability.NEEDS_DOWNLOAD,
            condition = NetworkCondition.BAD_CELLULAR,
            prefs = prefs(AutoDownloadPolicy.WIFI_AND_GOOD_CELLULAR),
        )
        assertThat(decision).isEqualTo(AutoDownloadDecision.SKIP_POLICY)
    }

    @Test
    fun needsDownload_offline_isSkippedByPolicy() {
        // The offline gate lives in the engine; the decider must surface it as SKIP_POLICY,
        // never DOWNLOAD.
        val decision = MediaAutoDownloadDecider.decide(
            kind = MediaKind.IMAGE,
            availability = MediaAvailability.NEEDS_DOWNLOAD,
            condition = NetworkCondition.OFFLINE,
            prefs = prefs(AutoDownloadPolicy.ALWAYS),
        )
        assertThat(decision).isEqualTo(AutoDownloadDecision.SKIP_POLICY)
    }

    @Test
    fun readsThePerKindPolicy_notAGlobalOne() {
        val mixed = MediaDownloadPreferences(
            image = AutoDownloadPolicy.ALWAYS,
            audio = AutoDownloadPolicy.NEVER,
            audioTranslation = AutoDownloadPolicy.ALWAYS,
            video = AutoDownloadPolicy.NEVER,
        )
        assertThat(
            MediaAutoDownloadDecider.decide(
                MediaKind.IMAGE, MediaAvailability.NEEDS_DOWNLOAD, NetworkCondition.BAD_CELLULAR, mixed,
            ),
        ).isEqualTo(AutoDownloadDecision.DOWNLOAD)
        assertThat(
            MediaAutoDownloadDecider.decide(
                MediaKind.AUDIO, MediaAvailability.NEEDS_DOWNLOAD, NetworkCondition.BAD_CELLULAR, mixed,
            ),
        ).isEqualTo(AutoDownloadDecision.SKIP_POLICY)
    }

    // ---- decideFor: classification + decision in one call ----

    @Test
    fun decideFor_classifiesTheMimeThenDecides() {
        assertThat(
            MediaAutoDownloadDecider.decideFor(
                mimeType = "video/mp4",
                isAudioTranslation = false,
                availability = MediaAvailability.NEEDS_DOWNLOAD,
                condition = NetworkCondition.WIFI,
                prefs = prefs(AutoDownloadPolicy.WIFI_ONLY),
            ),
        ).isEqualTo(AutoDownloadDecision.DOWNLOAD)
    }

    @Test
    fun decideFor_unclassifiableMime_isUnsupported() {
        assertThat(
            MediaAutoDownloadDecider.decideFor(
                mimeType = "application/pdf",
                isAudioTranslation = false,
                availability = MediaAvailability.NEEDS_DOWNLOAD,
                condition = NetworkCondition.WIFI,
                prefs = prefs(AutoDownloadPolicy.ALWAYS),
            ),
        ).isEqualTo(AutoDownloadDecision.SKIP_UNSUPPORTED)
    }

    @Test
    fun decideFor_routesTranslationFlagToTheAudioTranslationPolicy() {
        val prefs = MediaDownloadPreferences(
            audio = AutoDownloadPolicy.NEVER,
            audioTranslation = AutoDownloadPolicy.ALWAYS,
        )
        // Same audio MIME, translation flag flips which per-kind policy applies.
        assertThat(
            MediaAutoDownloadDecider.decideFor(
                "audio/mpeg", isAudioTranslation = true,
                MediaAvailability.NEEDS_DOWNLOAD, NetworkCondition.BAD_CELLULAR, prefs,
            ),
        ).isEqualTo(AutoDownloadDecision.DOWNLOAD)
        assertThat(
            MediaAutoDownloadDecider.decideFor(
                "audio/mpeg", isAudioTranslation = false,
                MediaAvailability.NEEDS_DOWNLOAD, NetworkCondition.BAD_CELLULAR, prefs,
            ),
        ).isEqualTo(AutoDownloadDecision.SKIP_POLICY)
    }
}
