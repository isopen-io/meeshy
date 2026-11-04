package me.meeshy.app.chat

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.media.MediaCacheDirs
import me.meeshy.sdk.media.TypedMediaCache
import me.meeshy.sdk.media.UploadedAttachmentIds
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.mediacache.MediaCacheKey
import me.meeshy.sdk.playback.AudioEngineEvent
import me.meeshy.sdk.playback.ConversationAudioCoordinator
import me.meeshy.sdk.waveform.WaveformLevels
import me.meeshy.sdk.waveform.WaveformRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.io.File
import java.nio.file.Files

/**
 * Le fil joue par le coordinateur PARTAGÉ (#15462) : la bulle active lit son état, une bulle inactive ne reçoit aucune
 * émission quand une autre progresse ; toucher démarre la file, retoucher met en pause ; la forme d'onde est servie
 * une fois, jamais pour un vocal protégé.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ChatAudioBinderTest {

    private val main = UnconfinedTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(main)

    @After fun tearDown() = Dispatchers.resetMain()

    private class Rig(
        val engine: FakeVoiceEngine = FakeVoiceEngine(),
        val waveforms: WaveformRepository = mockk(relaxed = true),
        val cacheRoot: File = Files.createTempDirectory("chat-audio").toFile(),
    ) {
        val dirs = MediaCacheDirs(cacheRoot, cacheRoot)
        val coordinator = ConversationAudioCoordinator(engine, UnconfinedTestDispatcher())
        val viewModel = ChatAudioViewModel(coordinator, waveforms, UploadedAttachmentIds(), TypedMediaCache(dirs), UnconfinedTestDispatcher(), ChatRestingPositions { null })

        /** Le vocal de [url] téléchargé EN ENTIER dans le cache typé : la copie que la bulle a le droit de mesurer. */
        fun wholeCopyOf(url: String): File =
            File(dirs.dirFor(MediaCacheCategory.AUDIO), MediaCacheKey.of(url)).apply {
                parentFile?.mkdirs()
                writeBytes(ByteArray(2_048) { it.toByte() })
            }
    }

    private val m1 = voiceMessage("m1", "2026-11-04T08:00:00Z", voice("a"))
    private val m2 = voiceMessage("m2", "2026-11-04T08:01:00Z", voice("b"), voice("c"))
    private val thread = ChatVoiceThread("conv", "Famille", null, "#6366F1", listOf(m1, m2))

    @Test
    fun `seul le flux de la piece active change, une piece inactive ne recoit aucune emission`() = runTest {
        val rig = Rig()

        rig.viewModel.playbackFor(listOf("b", "c")).test {
            assertThat(awaitItem()).isNull()
            rig.engine.playingAt("a", 1_000)
            rig.engine.playingAt("a", 2_000)
            rig.engine.playingAt("a", 3_000)
            expectNoEvents()
        }
    }

    @Test
    fun `la bulle active suit la progression, l'ecoule sur le total et la vitesse`() = runTest {
        val rig = Rig()

        rig.viewModel.playbackFor(listOf("a")).test {
            assertThat(awaitItem()).isNull()
            rig.engine.playingAt("a", 3_000)
            val live = awaitItem()!!
            assertThat(live.attachmentId).isEqualTo("a")
            assertThat(live.isPlaying).isTrue()
            assertThat(live.progress).isWithin(1e-6f).of(0.25f)
            assertThat(live.currentSeconds).isEqualTo(3.0)
            assertThat(live.timeLabel).isEqualTo("0:03 / 0:12")
            assertThat(live.durationSeconds).isEqualTo(12.0)
        }
    }

    @Test
    fun `dans une pile, la rangee jouee est celle que le moteur tient`() {
        val rig = Rig()
        rig.engine.playingAt("c", 1_000)

        assertThat(rig.viewModel.currentPlayback(listOf("b", "c"))?.attachmentId).isEqualTo("c")
        assertThat(rig.viewModel.currentPlayback(listOf("a"))).isNull()
    }

    @Test
    fun `toucher un vocal demarre la file du coordinateur depuis lui, avec la conversation et son accent`() {
        val rig = Rig()
        rig.viewModel.bind(thread)

        rig.viewModel.tap(m1.audios[0], m1)

        assertThat(rig.engine.played).containsExactly("a")
        val snapshot = rig.coordinator.snapshot.value
        assertThat(snapshot.queue.upcoming.map { it.attachmentId }).containsExactly("b", "c").inOrder()
        assertThat(snapshot.context?.conversationName).isEqualTo("Famille")
        assertThat(snapshot.context?.accentHex).isEqualTo("#6366F1")
    }

    private fun spanishThread() = ChatVoiceThread(
        "conv", "Famille", null, "#6366F1",
        listOf(voiceMessage("m1", "2026-11-04T08:00:00Z", voice("a", url = "https://cdn.meeshy.me/a-es.m4a", audioLanguage = "es"))),
    )

    @Test
    fun `le drapeau change pendant l'ecoute : la voix recharge la piste de la nouvelle langue sous le meme id`() {
        val rig = Rig()
        rig.viewModel.bind(thread)
        rig.viewModel.tap(m1.audios[0], m1)
        rig.engine.playingAt("a", 3_000)

        rig.viewModel.bind(spanishThread())

        assertThat(rig.engine.played).containsExactly("a", "a").inOrder()
        val current = rig.coordinator.snapshot.value.queue.current
        assertThat(current?.fileUrl).isEqualTo("https://cdn.meeshy.me/a-es.m4a")
        assertThat(current?.trackLanguage).isEqualTo("es")
    }

    @Test
    fun `un fil relu sans changement de langue ne recharge rien`() {
        val rig = Rig()
        rig.viewModel.bind(thread)
        rig.viewModel.tap(m1.audios[0], m1)
        rig.engine.playingAt("a", 3_000)

        rig.viewModel.bind(thread)

        assertThat(rig.engine.played).containsExactly("a")
    }

    @Test
    fun `le drapeau change vocal en pause : le toucher suivant joue la bonne piste au lieu de reprendre l'ancienne`() {
        val rig = Rig()
        rig.viewModel.bind(thread)
        rig.viewModel.tap(m1.audios[0], m1)
        val spanish = spanishThread()
        rig.viewModel.bind(spanish)

        rig.viewModel.tap(spanish.messages[0].audios[0], spanish.messages[0])

        assertThat(rig.engine.toggles).isEqualTo(0)
        assertThat(rig.engine.played).containsExactly("a", "a").inOrder()
    }

    @Test
    fun `retoucher le vocal en cours le met en pause sans relancer la file`() {
        val rig = Rig()
        rig.viewModel.bind(thread)
        rig.viewModel.tap(m1.audios[0], m1)

        rig.viewModel.tap(m1.audios[0], m1)

        assertThat(rig.engine.toggles).isEqualTo(1)
        assertThat(rig.engine.played).containsExactly("a")
    }

    @Test
    fun `toucher un second vocal arrete le premier et joue le second`() {
        val rig = Rig()
        rig.viewModel.bind(thread)
        rig.viewModel.tap(m1.audios[0], m1)

        rig.viewModel.tap(m2.audios[1], m2)

        assertThat(rig.engine.played).containsExactly("a", "c").inOrder()
        assertThat(rig.coordinator.snapshot.value.queue.current?.attachmentId).isEqualTo("c")
    }

    @Test
    fun `un vocal ecoute jusqu'au bout ne revient pas dans la file suivante`() {
        val rig = Rig()
        rig.viewModel.bind(thread)
        rig.viewModel.tap(m2.audios[0], m2)
        rig.engine.mutableEvents.tryEmit(AudioEngineEvent.Finished("b", completed = true))

        rig.viewModel.tap(m1.audios[0], m1)

        assertThat(rig.coordinator.snapshot.value.queue.upcoming.map { it.attachmentId }).containsExactly("c")
    }

    @Test
    fun `un vocal sans adresse ne joue rien`() {
        val rig = Rig()
        val silent = voiceMessage("m0", "2026-11-04T07:00:00Z", voice("z", url = null))

        rig.viewModel.tap(silent.audios[0], silent)

        assertThat(rig.engine.played).isEmpty()
    }

    @Test
    fun `un vocal envoye mais pas encore parti joue depuis son fichier local`() {
        val rig = Rig()
        val pending = voiceMessage("m9", "2026-11-04T09:00:00Z", voice("p", url = "file:///data/voice/p.m4a"), isOutgoing = true)

        rig.viewModel.tap(pending.audios[0], pending)

        assertThat(rig.engine.locals).containsExactly("file:///data/voice/p.m4a")
    }

    @Test
    fun `glisser ou toucher un mot ne deplace que le vocal en cours`() {
        val rig = Rig()
        rig.viewModel.bind(thread)
        rig.viewModel.tap(m1.audios[0], m1)

        rig.viewModel.seekFraction(m2.audios[0], 0.5)
        rig.viewModel.seekSeconds(m2.audios[0], 4.0)
        rig.viewModel.seekFraction(m1.audios[0], 0.4)
        rig.viewModel.seekSeconds(m1.audios[0], 2.5)

        assertThat(rig.engine.fractions).containsExactly(0.4)
        assertThat(rig.engine.seeks).containsExactly(2_500L)
    }

    @Test
    fun `la forme d'onde d'un vocal ordinaire est mesuree une fois sur sa copie entiere, et memorisee`() = runTest {
        val waveforms = mockk<WaveformRepository>()
        coEvery { waveforms.bubbleLevels(any(), any(), any()) } returns WaveformLevels(listOf(0.2f, 1f), WaveformLevels.Origin.DECODED)
        val rig = Rig(waveforms = waveforms)
        val whole = rig.wholeCopyOf(voice("a").url!!)

        val first = rig.viewModel.samples(voice("a"))
        val samples = first.first { it.isNotEmpty() }

        assertThat(samples).containsExactly(0.2f, 1f).inOrder()
        assertThat(rig.viewModel.samples(voice("a"))).isSameInstanceAs(first)
        coVerify(exactly = 1) { waveforms.bubbleLevels(whole.absolutePath, any(), any()) }
    }

    @Test
    fun `un vocal distant sans copie entiere sur l'appareil ne fait jamais mesurer son onde`() = runTest {
        val waveforms = mockk<WaveformRepository>(relaxed = true)
        val rig = Rig(waveforms = waveforms)

        assertThat(rig.viewModel.samples(voice("a")).first()).isEmpty()
        coVerify(exactly = 0) { waveforms.bubbleLevels(any(), any(), any()) }
    }

    @Test
    fun `aucune adresse distante n'atteint jamais la mesure, copie entiere ou non`() = runTest {
        val waveforms = mockk<WaveformRepository>()
        coEvery { waveforms.bubbleLevels(any(), any(), any()) } returns WaveformLevels(listOf(0.5f), WaveformLevels.Origin.DECODED)
        val rig = Rig(waveforms = waveforms)
        rig.wholeCopyOf(voice("a").url!!)

        rig.viewModel.samples(voice("a")).first { it.isNotEmpty() }
        rig.viewModel.samples(voice("b")).first()

        coVerify(exactly = 0) { waveforms.bubbleLevels(match { it.startsWith("https:") || it.startsWith("http:") }, any(), any()) }
    }

    @Test
    fun `aucune forme d'onde n'est calculee pour un vocal protege`() = runTest {
        val waveforms = mockk<WaveformRepository>(relaxed = true)
        val rig = Rig(waveforms = waveforms)
        rig.wholeCopyOf(voice("a").url!!)

        assertThat(rig.viewModel.samples(voice("a", isProtected = true)).first()).isEmpty()
        coVerify(exactly = 0) { waveforms.bubbleLevels(any(), any(), any()) }
    }

    @Test
    fun `quitter le fil laisse jouer le vocal, la file et le contexte du mini-lecteur`() {
        val rig = Rig()
        val store = ViewModelStore()
        val owned = ViewModelProvider(
            store,
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T = rig.viewModel as T
            },
        )[ChatAudioViewModel::class.java]
        owned.bind(thread)
        owned.tap(m1.audios[0], m1)

        store.clear()

        assertThat(rig.engine.mutable.value.attachmentId).isEqualTo("a")
        assertThat(rig.coordinator.snapshot.value.context?.conversationName).isEqualTo("Famille")
        assertThat(rig.coordinator.snapshot.value.queue.upcoming.map { it.attachmentId }).containsExactly("b", "c").inOrder()
    }
}
