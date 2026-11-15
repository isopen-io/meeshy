package me.meeshy.app.notifications

import io.mockk.mockk
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiNotification
import io.mockk.mockk
import org.junit.Test

/** Où mène le toucher d'une bannière in-app : la même table que la ligne de la cloche et le push (#18670). */
class BannerTapTargetTest {

    private fun banner(
        conversationId: String? = null,
        postId: String? = null,
        communityId: String? = null,
        game: ApiNotification? = null,
    ) = InAppBanner(
        notificationId = "n1",
        presentation = mockk(relaxed = true),
        avatarName = "Ada",
        avatarUrl = null,
        conversationId = conversationId,
        postId = postId,
        communityId = communityId,
        game = game,
    )

    @Test
    fun theBannerOfAnAdditionToACommunityOpensTheCommunity() {
        assertThat(banner(conversationId = "c1", communityId = "k1").tapTarget()).isEqualTo(BannerTap.Community("k1"))
    }

    @Test
    fun aMessageBannerOpensItsConversation() {
        assertThat(banner(conversationId = "c1", postId = "p1").tapTarget()).isEqualTo(BannerTap.Conversation("c1"))
    }

    @Test
    fun aPostBannerOpensThePost() {
        assertThat(banner(postId = "p1").tapTarget()).isEqualTo(BannerTap.Post("p1"))
    }

    @Test
    fun aGameBannerWinsOverEverythingElse() {
        val game = ApiNotification(id = "g1", type = "streak_milestone")
        assertThat(banner(conversationId = "c1", communityId = "k1", game = game).tapTarget()).isEqualTo(BannerTap.Game(game))
    }

    @Test
    fun aBannerThatNamesNothingLeadsNowhere() {
        assertThat(banner().tapTarget()).isEqualTo(BannerTap.None)
    }
}
