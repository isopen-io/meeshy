package me.meeshy.app.notifications

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.BannerContentIcon
import me.meeshy.sdk.model.BannerHeadline
import me.meeshy.sdk.model.MediaSummary
import me.meeshy.sdk.model.NotificationBannerPresentation
import org.junit.Test

/**
 * Pure mapping from `UserNotificationPreferences.showPreview` to what the in-app banner is
 * allowed to carry (#4818) — no Compose, no ViewModel: [NotificationBannerViewModel] applies
 * [appliedPreviewSetting] before a presentation ever reaches [NotificationBannerHost].
 */
class NotificationPresentationTextTest {

    private fun presentation(
        headline: BannerHeadline = BannerHeadline.Plain("Alice"),
        body: String? = "Dinner at 8?",
        mediaSummary: MediaSummary? = MediaSummary.IMAGE,
        reactionBadge: String? = "🔥",
        thumbnailUrl: String? = "https://cdn.example/thumb.jpg",
    ) = NotificationBannerPresentation(
        headline = headline,
        body = body,
        mediaSummary = mediaSummary,
        reactionBadge = reactionBadge,
        thumbnailUrl = thumbnailUrl,
        contentIcon = BannerContentIcon.GENERIC,
    )

    @Test
    fun showPreviewTrue_leavesThePresentationUntouched() {
        val original = presentation()

        val result = original.appliedPreviewSetting(showPreview = true)

        assertThat(result).isEqualTo(original)
    }

    @Test
    fun showPreviewFalse_clearsTheBody() {
        val result = presentation().appliedPreviewSetting(showPreview = false)

        assertThat(result.body).isNull()
    }

    @Test
    fun showPreviewFalse_clearsTheMediaSummary() {
        val result = presentation().appliedPreviewSetting(showPreview = false)

        assertThat(result.mediaSummary).isNull()
    }

    @Test
    fun showPreviewFalse_clearsTheReactionBadge() {
        val result = presentation().appliedPreviewSetting(showPreview = false)

        assertThat(result.reactionBadge).isNull()
    }

    @Test
    fun showPreviewFalse_clearsTheThumbnailUrl() {
        val result = presentation().appliedPreviewSetting(showPreview = false)

        assertThat(result.thumbnailUrl).isNull()
    }

    @Test
    fun showPreviewFalse_leavesTheHeadlineIntact() {
        val headline = BannerHeadline.InConversation(actor = "Alice", groupName = "Team")

        val result = presentation(headline = headline).appliedPreviewSetting(showPreview = false)

        assertThat(result.headline).isEqualTo(headline)
    }
}
