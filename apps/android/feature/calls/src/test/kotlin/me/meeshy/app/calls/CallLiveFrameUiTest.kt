package me.meeshy.app.calls

import androidx.compose.ui.test.assert
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallLiveFrameReply
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallLiveFrameUiTest {
    @get:Rule val rule = createComposeRule()

    @Test
    fun `la carte de proposition dit qui propose quoi et rend le choix a l'utilisateur`() {
        var accepted = 0
        var declined = 0
        rule.setContent {
            MeeshyTheme {
                CallLiveFrameProposalCard(text = "Bob suggests the “Néon” frame", onAccept = { accepted++ }, onDecline = { declined++ })
            }
        }
        rule.onNodeWithText("Bob suggests the “Néon” frame").assertExists()
        rule.onNodeWithText("No thanks").performClick()
        rule.onNodeWithText("Apply").performClick()
        assertThat(declined).isEqualTo(1)
        assertThat(accepted).isEqualTo(1)
    }

    @Test
    fun `la reponse de l'autre est une ligne d'etat, jamais un toast`() {
        rule.setContent { MeeshyTheme { CallLiveFrameNotice("Bob keeps their own view") } }
        rule.onNodeWithText("Bob keeps their own view").assertExists()
        assertThat(CallLiveFrameReply.DECLINED.wire).isEqualTo("declined")
    }

    private fun liveFrames(): Pair<me.meeshy.sdk.socket.CallSocialSignalManager, CallLiveFrameController> {
        val social = io.mockk.mockk<me.meeshy.sdk.socket.CallSocialSignalManager> {
            io.mockk.every { frameSelected } returns kotlinx.coroutines.flow.MutableSharedFlow()
            io.mockk.coEvery { selectCallLiveFrame(any(), any(), any(), any()) } returns Result.success(Unit)
        }
        val session = io.mockk.mockk<me.meeshy.sdk.session.SessionRepository> {
            io.mockk.every { currentUser } returns kotlinx.coroutines.flow.MutableStateFlow<me.meeshy.sdk.model.MeeshyUser?>(null)
        }
        val controller = CallLiveFrameController(social, session)
        controller.onTransition(
            me.meeshy.sdk.model.call.CallState.Idle, me.meeshy.sdk.model.call.CallState.Connected,
            CallSessionInfo("call-1", CallConfig.EMPTY),
        )
        return social to controller
    }

    private fun capture() = CallCaptureController(
        frames = io.mockk.mockk(relaxed = true),
        painter = { _, _, _, _ -> null },
        saver = io.mockk.mockk(relaxed = true),
        recorders = { io.mockk.mockk(relaxed = true) },
        scope = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Unconfined),
        clock = { 0L },
        stamp = { "STAMP" },
    )

    private fun people(controller: CallLiveFrameController) = controller.people("Bob", null)

    private fun scene(controller: CallLiveFrameController) = me.meeshy.sdk.model.call.montage.CallCaptureScene(
        look = me.meeshy.sdk.model.call.montage.CallCaptureLook.Classic(me.meeshy.sdk.model.call.montage.CallMontageStyle.SCREEN),
        subjects = me.meeshy.sdk.model.call.montage.CallCaptureSceneRule.duo(people(controller), true, true, false),
    )

    @androidx.compose.runtime.Composable
    private fun Picker(controller: CallLiveFrameController, capture: CallCaptureController) {
        MeeshyTheme {
            CallMontagePicker(
                live = controller,
                capture = capture,
                scene = scene(controller),
                people = people(controller),
                isLiveOffered = true,
                reduceMotion = true,
                onClose = {},
            )
        }
    }

    private fun carousel() = rule.onNode(androidx.compose.ui.test.hasContentDescription("Call montage"))

    private fun action(label: String): () -> Boolean {
        val node = carousel().fetchSemanticsNode()
        val action = node.config[androidx.compose.ui.semantics.SemanticsActions.CustomActions].first { it.label == label }
        return action.action
    }

    @Test
    fun `le montage ouvre sur l'Ecran des Classiques, et le carrousel choisit le suivant sans toucher l'appel`() {
        val (social, controller) = liveFrames()
        val capture = capture()
        rule.setContent { Picker(controller, capture) }

        rule.onNodeWithText("Classics").assertExists()
        carousel().assert(androidx.compose.ui.test.SemanticsMatcher.expectValue(androidx.compose.ui.semantics.SemanticsProperties.StateDescription, "Screen"))
        rule.runOnIdle { action("Next montage")() }
        rule.waitForIdle()

        assertThat(me.meeshy.sdk.model.call.montage.CallMontagePickRule.choice(capture.pick.value, 2))
            .isEqualTo(me.meeshy.sdk.model.call.montage.CallMontageChoice.Classic(me.meeshy.sdk.model.call.montage.CallMontageStyle.COVER))
        assertThat(controller.state.value.frameId).isNull()
        io.mockk.coVerify(exactly = 0) { social.selectCallLiveFrame(any(), any(), any(), any()) }
        controller.onCleared()
    }

    @Test
    fun `choisir un cadre ne l'impose pas a l'appel, Cadre le garde et le propose a l'autre`() {
        val (social, controller) = liveFrames()
        val capture = capture()
        val mood = me.meeshy.sdk.model.call.montage.CallMontageMoodChip.Mood(me.meeshy.sdk.model.call.frames.CallFrameMood.SIGNATURE)
        rule.setContent { Picker(controller, capture) }
        rule.onNodeWithText("Live frame").assertDoesNotExist()

        capture.show(mood, 2)
        rule.waitForIdle()
        val chosen = (me.meeshy.sdk.model.call.montage.CallMontagePickRule.choice(capture.pick.value, 2) as me.meeshy.sdk.model.call.montage.CallMontageChoice.Frame).id

        assertThat(controller.state.value.frameId).isNull()
        io.mockk.coVerify(exactly = 0) { social.selectCallLiveFrame(any(), any(), any(), any()) }

        rule.onNode(androidx.compose.ui.test.hasContentDescription("Live frame")).performClick()
        rule.waitForIdle()

        assertThat(controller.state.value.frameId).isEqualTo(chosen)
        io.mockk.coVerify { social.selectCallLiveFrame("call-1", chosen, any(), null) }
        controller.onCleared()
    }

    @Test
    fun `Plus d'ambiances ouvre tout le catalogue, et l'element centre se photographie depuis TalkBack`() {
        val (_, controller) = liveFrames()
        val capture = capture()
        rule.setContent { Picker(controller, capture) }

        rule.onNode(androidx.compose.ui.test.hasScrollToNodeAction())
            .performScrollToNode(androidx.compose.ui.test.hasText("More moods"))
        rule.onNodeWithText("More moods").performClick()
        rule.waitForIdle()

        assertThat(capture.pick.value.requestedScope).isEqualTo(me.meeshy.sdk.model.call.frames.CallFrameScope.ALL)
        rule.onNode(androidx.compose.ui.test.hasScrollToNodeAction())
            .performScrollToNode(androidx.compose.ui.test.hasText("Fewer moods"))
        rule.onNodeWithText("Fewer moods").assertExists()
        rule.onNode(androidx.compose.ui.test.hasScrollToNodeAction())
            .performScrollToNode(androidx.compose.ui.test.hasText("Unplugged"))
        rule.onNodeWithText("Unplugged").assertExists()
        assertThat(carousel().fetchSemanticsNode().config[androidx.compose.ui.semantics.SemanticsActions.CustomActions].map { it.label })
            .containsAtLeast("Take a photo", "Record")
        controller.onCleared()
    }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallFrameDeclinationPagerTest {
    @get:Rule val rule = createComposeRule()

    @Test
    fun `la vignette du cadre choisi dit sa declinaison et passe a la suivante sans souris ni glisse`() {
        val base = me.meeshy.sdk.model.call.frames.CallLiveFrameRule.frames().first { it.styles.isNotEmpty() }
        val declinations = me.meeshy.sdk.model.call.frames.CallFrameStyleRule.declinations(base.id)
        var chosen: String? = null
        rule.setContent {
            MeeshyTheme {
                CallFrameDeclinationPager(declinations, selected = base.id, onSelect = { chosen = it }) { androidx.compose.material3.Text(it.id) }
            }
        }
        rule.onNode(androidx.compose.ui.test.SemanticsMatcher.expectValue(androidx.compose.ui.semantics.SemanticsProperties.StateDescription, "Version 1 of ${declinations.size}")).assertExists()
        val node = rule.onNode(androidx.compose.ui.test.SemanticsMatcher.expectValue(androidx.compose.ui.semantics.SemanticsProperties.StateDescription, "Version 1 of ${declinations.size}")).fetchSemanticsNode()
        val next = node.config[androidx.compose.ui.semantics.SemanticsActions.CustomActions].first { it.label == "Next version" }
        rule.runOnIdle { next.action() }
        assertThat(chosen).isEqualTo(declinations[1].id)
    }
}
