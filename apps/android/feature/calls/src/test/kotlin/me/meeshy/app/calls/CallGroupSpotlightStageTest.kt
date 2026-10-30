package me.meeshy.app.calls

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.group.GroupCallArrival
import me.meeshy.sdk.model.call.group.GroupCallMediaKind
import me.meeshy.sdk.model.call.group.GroupCallRoster
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * La mise à la une d'une vignette dans un appel de groupe (#13750), comme iOS `GroupCallStageView` : toucher une
 * vignette la met à la une avec la pellicule des autres, « Revenir à la grille » rend la grille, le plein écran ne
 * garde qu'elle, et un écran partagé y monte seul.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallGroupSpotlightStageTest {
    @get:Rule val rule = createComposeRule()

    private val noEgl = object : org.webrtc.EglBase.Context {
        override fun getNativeEglContext(): Long = 0
    }

    private val state = CallPresenter.present(
        CallState.Connected,
        CallConfig(peerId = "alice", peerName = "Alice", isVideo = false, isOutgoing = true),
        CallMedia(),
        elapsedSeconds = 30,
        mediaEstablished = true,
    )

    private val trio = GroupCallRoster("me")
        .admitting(GroupCallArrival("alice", displayName = "Alice"), isPrimary = true)
        .admitting(GroupCallArrival("bob", displayName = "Bob"))

    private fun mesh(roster: GroupCallRoster = trio, speaking: Set<String> = emptySet()) =
        GroupCallMeshUi(isActive = true, roster = roster, primaryUserId = "alice", speakingUserIds = speaking)

    private class Taps {
        var stage = 0
        val fullScreen = mutableListOf<Boolean>()
    }

    private fun stage(
        roster: GroupCallRoster = trio,
        speaking: Set<String> = emptySet(),
        isChromeVisible: Boolean = true,
        taps: Taps = Taps(),
    ): Taps {
        rule.setContent {
            var fullScreen by remember { mutableStateOf(false) }
            MeeshyTheme(darkTheme = true) {
                CallGroupStage(
                    state = state,
                    mesh = mesh(roster, speaking),
                    localTrack = null,
                    primaryTrack = null,
                    eglContext = noEgl,
                    isChromeVisible = isChromeVisible,
                    isFullScreen = fullScreen,
                    onFullScreenChange = {
                        taps.fullScreen += it
                        fullScreen = it
                    },
                    onStageTap = { taps.stage += 1 },
                )
            }
        }
        return taps
    }

    @Test
    fun `the grid shows every tile and no spotlight control`() {
        stage()
        rule.onNodeWithContentDescription("You").assertExists()
        rule.onNodeWithContentDescription("Alice").assertExists()
        rule.onNodeWithContentDescription("Bob").assertExists()
        rule.onNodeWithContentDescription("Back to grid").assertDoesNotExist()
    }

    @Test
    fun `tapping a tile spotlights it with the others, back to grid returns`() {
        stage()
        rule.onNodeWithContentDescription("Bob").performClick()
        rule.onNodeWithContentDescription("Back to grid").assertExists()
        rule.onNodeWithContentDescription("Full screen").assertExists()
        rule.onNodeWithContentDescription("You").assertExists()
        rule.onNodeWithContentDescription("Alice").assertExists()
        rule.onNodeWithContentDescription("Back to grid").performClick()
        rule.onNodeWithContentDescription("Back to grid").assertDoesNotExist()
        rule.onNodeWithContentDescription("Bob").assertExists()
    }

    @Test
    fun `with the chrome hidden a tile tap relights the chrome instead`() {
        val taps = stage(isChromeVisible = false)
        rule.onNodeWithContentDescription("Bob").performClick()
        assertThat(taps.stage).isEqualTo(1)
        rule.onNodeWithContentDescription("Back to grid").assertDoesNotExist()
    }

    @Test
    fun `full screen keeps the spotlighted tile alone, and the grid leaves full screen`() {
        val taps = stage()
        rule.onNodeWithContentDescription("Bob").performClick()
        rule.onNodeWithContentDescription("Full screen").performClick()
        rule.onNodeWithContentDescription("Exit full screen").assertExists()
        rule.onNodeWithContentDescription("Alice").assertDoesNotExist()
        rule.onNodeWithContentDescription("Back to grid").performClick()
        rule.waitForIdle()
        assertThat(taps.fullScreen).containsExactly(true, false).inOrder()
        rule.onNodeWithContentDescription("Alice").assertExists()
    }

    @Test
    fun `a member sharing their screen rises alone to the spotlight, named as a screen`() {
        stage(roster = trio.applying(GroupCallMediaKind.Screen, enabled = true, userId = "bob"))
        rule.onNodeWithContentDescription("Bob's screen").assertExists()
        rule.onNodeWithContentDescription("Back to grid").assertExists()
    }

    @Test
    fun `the member who speaks is said to speak, the others are not`() {
        stage(speaking = setOf("bob"))
        rule.onNodeWithContentDescription("Bob").assert(stateMentions("Speaking", expected = true))
        rule.onNodeWithContentDescription("Alice").assert(stateMentions("Speaking", expected = false))
        rule.onNodeWithContentDescription("You").assert(stateMentions("Speaking", expected = false))
    }

    private fun stateMentions(word: String, expected: Boolean) = SemanticsMatcher("state mentions $word = $expected") { node ->
        (node.config.getOrNull(SemanticsProperties.StateDescription)?.contains(word) == true) == expected
    }
}
