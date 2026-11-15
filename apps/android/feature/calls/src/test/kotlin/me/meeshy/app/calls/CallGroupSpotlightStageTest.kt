package me.meeshy.app.calls

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.assertWidthIsEqualTo
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
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
 * vignette la met à la une avec la pellicule des autres, « Revenir à la grille » rend la grille, le plein écran garde
 * les caméras des autres et, pour un écran partagé, un second appui ne garde que le partage (#17961) ; un écran partagé
 * y monte seul, même après un choix manuel (#18180).
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
        capsule: MutableState<Boolean> = mutableStateOf(true),
        rosterState: State<GroupCallRoster>? = null,
    ): Taps {
        rule.setContent {
            var fullScreen by remember { mutableStateOf(false) }
            MeeshyTheme(darkTheme = true) {
                CallGroupStage(
                    state = state,
                    mesh = mesh(rosterState?.value ?: roster, speaking),
                    localTrack = null,
                    primaryTrack = null,
                    eglContext = noEgl,
                    isChromeVisible = isChromeVisible,
                    isCapsuleVisible = capsule.value,
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

    /** #17961 — une caméra à la une n'a qu'UN niveau : son plein écran garde les autres en bandeau. */
    @Test
    fun `a camera in full screen keeps the others in the strip, has one level, and the grid leaves full screen`() {
        val taps = stage()
        rule.onNodeWithContentDescription("Bob").performClick()
        rule.onNodeWithContentDescription("Full screen").performClick()
        rule.mainClock.advanceTimeBy(1_000)
        rule.onNodeWithContentDescription("Exit full screen").assertExists()
        rule.onNodeWithContentDescription("Total full screen").assertDoesNotExist()
        rule.onNodeWithContentDescription("Alice").assertExists()
        rule.onNodeWithContentDescription("Back to grid").performClick()
        rule.waitForIdle()
        assertThat(taps.fullScreen).containsExactly(true, false).inOrder()
        rule.onNodeWithContentDescription("Alice").assertExists()
    }

    /** #17961 (2026-11-14) — second appui : plein écran total ; « Quitter » redescend d'un niveau. */
    @Test
    fun `a shared screen has two full screen levels, raised by a second press and lowered one at a time`() {
        val taps = stage(roster = trio.applying(GroupCallMediaKind.Screen, enabled = true, userId = "bob"))
        rule.onNodeWithContentDescription("Full screen").performClick()
        rule.mainClock.advanceTimeBy(1_000)
        rule.onNodeWithContentDescription("Total full screen").assertExists()
        rule.onNodeWithContentDescription("Exit full screen").assertExists()
        rule.onNodeWithContentDescription("Alice").assertExists()
        rule.onNodeWithContentDescription("Total full screen").performClick()
        rule.mainClock.advanceTimeBy(1_000)
        rule.onNodeWithContentDescription("Exit total full screen").assertExists()
        rule.onNodeWithContentDescription("Total full screen").assertDoesNotExist()
        rule.onNodeWithContentDescription("Alice").assertDoesNotExist()
        rule.onNodeWithContentDescription("Exit total full screen").performClick()
        rule.mainClock.advanceTimeBy(1_000)
        rule.onNodeWithContentDescription("Total full screen").assertExists()
        rule.onNodeWithContentDescription("Alice").assertExists()
        rule.onNodeWithContentDescription("Exit full screen").performClick()
        rule.mainClock.advanceTimeBy(1_000)
        rule.onNodeWithContentDescription("Full screen").assertExists()
        assertThat(taps.fullScreen).containsExactly(true, false).inOrder()
    }

    @Test
    fun `back to grid leaves the total full screen at once`() {
        val taps = stage(roster = trio.applying(GroupCallMediaKind.Screen, enabled = true, userId = "bob"))
        rule.onNodeWithContentDescription("Full screen").performClick()
        rule.onNodeWithContentDescription("Total full screen").performClick()
        rule.mainClock.advanceTimeBy(1_000)
        rule.onNodeWithContentDescription("Back to grid").performClick()
        rule.mainClock.advanceTimeBy(1_000)
        assertThat(taps.fullScreen).containsExactly(true, false).inOrder()
        rule.onNodeWithContentDescription("Exit total full screen").assertDoesNotExist()
        rule.onNodeWithContentDescription("Alice").assertExists()
    }

    /** U1.3 — sur Android, les cibles de la capsule font 48 dp. */
    @Test
    fun `the capsule buttons are 48 dp targets`() {
        stage()
        rule.onNodeWithContentDescription("Bob").performClick()
        rule.onNodeWithContentDescription("Back to grid").assertWidthIsEqualTo(48.dp).assertHeightIsEqualTo(48.dp)
        rule.onNodeWithContentDescription("Full screen").assertWidthIsEqualTo(48.dp).assertHeightIsEqualTo(48.dp)
    }

    /** #18180 — Lina à la une à la main, Karim commence à partager : l'écran de Karim prend la une. */
    @Test
    fun `a share that begins takes the spotlight from a tile chosen by hand`() {
        val roster = mutableStateOf(trio)
        stage(rosterState = roster)
        rule.onNodeWithContentDescription("Alice").performClick()
        rule.onNodeWithContentDescription("Back to grid").assertExists()
        rule.runOnIdle { roster.value = trio.applying(GroupCallMediaKind.Screen, enabled = true, userId = "bob") }
        rule.mainClock.advanceTimeBy(1_000)
        rule.onNodeWithContentDescription("Bob's screen").assertExists()
        rule.onNodeWithContentDescription("Alice").assertExists()
    }

    /** #17961 point 1 — la puce « Écran de X » se range avec la capsule, et revient avec elle. */
    @Test
    fun `the screen chip stows with the capsule and comes back with it`() {
        val capsule = mutableStateOf(true)
        stage(roster = trio.applying(GroupCallMediaKind.Screen, enabled = true, userId = "bob"), capsule = capsule)
        rule.onNodeWithText("Bob's screen", useUnmergedTree = true).assertExists()
        rule.runOnIdle { capsule.value = false }
        rule.mainClock.advanceTimeBy(1_000)
        rule.onNodeWithText("Bob's screen", useUnmergedTree = true).assertDoesNotExist()
        rule.runOnIdle { capsule.value = true }
        rule.mainClock.advanceTimeBy(1_000)
        rule.onNodeWithText("Bob's screen", useUnmergedTree = true).assertExists()
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

    @Test
    fun `the capsule stows with the controls and comes back at the second touch (U1_10)`() {
        val capsule = mutableStateOf(true)
        stage(capsule = capsule)
        rule.onNodeWithContentDescription("Bob").performClick()
        rule.onNodeWithContentDescription("Back to grid").assertExists()
        rule.runOnIdle { capsule.value = false }
        rule.mainClock.advanceTimeBy(1_000)
        rule.onNodeWithContentDescription("Back to grid").assertDoesNotExist()
        rule.onNodeWithContentDescription("Full screen").assertDoesNotExist()
        rule.runOnIdle { capsule.value = true }
        rule.mainClock.advanceTimeBy(1_000)
        rule.onNodeWithContentDescription("Back to grid").assertExists()
    }

    @Test
    fun `the capsule survives the full screen toggle and leaves with the spotlight (U1_12)`() {
        stage()
        rule.onNodeWithContentDescription("Bob").performClick()
        rule.onNodeWithContentDescription("Full screen").performClick()
        rule.mainClock.advanceTimeBy(1_000)
        rule.onNodeWithContentDescription("Exit full screen").assertExists()
        rule.onNodeWithContentDescription("Back to grid").performClick()
        rule.mainClock.advanceTimeBy(1_000)
        rule.onNodeWithContentDescription("Exit full screen").assertDoesNotExist()
        rule.onNodeWithContentDescription("Back to grid").assertDoesNotExist()
    }

    @Test
    fun `a shared screen is announced on a glass chip while its owner's plate keeps the name (U2_5)`() {
        stage(roster = trio.applying(GroupCallMediaKind.Screen, enabled = true, userId = "bob"))
        rule.onNodeWithText("Bob's screen", useUnmergedTree = true).assertExists()
        rule.onNodeWithText("Bob", useUnmergedTree = true).assertExists()
    }

    private fun stateMentions(word: String, expected: Boolean) = SemanticsMatcher("state mentions $word = $expected") { node ->
        (node.config.getOrNull(SemanticsProperties.StateDescription)?.contains(word) == true) == expected
    }
}
