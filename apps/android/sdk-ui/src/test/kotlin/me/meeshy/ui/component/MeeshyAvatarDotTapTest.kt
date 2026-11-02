package me.meeshy.ui.component

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.avatar.AvatarContext
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Parité iOS `MeeshyAvatar(onOnlineTap:)`: seul le point se touche, le reste de l'avatar garde le geste de l'hôte. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyAvatarDotTapTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(presence: PresenceState?, onDotTap: (() -> Unit)?, onHostTap: () -> Unit = {}) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.clickable(onClick = onHostTap)) {
                    MeeshyAvatar(
                        name = "Ali",
                        context = AvatarContext.ConversationHeaderCollapsed,
                        presence = presence,
                        onDotTap = onDotTap,
                    )
                }
            }
        }
    }

    @Test
    fun `touching the dot calls onDotTap and not the host`() {
        var dot = 0
        var host = 0
        show(PresenceState.ONLINE, onDotTap = { dot++ }, onHostTap = { host++ })

        compose.onNodeWithTag(AvatarPresenceDotTouchTestTag, useUnmergedTree = true).performClick()

        assertThat(dot).isEqualTo(1)
        assertThat(host).isEqualTo(0)
    }

    @Test
    fun `touching the centre of the avatar leaves the tap to the host`() {
        var dot = 0
        var host = 0
        show(PresenceState.ONLINE, onDotTap = { dot++ }, onHostTap = { host++ })

        compose.onNodeWithContentDescription("Ali", useUnmergedTree = true).performClick()

        assertThat(dot).isEqualTo(0)
        assertThat(host).isEqualTo(1)
    }

    @Test
    fun `without a callback or without a dot there is no touch zone`() {
        show(PresenceState.ONLINE, onDotTap = null)
        compose.onAllNodesWithTag(AvatarPresenceDotTouchTestTag, useUnmergedTree = true).assertCountEquals(0)
    }

    @Test
    fun `an offline peer draws no dot and no touch zone`() {
        show(PresenceState.OFFLINE, onDotTap = {})
        compose.onAllNodesWithTag(AvatarPresenceDotTouchTestTag, useUnmergedTree = true).assertCountEquals(0)
    }
}
