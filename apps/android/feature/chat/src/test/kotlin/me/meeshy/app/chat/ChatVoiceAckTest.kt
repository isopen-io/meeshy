package me.meeshy.app.chat

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.media.UploadedAttachmentIds
import me.meeshy.sdk.playback.ConversationAudioCoordinator
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * #15969, réhébergé sur le moteur partagé (ex `ChatAudioPlayerAckTest`, lecteur d'écran retiré) : un vocal écouté PENDANT
 * l'accusé de son envoi continue — la bulle le nomme par son id serveur, le toucher le met en pause au lieu de le relancer,
 * et le moteur reçoit l'adresse servie pour reprendre au même point si la copie locale disparaît (prouvé par
 * `Media3AudioPlaybackEngineTest`). Un autre vocal n'est jamais pris pour lui.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ChatVoiceAckTest {

    private val main = UnconfinedTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(main)

    @After fun tearDown() = Dispatchers.resetMain()

    private val pending = voice("cmid_voice", url = "file:///data/cache/pending-previews/cmid_voice.voice.m4a", seconds = 14)
    private val acked = voice("att_server", url = "https://gate.meeshy.me/api/v1/static/voice.m4a", seconds = 14)
    private val other = voice("att_other", url = "https://gate.meeshy.me/api/v1/static/other.m4a", seconds = 3)
    private val pendingMessage = voiceMessage("cmid_message", "2026-11-04T08:00:00Z", pending, isOutgoing = true)
    private val ackedMessage = voiceMessage("m_server", "2026-11-04T08:00:00Z", acked, isOutgoing = true)
    private val otherMessage = voiceMessage("m_other", "2026-11-04T08:01:00Z", other)

    private class Rig {
        val engine = FakeVoiceEngine()
        val uploads = UploadedAttachmentIds()
        val coordinator = ConversationAudioCoordinator(engine, UnconfinedTestDispatcher())
        val viewModel = ChatAudioViewModel(coordinator, mockk(relaxed = true), uploads, mockk(relaxed = true), UnconfinedTestDispatcher(), ChatRestingPositions { null })
    }

    /** Le vocal en attente joue depuis son fichier, à 5 s ; puis son envoi est accusé sous `att_server`. */
    private fun listeningThenAcknowledged(): Rig = Rig().apply {
        viewModel.bind(ChatVoiceThread("conv", "Famille", null, "#6366F1", listOf(pendingMessage)))
        viewModel.tap(pending, pendingMessage)
        engine.playingAt("cmid_voice", positionMs = 5_000, durationMs = 14_000)
        uploads.record("cmid_voice", "att_server")
    }

    @Test
    fun `la bulle accusee montre le vocal toujours en lecture, la ou il en etait`() {
        val rig = listeningThenAcknowledged()

        val shown = rig.viewModel.currentPlayback(listOf("att_server"))

        assertThat(shown).isNotNull()
        assertThat(shown!!.attachmentId).isEqualTo("att_server")
        assertThat(shown.isPlaying).isTrue()
        assertThat(shown.currentSeconds).isEqualTo(5.0)
        assertThat(rig.engine.locals).containsExactly(pending.url)
    }

    @Test
    fun `le flux de la bulle accusee suit le vocal qui joue encore sous son ancien nom`() = runTest {
        val rig = listeningThenAcknowledged()

        rig.viewModel.playbackFor(listOf("att_server")).test {
            assertThat(awaitItem()?.currentSeconds).isEqualTo(5.0)
            rig.engine.playingAt("cmid_voice", positionMs = 6_000, durationMs = 14_000)
            assertThat(awaitItem()?.currentSeconds).isEqualTo(6.0)
        }
    }

    @Test
    fun `toucher la bulle accusee met le vocal en pause au lieu de le relancer`() {
        val rig = listeningThenAcknowledged()

        rig.viewModel.tap(acked, ackedMessage)

        assertThat(rig.engine.toggles).isEqualTo(1)
        assertThat(rig.engine.played).containsExactly("cmid_voice")
        assertThat(rig.engine.follows.single()).containsExactly("cmid_voice", "att_server", acked.url, false).inOrder()
    }

    @Test
    fun `le fil accuse remet l'adresse servie au moteur, et la file prend l'id serveur`() {
        val rig = listeningThenAcknowledged()

        rig.viewModel.bind(ChatVoiceThread("conv", "Famille", null, "#6366F1", listOf(ackedMessage)))

        assertThat(rig.engine.follows.single()).containsExactly("cmid_voice", "att_server", acked.url, false).inOrder()
        assertThat(rig.coordinator.snapshot.value.queue.current?.attachmentId).isEqualTo("att_server")
        assertThat(rig.coordinator.snapshot.value.queue.current?.fileUrl).isEqualTo(acked.url)
        assertThat(rig.coordinator.snapshot.value.queue.current?.messageId).isEqualTo("m_server")
    }

    @Test
    fun `un autre vocal n'est jamais pris pour le vocal accuse`() {
        val rig = listeningThenAcknowledged()

        assertThat(rig.viewModel.currentPlayback(listOf("att_other"))).isNull()
        rig.viewModel.bind(ChatVoiceThread("conv", "Famille", null, "#6366F1", listOf(otherMessage)))
        rig.viewModel.tap(other, otherMessage)

        assertThat(rig.engine.follows).isEmpty()
        assertThat(rig.engine.played.last()).isEqualTo("att_other")
    }
}
