package me.meeshy.app.chat.audio

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import me.meeshy.app.chat.ChatAudioViewModel
import me.meeshy.app.chat.ChatRestingPositions
import me.meeshy.app.chat.ChatVoiceThread
import me.meeshy.app.chat.FakeVoiceEngine
import me.meeshy.app.chat.voice
import me.meeshy.app.chat.voiceMessage
import me.meeshy.sdk.media.MediaCacheDirs
import me.meeshy.sdk.media.TypedMediaCache
import me.meeshy.sdk.media.UploadedAttachmentIds
import me.meeshy.sdk.playback.ConversationAudioCoordinator
import me.meeshy.sdk.waveform.WaveformRepository
import java.nio.file.Files
import org.junit.After
import org.junit.Before
import org.junit.Test

/** Un vocal cité joue seul, sans file : sa bulle quand elle est dans la fenêtre, la pièce de la citation sinon (iOS `+QuotedAudio`). */
@OptIn(ExperimentalCoroutinesApi::class)
class QuotedAudioPlaybackTest {

    private val main = UnconfinedTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(main)

    @After fun tearDown() = Dispatchers.resetMain()

    private val original = voiceMessage("q1", "2026-11-04T08:00:00Z", voice("v1", url = "https://cdn.meeshy.me/v1-fr.m4a", audioLanguage = "fr"))
    private val next = voiceMessage("m2", "2026-11-04T08:01:00Z", voice("n1"))
    private val reply = voiceMessage("m3", "2026-11-04T08:02:00Z").copy(replyToId = "q1", replyToSenderName = "Nour")
    private val quotedFromCitation = voice("v1", url = "https://cdn.meeshy.me/v1.m4a")

    @Test
    fun `dans la fenetre, la citation joue la bulle citee avec sa piste servie`() {
        val voice = QuotedAudioPlayback.resolve(quotedFromCitation, "q1", "Nour", listOf(original, next, reply))!!

        assertThat(voice.audio.url).isEqualTo("https://cdn.meeshy.me/v1-fr.m4a")
        assertThat(voice.messageId).isEqualTo("q1")
        assertThat(voice.sentAtEpochMs).isGreaterThan(0L)
    }

    @Test
    fun `hors de la fenetre, la citation joue la piece qu'elle porte`() {
        val voice = QuotedAudioPlayback.resolve(quotedFromCitation, "q1", "Nour", listOf(next, reply))!!

        assertThat(voice.audio.url).isEqualTo("https://cdn.meeshy.me/v1.m4a")
        assertThat(voice.senderName).isEqualTo("Nour")
    }

    @Test
    fun `un cite protege dans la fenetre ne joue pas`() {
        val sealed = voiceMessage("q1", "2026-11-04T08:00:00Z", voice("v1"), isViewOnce = true)

        assertThat(QuotedAudioPlayback.resolve(quotedFromCitation, "q1", "Nour", listOf(sealed, reply))).isNull()
    }

    @Test
    fun `une piece protegee ou supprimee dans la fenetre ne joue pas`() {
        val protectedPiece = voiceMessage("q1", "2026-11-04T08:00:00Z", voice("v1", isProtected = true))
        val deleted = original.copy(isDeleted = true)

        assertThat(QuotedAudioPlayback.resolve(quotedFromCitation, "q1", "Nour", listOf(protectedPiece))).isNull()
        assertThat(QuotedAudioPlayback.resolve(quotedFromCitation, "q1", "Nour", listOf(deleted))).isNull()
    }

    @Test
    fun `une citation sans message identifie ou sans adresse ne joue pas`() {
        assertThat(QuotedAudioPlayback.resolve(quotedFromCitation, null, "Nour", emptyList())).isNull()
        assertThat(QuotedAudioPlayback.resolve(voice("v1", url = null), "q1", "Nour", emptyList())).isNull()
    }

    private class Rig {
        val engine = FakeVoiceEngine()
        val coordinator = ConversationAudioCoordinator(engine, UnconfinedTestDispatcher())
        private val root = Files.createTempDirectory("quoted-audio").toFile()
        val viewModel = ChatAudioViewModel(
            coordinator,
            mockk<WaveformRepository>(relaxed = true),
            UploadedAttachmentIds(),
            TypedMediaCache(MediaCacheDirs(root, root)),
            UnconfinedTestDispatcher(),
            ChatRestingPositions { null },
        )
    }

    @Test
    fun `toucher la citation joue le vocal seul, le retoucher le met en pause`() {
        val rig = Rig()
        rig.viewModel.bind(ChatVoiceThread("conv", "Famille", null, "#6366F1", listOf(original, next, reply)))

        rig.viewModel.playQuoted(quotedFromCitation, reply)
        assertThat(rig.engine.played).containsExactly("v1")
        assertThat(rig.coordinator.snapshot.value.queue.upcoming).isEmpty()

        rig.engine.playingAt("v1", 1_000)
        rig.viewModel.playQuoted(quotedFromCitation, reply)
        assertThat(rig.engine.toggles).isEqualTo(1)
        assertThat(rig.engine.played).containsExactly("v1")
    }

    @Test
    fun `un cite protege ne demarre rien`() {
        val rig = Rig()
        val sealed = voiceMessage("q1", "2026-11-04T08:00:00Z", voice("v1"), isViewOnce = true)
        rig.viewModel.bind(ChatVoiceThread("conv", "Famille", null, "#6366F1", listOf(sealed, reply)))

        rig.viewModel.playQuoted(quotedFromCitation, reply)

        assertThat(rig.engine.played).isEmpty()
    }
}
