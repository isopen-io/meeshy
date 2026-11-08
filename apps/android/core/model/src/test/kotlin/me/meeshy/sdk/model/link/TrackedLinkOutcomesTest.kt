package me.meeshy.sdk.model.link

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ResolvedTrackedLink
import me.meeshy.sdk.model.deeplink.DeepLinkDestination as D
import org.junit.Test

class TrackedLinkOutcomesTest {
    private fun outcome(resolved: ResolvedTrackedLink?) = TrackedLinkOutcomes.outcome(resolved, "tok123", "https://meeshy.me")

    @Test
    fun `a missing resolution is unresolved`() {
        assertThat(outcome(null)).isEqualTo(TrackedLinkOutcome.Unresolved("tok123"))
        assertThat(outcome(ResolvedTrackedLink())).isEqualTo(TrackedLinkOutcome.Unresolved("tok123"))
    }

    @Test
    fun `a conversation invitation joins by the token`() {
        assertThat(outcome(ResolvedTrackedLink(kind = "conversation"))).isEqualTo(TrackedLinkOutcome.Open(D.JoinLink("tok123")))
        assertThat(outcome(ResolvedTrackedLink(targetType = "conversation"))).isEqualTo(TrackedLinkOutcome.Open(D.JoinLink("tok123")))
    }

    @Test
    fun `typed targets map to their destination even when the link is inactive`() {
        fun typed(type: String) = outcome(ResolvedTrackedLink(targetType = type, targetId = "x1", isActive = false))
        assertThat(typed("STORY")).isEqualTo(TrackedLinkOutcome.Open(D.StoryDetail("x1")))
        assertThat(typed("PROFILE")).isEqualTo(TrackedLinkOutcome.Open(D.UserProfile("x1")))
        assertThat(typed("REEL")).isEqualTo(TrackedLinkOutcome.Open(D.Reel("x1")))
        assertThat(typed("POST")).isEqualTo(TrackedLinkOutcome.Open(D.PostDetail("x1")))
        assertThat(typed("STATUS")).isEqualTo(TrackedLinkOutcome.Open(D.PostDetail("x1")))
    }

    @Test
    fun `the original url is re-read when the type is unknown`() {
        assertThat(outcome(ResolvedTrackedLink(targetType = "FUTURE", originalUrl = "https://meeshy.me/story/s9")))
            .isEqualTo(TrackedLinkOutcome.Open(D.StoryDetail("s9")))
        assertThat(outcome(ResolvedTrackedLink(originalUrl = "https://example.org/page")))
            .isEqualTo(TrackedLinkOutcome.External("https://example.org/page"))
    }

    @Test
    fun `an invitation address yields a referral code`() {
        assertThat(outcome(ResolvedTrackedLink(originalUrl = "https://meeshy.me/signup/affiliate/CODE1")))
            .isEqualTo(TrackedLinkOutcome.Referral("CODE1"))
    }

    @Test
    fun `a link that signs in or resets a password is never followed`() {
        assertThat(outcome(ResolvedTrackedLink(originalUrl = "https://meeshy.me/auth/magic-link?token=abc")))
            .isEqualTo(TrackedLinkOutcome.Unresolved("tok123"))
        assertThat(outcome(ResolvedTrackedLink(originalUrl = "javascript:alert(1)")))
            .isEqualTo(TrackedLinkOutcome.Unresolved("tok123"))
    }
}
