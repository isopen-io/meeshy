package me.meeshy.sdk.model.analytics.v2

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SocialEventV2ContractTest {

    @Test
    fun `les types v2 sont ceux du TS`() {
        assertThat(SocialEventV2Type.entries.map { it.wire }).containsExactlyElementsIn(TsContract.list("SOCIAL_EVENT_V2_TYPES")).inOrder()
    }

    @Test
    fun `les genres de cible sont ceux du TS`() {
        assertThat(SocialTargetKind.entries.map { it.wire }).containsExactlyElementsIn(TsContract.list("TARGET_KINDS")).inOrder()
    }

    @Test
    fun `chaque famille reprend les actions du TS ligne a ligne`() {
        val families = mapOf(
            "INTERACTION_ACTIONS" to SocialInteraction.Action.entries.map { it.wire },
            "NEGATIVE_ACTIONS" to SocialNegative.Action.entries.map { it.wire },
            "LINK_ACTIONS" to SocialLinkEvent.Action.entries.map { it.wire },
            "DISCOVERY_ACTIONS" to SocialDiscovery.Action.entries.map { it.wire },
            "STORY_ACTIONS" to SocialStoryEvent.Action.entries.map { it.wire },
            "NOTIFICATION_ACTIONS" to SocialNotificationEvent.Action.entries.map { it.wire },
            "SCREEN_CAPTURE_ACTIONS" to SocialScreenCapture.Action.entries.map { it.wire },
        )
        families.forEach { (name, kotlin) ->
            assertThat(kotlin).containsExactlyElementsIn(TsContract.list(name)).inOrder()
        }
    }

    @Test
    fun `les actions fixes des familles playback scroll et visibility sont celles du TS`() {
        assertThat(listOf(playback().action)).isEqualTo(TsContract.list("PLAYBACK_ACTIONS"))
        assertThat(listOf(scrollListing().action, scrollContent().action)).isEqualTo(TsContract.list("SCROLL_ACTIONS"))
        assertThat(listOf(SocialVisibility(0.0, 0, false).action)).isEqualTo(TsContract.list("VISIBILITY_ACTIONS"))
    }

    @Test
    fun `les enumerations de champs sont celles du TS`() {
        assertThat(SocialInteraction.ShareDestination.entries.map { it.wire }).containsExactlyElementsIn(TsContract.list("SHARE_DESTINATIONS")).inOrder()
        assertThat(SocialRankingSource.entries.map { it.wire }).containsExactlyElementsIn(TsContract.list("RANKING_SOURCES")).inOrder()
        assertThat(ScrollContentSummary.ContentKind.entries.map { it.wire }).containsExactlyElementsIn(TsContract.list("SCROLL_CONTENT_KINDS")).inOrder()
        assertThat(SocialScreenCapture.CaptureKind.entries.map { it.wire }).containsExactlyElementsIn(TsContract.list("CAPTURE_KINDS")).inOrder()
        assertThat(PlaybackSummary.ExitReason.entries.map { it.wire }).containsExactlyElementsIn(TsContract.list("PLAYBACK_EXIT_REASONS")).inOrder()
        assertThat(SocialNotificationEvent.Channel.entries.map { it.wire }).containsExactlyElementsIn(TsContract.list("NOTIFICATION_CHANNELS")).inOrder()
        assertThat(SocialPrism.TranslationSource.entries.map { it.wire }).containsExactlyElementsIn(TsContract.list("TRANSLATION_SOURCES")).inOrder()
        assertThat(SocialDiscovery.ResultKind.entries.map { it.wire }.sorted())
            .isEqualTo(TsContract.list("SEARCH_RESULT_KINDS").sorted())
    }

    @Test
    fun `les bornes sont celles du TS`() {
        assertThat(SocialEventV2Wire.MAX_EVENT_BYTES.toLong()).isEqualTo(TsContract.number("SOCIAL_EVENT_MAX_BYTES"))
        assertThat(SocialEventV2Wire.MAX_EVENTS_PER_REQUEST.toLong()).isEqualTo(TsContract.number("SOCIAL_EVENTS_V2_BATCH_CAP"))
        assertThat(SocialEventV2Wire.MAX_AGE_MS).isEqualTo(TsContract.number("SOCIAL_EVENT_MAX_AGE_MS"))
        assertThat(SocialEventV2Wire.VISIBLE_TARGETS_MAX.toLong()).isEqualTo(TsContract.number("VISIBLE_TARGETS_MAX"))
    }

    @Test
    fun `visiteurs et echantillonnage suivent les listes du TS`() {
        val visitor = SocialEventV2Type.entries.filter { it.isAllowedForVisitor }.map { it.wire }
        assertThat(visitor).containsExactlyElementsIn(TsContract.list("ANONYMOUS_V2_TYPES"))
        val sampleable = SocialEventV2Type.entries.filter { it.isSampleable }.map { it.wire }
        assertThat(sampleable).containsExactlyElementsIn(TsContract.list("SAMPLEABLE_V2_TYPES"))
    }
}
