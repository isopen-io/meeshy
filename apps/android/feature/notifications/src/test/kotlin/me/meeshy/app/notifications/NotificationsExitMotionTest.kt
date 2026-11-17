package me.meeshy.app.notifications

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.MutableFloatState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.BannerContentIcon
import me.meeshy.sdk.model.BannerHeadline
import me.meeshy.sdk.model.NotificationBannerPresentation
import me.meeshy.ui.accessibility.LocalReduceMotion
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Ce qui quitte la cloche joue sa sortie jusqu'au bout : la bannière in-app, la coche « Tout lire », le libellé des
 * non lues et la pastille de non-lu restent peints pendant leur fondu au lieu de disparaître d'un coup.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "en-w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class NotificationsExitMotionTest {

    @get:Rule
    val compose = createComposeRule()

    private fun change(block: () -> Unit) = compose.runOnUiThread {
        block()
        Snapshot.sendApplyNotifications()
    }

    private fun banner(id: String) = InAppBanner(
        notificationId = id,
        presentation = NotificationBannerPresentation(
            headline = BannerHeadline.Plain("Ana"),
            body = "Salut",
            mediaSummary = null,
            reactionBadge = null,
            thumbnailUrl = null,
            contentIcon = BannerContentIcon.GENERIC,
        ),
        avatarName = "Ana",
        avatarUrl = null,
        conversationId = "c1",
        postId = null,
    )

    private fun showBanner(reduce: Boolean, initial: InAppBanner?): (InAppBanner?) -> Unit {
        var current by mutableStateOf(initial)
        compose.setContent {
            CompositionLocalProvider(LocalReduceMotion provides reduce) {
                NotificationBannerTransition(banner = current, reduceMotion = reduce) { shown, live ->
                    Box(Modifier.size(320.dp, 72.dp)) {
                        Text(shown.notificationId)
                        if (!live) Text("${shown.notificationId}:inert")
                    }
                }
            }
        }
        compose.waitForIdle()
        return { current = it }
    }

    @Test
    fun `a dismissed banner keeps its content painted while it slides out`() {
        val set = showBanner(reduce = false, initial = banner("n-leaving"))
        compose.onNodeWithText("n-leaving").assertExists()

        compose.mainClock.autoAdvance = false
        change { set(null) }
        compose.mainClock.advanceTimeBy(48)

        compose.onNodeWithText("n-leaving").assertExists()
        compose.mainClock.advanceTimeBy(3_000)
        compose.onNodeWithText("n-leaving").assertDoesNotExist()
    }

    @Test
    fun `under reduce motion a dismissed banner fades with its content still painted`() {
        val set = showBanner(reduce = true, initial = banner("n-fading"))

        compose.mainClock.autoAdvance = false
        change { set(null) }
        compose.mainClock.advanceTimeBy(48)

        compose.onNodeWithText("n-fading").assertExists()
    }

    @Test
    fun `the banner leaves on the same bouncy spring it arrived on`() {
        val set = showBanner(reduce = false, initial = banner("n-spring"))

        compose.mainClock.autoAdvance = false
        change { set(null) }
        compose.mainClock.advanceTimeBy(480)

        compose.onNodeWithText("n-spring").assertExists()
    }

    @Test
    fun `a leaving banner is only an image and no longer takes a tap or a swipe`() {
        val set = showBanner(reduce = false, initial = banner("n-inert"))
        compose.onNodeWithText("n-inert:inert").assertDoesNotExist()

        compose.mainClock.autoAdvance = false
        change { set(null) }
        compose.mainClock.advanceTimeBy(48)

        compose.onNodeWithText("n-inert:inert").assertExists()
    }

    @Test
    fun `a banner swiped away leaves from where the finger let go and the next one starts at rest`() {
        var current by mutableStateOf<InAppBanner?>(banner("n-swiped"))
        lateinit var lift: MutableFloatState
        compose.setContent { lift = rememberBannerLift(current) }
        compose.waitForIdle()

        change { lift.floatValue = -40f }
        change { current = null }
        compose.waitForIdle()
        assertThat(lift.floatValue).isEqualTo(-40f)

        change { current = banner("n-next") }
        compose.waitForIdle()
        assertThat(lift.floatValue).isEqualTo(0f)
    }

    private fun showHeader(reduce: Boolean, initialUnread: Int): (Int) -> Unit {
        var unread by mutableIntStateOf(initialUnread)
        compose.setContent {
            CompositionLocalProvider(LocalReduceMotion provides reduce) {
                NotificationListHeader(scrollOffsetDp = 0f, unreadCount = unread, onBack = {}, onMarkAllRead = {})
            }
        }
        compose.waitForIdle()
        return { unread = it }
    }

    @Test
    fun `the mark all read check fades out instead of vanishing once everything is read`() {
        val set = showHeader(reduce = false, initialUnread = 3)
        compose.onNodeWithContentDescription("Mark all read").assertExists()

        compose.mainClock.autoAdvance = false
        change { set(0) }
        compose.mainClock.advanceTimeBy(48)

        compose.onNodeWithContentDescription("Mark all read").assertExists()
        compose.mainClock.advanceTimeBy(2_000)
        compose.onNodeWithContentDescription("Mark all read").assertDoesNotExist()
    }

    @Test
    fun `under reduce motion the unread label fades in place without shrinking and keeps its count`() {
        val set = showHeader(reduce = true, initialUnread = 3)
        val fullHeight = compose.onNodeWithTag(UNREAD_COUNT_TAG).getUnclippedBoundsInRoot().height

        compose.mainClock.autoAdvance = false
        change { set(0) }
        compose.mainClock.advanceTimeBy(64)

        val label = compose.onNodeWithTag(UNREAD_COUNT_TAG)
        label.assertTextEquals("3 unread")
        assertThat(label.getUnclippedBoundsInRoot().height).isEqualTo(fullHeight)
    }

    @Test
    fun `the unread dot fades out with the row wash instead of vanishing`() {
        var unread by mutableStateOf(true)
        compose.setContent { NotificationUnreadDot(visible = unread, color = Color.Red) }
        compose.onNodeWithTag(UNREAD_DOT_TAG).assertExists()

        compose.mainClock.autoAdvance = false
        change { unread = false }
        compose.mainClock.advanceTimeBy(64)

        compose.onNodeWithTag(UNREAD_DOT_TAG).assertExists()
        compose.mainClock.advanceTimeBy(1_000)
        compose.onNodeWithTag(UNREAD_DOT_TAG).assertDoesNotExist()
    }
}
