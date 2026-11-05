package me.meeshy.app.sync

import com.google.common.truth.Truth.assertThat
import me.meeshy.app.navigation.Routes
import me.meeshy.sdk.model.sync.OutboxNavigationSource
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SyncPillNavigationTest {
    @Test
    fun `un envoi mene au message vise par son ancre`() {
        assertThat(SyncPillNavigation.route(OutboxNavigationSource.Conversation("c1", "m1")))
            .isEqualTo(Routes.chat("c1", "m1"))
    }

    @Test
    fun `une frappe mene a la conversation sans viser de message`() {
        assertThat(SyncPillNavigation.route(OutboxNavigationSource.Conversation("c1", null)))
            .isEqualTo(Routes.chat("c1", null))
    }

    @Test
    fun `un post mene a son detail`() {
        assertThat(SyncPillNavigation.route(OutboxNavigationSource.Post("p1"))).isEqualTo(Routes.postDetail("p1"))
    }

    @Test
    fun `une story mene a son detail`() {
        assertThat(SyncPillNavigation.route(OutboxNavigationSource.Story("s1"))).isEqualTo(Routes.postDetail("s1"))
    }

    @Test
    fun `une source inconnue ne mene nulle part`() {
        assertThat(SyncPillNavigation.route(OutboxNavigationSource.Unknown)).isNull()
    }

    @Test
    fun `la pastille cede au visionneur de stories, aux reels et a la banniere in-app`() {
        assertThat(SyncPillVisibility.isVisible(Routes.STORY_VIEWER, inAppBannerPresenting = false)).isFalse()
        assertThat(SyncPillVisibility.isVisible(Routes.REELS, inAppBannerPresenting = false)).isFalse()
        assertThat(SyncPillVisibility.isVisible(Routes.CONVERSATIONS, inAppBannerPresenting = true)).isFalse()
        assertThat(SyncPillVisibility.isVisible(Routes.CONVERSATIONS, inAppBannerPresenting = false)).isTrue()
        assertThat(SyncPillVisibility.isVisible(null, inAppBannerPresenting = false)).isTrue()
    }
}
