package me.meeshy.app.calls

import android.graphics.Bitmap
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.effects.CallEffectKind
import me.meeshy.sdk.model.call.effects.CallEffectLayer
import me.meeshy.sdk.model.call.effects.CallEffectLayers
import me.meeshy.sdk.model.call.effects.CallEffectsCategory
import me.meeshy.sdk.model.call.frames.CallFrameMood
import me.meeshy.sdk.model.call.montage.CallCaptureLook
import me.meeshy.sdk.model.call.montage.CallCaptureScene
import me.meeshy.sdk.model.call.montage.CallCaptureSceneRule
import me.meeshy.sdk.model.call.montage.CallMontageChoice
import me.meeshy.sdk.model.call.montage.CallMontageMoodChip
import me.meeshy.sdk.model.call.montage.CallMontagePickRule
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.CallSocialSignalManager
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #17902 · #16979 — la barre du Montage est celle d'Effets : `‹ · Réglages · (+)` sous les puces de tri dont « Cadres » est
 * pressée, ni « Quitter » ni « Valider ». (+) ouvre Effets sur un genre absent de la pile, trois couches au plus ; son appui
 * long liste les effets appliqués pour en annuler un, et annuler referme la liste. Retirer la couche « cadre » retire aussi
 * le cadre gardé en direct, par le chemin de « Cadre ».
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallMontageEffectsBarTest {
    @get:Rule val rule = createComposeRule()

    private val frameLayer = CallEffectLayer(CallEffectKind.Frame, "frame-1")
    private val colorLayer = CallEffectLayer(CallEffectKind.Color, "golden")
    private val faceLayer = CallEffectLayer(CallEffectKind.Face, "toad")
    private val signature = CallMontageMoodChip.Mood(CallFrameMood.SIGNATURE)

    private class NoImages : CallCaptureFrameSource {
        override fun attach(id: String, track: org.webrtc.VideoTrack?) = Unit
        override fun detachAll() = Unit
        override suspend fun snapshot(subjects: List<me.meeshy.sdk.model.call.montage.CallCaptureSubject>, maxDimension: Int?): Map<String, Bitmap> = emptyMap()
    }

    private fun social(): CallSocialSignalManager = mockk {
        every { frameSelected } returns MutableSharedFlow()
        coEvery { selectCallLiveFrame(any(), any(), any(), any()) } returns Result.success(Unit)
    }

    private fun live(social: CallSocialSignalManager = social()): CallLiveFrameController {
        val session = mockk<SessionRepository> { every { currentUser } returns MutableStateFlow<MeeshyUser?>(null) }
        return CallLiveFrameController(social, session).also {
            it.onTransition(CallState.Idle, CallState.Connected, CallSessionInfo("call-1", CallConfig.EMPTY))
        }
    }

    private fun capture() = CallCaptureController(
        frames = NoImages(),
        painter = { _, _, _, _ -> null },
        saver = mockk(relaxed = true),
        recorders = { mockk(relaxed = true) },
        scope = CoroutineScope(Dispatchers.Unconfined),
        clock = { 0L },
        stamp = { "STAMP" },
    )

    private class Outcome {
        val opened = mutableListOf<CallEffectsCategory>()
        val removed = mutableListOf<CallEffectKind>()
        var closed = 0
        var layers by mutableStateOf(CallEffectLayers.EMPTY)
    }

    private fun show(
        outcome: Outcome,
        controller: CallLiveFrameController = live(),
        capture: CallCaptureController = capture(),
        effectsOffered: Boolean = true,
    ) {
        val people = controller.people("Bob", null)
        val scene = CallCaptureScene(CallCaptureLook.Classic(CallMontageStyle.SCREEN), CallCaptureSceneRule.duo(people, true, true, false))
        rule.setContent {
            MeeshyTheme {
                CallMontagePicker(
                    live = controller,
                    capture = capture,
                    scene = scene,
                    people = people,
                    isLiveOffered = true,
                    reduceMotion = true,
                    onClose = { outcome.closed++ },
                    layers = outcome.layers,
                    effectsOffered = effectsOffered,
                    onRemoveEffect = { kind ->
                        outcome.removed += kind
                        outcome.layers = outcome.layers.removing(kind)
                    },
                    onOpenEffects = { outcome.opened += it },
                )
            }
        }
    }

    private fun stack(vararg layer: CallEffectLayer) = CallEffectLayers.of(layer.toList())

    @Test
    fun `la barre est celle d'Effets, ni Quitter ni Valider`() {
        show(Outcome())

        rule.onNodeWithContentDescription("Back to the call").assertExists()
        rule.onNodeWithContentDescription("Settings").assertExists()
        rule.onNodeWithContentDescription("Add another look").assertExists()
        rule.onNodeWithContentDescription("Exit").assertDoesNotExist()
        rule.onNodeWithContentDescription("Quit").assertDoesNotExist()
        rule.onNodeWithContentDescription("Apply").assertDoesNotExist()
        rule.onNodeWithText("Apply").assertDoesNotExist()
    }

    @Test
    fun `sous la barre les puces de tri, Cadres est pressee, et toucher Retour rend l'appel`() {
        val outcome = Outcome()
        show(outcome)

        rule.onNodeWithText("Frames").assert(SemanticsMatcher.expectValue(SemanticsProperties.Selected, true))
        rule.onNodeWithText("Colour").assert(SemanticsMatcher.expectValue(SemanticsProperties.Selected, false))
        rule.onNodeWithContentDescription("Back to the call").performClick()
        assertThat(outcome.closed).isEqualTo(1)
    }

    @Test
    fun `la rangee de genres est celle d'Effets, Visage puis Couleur puis Cadres (#16979, comme iOS)`() {
        show(Outcome())

        val lefts = listOf("Face", "Colour", "Frames").map { rule.onNodeWithText(it).fetchSemanticsNode().positionInRoot.x }
        assertThat(lefts).isInStrictOrder()
    }

    @Test
    fun `(+) avec Visage et Couleur poses ouvre encore Effets, sur Visage`() {
        val outcome = Outcome().apply { layers = stack(colorLayer, faceLayer) }
        show(outcome)

        rule.onNodeWithContentDescription("Add another look").performClick()

        assertThat(outcome.opened).containsExactly(CallEffectsCategory.Face)
    }

    @Test
    fun `une puce d'un autre genre ouvre Effets sur ce genre, celle de Cadres ne fait rien`() {
        val outcome = Outcome()
        show(outcome)

        rule.onNodeWithText("Frames").performClick()
        rule.onNodeWithText("Colour").performClick()
        rule.onNodeWithText("Face").performClick()

        assertThat(outcome.opened).containsExactly(CallEffectsCategory.Color, CallEffectsCategory.Face).inOrder()
    }

    @Test
    fun `sans mode Effets offert le Montage ne montre que Cadres et (+) se lit indisponible`() {
        val outcome = Outcome()
        show(outcome, effectsOffered = false)

        rule.onNodeWithText("Colour").assertDoesNotExist()
        rule.onNodeWithContentDescription("Add another look").performClick()
        assertThat(outcome.opened).isEmpty()
    }

    @Test
    fun `(+) ouvre Visage d'abord, puis Filtres quand Visage est deja pose`() {
        val outcome = Outcome()
        show(outcome)

        rule.onNodeWithContentDescription("Add another look").performClick()
        assertThat(outcome.opened).containsExactly(CallEffectsCategory.Face)

        outcome.layers  = stack(frameLayer, faceLayer)
        rule.waitForIdle()
        rule.onNodeWithContentDescription("Add another look").performClick()
        assertThat(outcome.opened).containsExactly(CallEffectsCategory.Face, CallEffectsCategory.Color).inOrder()
    }

    @Test
    fun `avec trois couches (+) n'ouvre rien et le dit, son appui long garde la liste`() {
        val outcome = Outcome().apply { layers  = stack(frameLayer, colorLayer, faceLayer) }
        show(outcome)

        rule.onNodeWithContentDescription("Add another look").assertDoesNotExist()
        rule.onNodeWithContentDescription("Three effects at most").performClick()
        assertThat(outcome.opened).isEmpty()
        rule.onNodeWithContentDescription("Three effects at most").performTouchInput { longClick() }
        rule.waitForIdle()

        rule.onNodeWithText("Applied effects").assertExists()
    }

    @Test
    fun `l'appui long liste les effets appliques, annuler en retire un, referme la liste et rend le menu de base`() {
        val outcome = Outcome().apply { layers  = stack(colorLayer, faceLayer) }
        show(outcome)

        rule.onNodeWithContentDescription("Add another look").performTouchInput { longClick() }
        rule.waitForIdle()
        rule.onNodeWithText("Applied effects").assertExists()
        rule.onNodeWithText("Classics").assertDoesNotExist()
        rule.onNodeWithContentDescription("Cancel Colour · Golden").performClick()
        rule.waitForIdle()

        assertThat(outcome.removed).containsExactly(CallEffectKind.Color)
        rule.onNodeWithText("Applied effects").assertDoesNotExist()
        rule.onNodeWithText("Classics").assertExists()
        rule.onNodeWithContentDescription("Settings").assert(SemanticsMatcher.expectValue(SemanticsProperties.ToggleableState, androidx.compose.ui.state.ToggleableState.Off))
    }

    @Test
    fun `annuler la derniere couche referme la liste sans qu'elle reste ouverte pour la suivante`() {
        val outcome = Outcome().apply { layers  = stack(faceLayer) }
        show(outcome)

        rule.onNodeWithContentDescription("Add another look").performTouchInput { longClick() }
        rule.waitForIdle()
        rule.onNodeWithContentDescription("Cancel Face · Toad").performClick()
        rule.waitForIdle()
        outcome.layers  = stack(colorLayer)
        rule.waitForIdle()

        rule.onNodeWithText("Applied effects").assertDoesNotExist()
        rule.onNodeWithText("Classics").assertExists()
    }

    @Test
    fun `un cadre refuse par la pile pleine n'est pas choisi, un classique l'est`() {
        val capture = capture()
        val outcome = Outcome().apply { layers  = stack(colorLayer, faceLayer, CallEffectLayer(CallEffectKind.Landscape, "beach")) }
        show(outcome, capture = capture)

        rule.onNodeWithText("Signature").performClick()
        rule.waitForIdle()

        assertThat(capture.pick.value.frameId).isNull()
    }

    @Test
    fun `un cadre se choisit tant qu'il reste de la place`() {
        val capture = capture()
        show(Outcome(), capture = capture)

        rule.onNodeWithText("Signature").performClick()
        rule.waitForIdle()

        assertThat(capture.pick.value.frameId).isNotNull()
    }

    @Test
    fun `retirer la couche cadre rend le classique par defaut et laisse le direct quand le cadre n'est pas garde`() {
        val social = social()
        val controller = live(social)
        val capture = capture().also { it.show(signature, 2) }
        val chosen = CallFrameLayer.chosen(capture.pick.value, 2)
        val outcome = Outcome().apply { layers  = stack(CallEffectLayer(CallEffectKind.Frame, chosen!!)) }
        show(outcome, controller, capture)

        rule.onNodeWithContentDescription("Add another look").performTouchInput { longClick() }
        rule.waitForIdle()
        rule.onNode(hasContentDescription("Cancel Frame · ", substring = true)).performClick()
        rule.waitForIdle()

        assertThat(CallMontagePickRule.choice(capture.pick.value, 2)).isEqualTo(CallMontageChoice.Classic(CallCaptureSceneRule.DEFAULT_STYLE))
        coVerify(exactly = 0) { social.selectCallLiveFrame(any(), any(), any(), any()) }
    }

    @Test
    fun `retirer la couche cadre retire aussi le cadre garde en direct, par le chemin de Cadre`() {
        val social = social()
        val controller = live(social)
        val capture = capture().also { it.show(signature, 2) }
        val chosen = CallFrameLayer.chosen(capture.pick.value, 2)!!
        controller.apply(chosen)

        CallFrameLayer.remove(capture, controller, held = controller.state.value.frameId, chosen = chosen)

        assertThat(controller.state.value.frameId).isNull()
        assertThat(CallFrameLayer.chosen(capture.pick.value, 2)).isNull()
        coVerify { social.selectCallLiveFrame("call-1", null, any(), any()) }
    }

    @Test
    fun `un cadre garde n'est pas le cadre retire quand ce sont deux cadres differents`() {
        val social = social()
        val controller = live(social)
        val capture = capture().also { it.show(signature, 2) }
        val chosen = CallFrameLayer.chosen(capture.pick.value, 2)!!

        CallFrameLayer.remove(capture, controller, held = "another-frame", chosen = chosen)

        coVerify(exactly = 0) { social.selectCallLiveFrame(any(), any(), any(), any()) }
        assertThat(CallFrameLayer.chosen(capture.pick.value, 2)).isNull()
    }
}
