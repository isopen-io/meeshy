package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.media.MediaCacheDirs
import me.meeshy.sdk.media.TypedMediaCache
import me.meeshy.sdk.media.UploadedAttachmentIds
import me.meeshy.sdk.playback.ConversationAudioCoordinator
import me.meeshy.sdk.waveform.WaveformRepository
import java.nio.file.Files
import org.junit.After
import org.junit.Before
import org.junit.Test

/** La pastille de retour en bas propose ▶ le dernier vocal non lu (iOS `ConversationScrollControlsView.onPlayAudio`). */
@OptIn(ExperimentalCoroutinesApi::class)
class ScrollPillUnreadAudioTest {

    private val main = UnconfinedTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(main)

    @After fun tearDown() = Dispatchers.resetMain()

    private fun unreadPreview(newest: me.meeshy.ui.component.bubble.BubbleContent): UnreadPreview? {
        val read = voiceMessage("m0", "2026-11-04T07:00:00Z", voice("old"))
        val messages = listOf(read.toAffordanceMessage(), newest.toAffordanceMessage())
        val anchored = ScrollAffordanceState(isAtBottom = false, lastAcknowledgedId = "m0")
        return ScrollAffordance.next(anchored, messages, isNearBottom = false).preview
    }

    @Test
    fun `le dernier message non lu est un vocal, la pastille propose de le jouer`() {
        val preview = unreadPreview(voiceMessage("m1", "2026-11-04T08:00:00Z", voice("a")))!!

        assertThat(preview.audioAttachmentId).isEqualTo("a")
        assertThat(preview.kind).isEqualTo(UnreadPreviewKind.Audio)
    }

    @Test
    fun `un vocal protege par son message ne se joue pas depuis la pastille`() {
        val preview = unreadPreview(voiceMessage("m1", "2026-11-04T08:00:00Z", voice("a"), isViewOnce = true))!!

        assertThat(preview.audioAttachmentId).isNull()
        assertThat(preview.kind).isEqualTo(UnreadPreviewKind.Text)
    }

    @Test
    fun `un vocal dont la piece est protegee ne se joue pas depuis la pastille`() {
        val preview = unreadPreview(voiceMessage("m1", "2026-11-04T08:00:00Z", voice("a", isProtected = true)))!!

        assertThat(preview.audioAttachmentId).isNull()
    }

    @Test
    fun `un vocal sans adresse ne se joue pas depuis la pastille`() {
        val preview = unreadPreview(voiceMessage("m1", "2026-11-04T08:00:00Z", voice("a", url = null)))!!

        assertThat(preview.audioAttachmentId).isNull()
    }

    @Test
    fun `un message sans vocal ne propose rien`() {
        val text = voiceMessage("m1", "2026-11-04T08:00:00Z").copy(text = "salut")

        assertThat(unreadPreview(text)!!.audioAttachmentId).isNull()
    }

    private class Rig {
        val engine = FakeVoiceEngine()
        val coordinator = ConversationAudioCoordinator(engine, UnconfinedTestDispatcher())
        private val root = Files.createTempDirectory("pill-audio").toFile()
        val viewModel = ChatAudioViewModel(
            coordinator,
            mockk<WaveformRepository>(relaxed = true),
            UploadedAttachmentIds(),
            TypedMediaCache(MediaCacheDirs(root, root)),
            UnconfinedTestDispatcher(),
            ChatRestingPositions { null },
        )
    }

    private val m1 = voiceMessage("m1", "2026-11-04T08:00:00Z", voice("a"))
    private val m2 = voiceMessage("m2", "2026-11-04T08:01:00Z", voice("b"))

    @Test
    fun `toucher le play de la pastille demarre la file depuis ce vocal, le retoucher le met en pause`() {
        val rig = Rig()
        rig.viewModel.bind(ChatVoiceThread("conv", "Famille", null, "#6366F1", listOf(m1, m2)))

        rig.viewModel.tapAttachment("a")
        assertThat(rig.engine.played).containsExactly("a")
        assertThat(rig.coordinator.snapshot.value.queue.upcoming.map { it.attachmentId }).containsExactly("b")

        rig.engine.playingAt("a", 1_000)
        rig.viewModel.tapAttachment("a")
        assertThat(rig.engine.toggles).isEqualTo(1)
        assertThat(rig.engine.played).containsExactly("a")
    }

    @Test
    fun `un vocal absent du fil lie ne demarre rien`() {
        val rig = Rig()
        rig.viewModel.bind(ChatVoiceThread("conv", "Famille", null, "#6366F1", listOf(m1)))

        rig.viewModel.tapAttachment("ghost")

        assertThat(rig.engine.played).isEmpty()
    }
}
