package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MobileTranscriptionPayload
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.sound.ComposerAudioRole
import me.meeshy.sdk.model.speech.OnDeviceTranscription
import me.meeshy.sdk.model.speech.OnDeviceTranscriptionSegment
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.speech.SoundFileTranscriber
import me.meeshy.sdk.speech.SoundTranscriptionOutcome
import me.meeshy.sdk.waveform.WaveformMeasuring
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class StorySoundSheetViewModelTest {
    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After fun tearDown() = Dispatchers.resetMain()

    private val heard = OnDeviceTranscription(
        text = "bom dia",
        language = "pt",
        confidence = 0.9,
        segments = listOf(OnDeviceTranscriptionSegment("bom dia", 0, 1_200, 0.9)),
    )

    private val languagesAsked = mutableListOf<String>()

    private fun transcriber(outcome: SoundTranscriptionOutcome) = mockk<SoundFileTranscriber>().also {
        coEvery { it.transcribe(any(), any()) } answers { languagesAsked += secondArg<String>(); outcome }
    }

    private fun uploader(result: NetworkResult<List<UploadedMedia>>) = mockk<StoryMediaUploader>().also {
        coEvery { it.upload(any(), any()) } returns result
    }

    private val uploaded = UploadedMedia("pm1", "https://cdn/pm1.m4a", "audio/mp4", 10, null, null, 2_500, null)

    private fun session(system: String? = "pt") = mockk<SessionRepository>().also {
        every { it.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = system))
    }

    private fun model(
        outcome: SoundTranscriptionOutcome = SoundTranscriptionOutcome.Heard(heard),
        upload: NetworkResult<List<UploadedMedia>> = NetworkResult.Success(listOf(uploaded)),
    ) = StorySoundSheetViewModel(
        transcriber = transcriber(outcome),
        uploader = uploader(upload),
        waveforms = object : WaveformMeasuring {
            override suspend fun measure(location: me.meeshy.sdk.model.waveform.WaveformLocation, count: Int) = floatArrayOf(0.1f, 0.4f)
        },
        session = session(),
        deviceLanguage = { "en" },
        newTrackId = { "rec-1" },
    )

    private fun take(): Pair<MediaUploadItem, File> {
        val file = Files.createTempFile("take", ".m4a").toFile().apply { writeBytes(byteArrayOf(1, 2, 3)) }
        return MediaUploadItem.onDisk(file, "take.m4a", "audio/mp4", 2_500) to file
    }

    @Test
    fun `the sound starts in the author's language and a take is transcribed on the device in it`() {
        val vm = model()
        assertThat(vm.state.value.language).isEqualTo("pt")
        vm.onTake(take().first, durationSeconds = 2.5f)
        val draft = vm.state.value.take!!
        assertThat(draft.phase).isEqualTo(SoundTakePhase.PREVIEW)
        assertThat(draft.transcription!!.text).isEqualTo("bom dia")
        assertThat(languagesAsked).containsExactly("pt")
    }

    @Test
    fun `choosing another language transcribes the take again in it`() {
        val vm = model()
        vm.onTake(take().first, durationSeconds = 2.5f)
        vm.onLanguage("es")
        assertThat(languagesAsked).containsExactly("pt", "es").inOrder()
        assertThat(vm.state.value.suggestions).contains("es")
    }

    @Test
    fun `a device that cannot transcribe says the server will, never an error`() {
        val vm = model(outcome = SoundTranscriptionOutcome.ServerWillTranscribe)
        vm.onTake(take().first, durationSeconds = 2.5f)
        assertThat(vm.state.value.take!!.notice).isEqualTo(SoundTranscriptionNotice.SERVER)
        assertThat(vm.state.value.take!!.transcription).isNull()
    }

    @Test
    fun `a written transcription is kept when the language changes`() {
        val vm = model(outcome = SoundTranscriptionOutcome.Failed)
        vm.onTake(take().first, durationSeconds = 2.5f)
        assertThat(vm.state.value.take!!.notice).isEqualTo(SoundTranscriptionNotice.FAILED)
        vm.onWriteTranscription("  olá  ")
        vm.onLanguage("es")
        assertThat(vm.state.value.take!!.transcription).isEqualTo(MobileTranscriptionPayload(text = "olá", language = "es", confidence = 1.0))
        assertThat(languagesAsked).containsExactly("pt")
    }

    @Test
    fun `adding uploads the take and hands the composer the sound, its role and its transcription`() {
        val vm = model()
        val (item, file) = take()
        vm.onTake(item, durationSeconds = 2.5f)
        vm.onRole(ComposerAudioRole.FOREGROUND)
        var placed: Pair<ComposedStorySound, ComposerAudioRole>? = null
        vm.onAdd(automatic = ComposerAudioRole.BACKGROUND) { sound, role -> placed = sound to role }
        val (sound, role) = placed!!
        assertThat(role).isEqualTo(ComposerAudioRole.FOREGROUND)
        assertThat(sound.postMediaId).isEqualTo("pm1")
        assertThat(sound.url).isEqualTo("https://cdn/pm1.m4a")
        assertThat(sound.language).isEqualTo("pt")
        assertThat(sound.transcription!!.text).isEqualTo("bom dia")
        assertThat(sound.transcription!!.segments.single().end).isEqualTo(1.2)
        assertThat(sound.waveform).containsExactly(0.25f, 1f).inOrder()
        assertThat(vm.state.value.take).isNull()
        assertThat(file.exists()).isFalse()
    }

    @Test
    fun `without a chosen role the sound takes the automatic one`() {
        val vm = model()
        vm.onTake(take().first, durationSeconds = 2.5f)
        var role: ComposerAudioRole? = null
        vm.onAdd(automatic = ComposerAudioRole.BACKGROUND) { _, r -> role = r }
        assertThat(role).isEqualTo(ComposerAudioRole.BACKGROUND)
    }

    @Test
    fun `a refused upload keeps the take and says it`() {
        val vm = model(upload = NetworkResult.Failure(ApiError(message = "offline", code = "OFFLINE")))
        vm.onTake(take().first, durationSeconds = 2.5f)
        var placed = false
        vm.onAdd(automatic = ComposerAudioRole.BACKGROUND) { _, _ -> placed = true }
        assertThat(placed).isFalse()
        assertThat(vm.state.value.take!!.phase).isEqualTo(SoundTakePhase.PREVIEW)
        assertThat(vm.state.value.failure).isEqualTo(SoundSheetFailure.UPLOAD)
    }

    @Test
    fun `while the sound uploads, writing or changing the language never re-arms Ajouter nor transcribes again`() {
        val pending = kotlinx.coroutines.CompletableDeferred<NetworkResult<List<UploadedMedia>>>()
        val uploader = mockk<StoryMediaUploader>().also { coEvery { it.upload(any(), any()) } coAnswers { pending.await() } }
        val vm = StorySoundSheetViewModel(
            transcriber = transcriber(SoundTranscriptionOutcome.Heard(heard)),
            uploader = uploader,
            waveforms = object : WaveformMeasuring {
                override suspend fun measure(location: me.meeshy.sdk.model.waveform.WaveformLocation, count: Int) = floatArrayOf(0.1f)
            },
            session = session(),
            deviceLanguage = { "en" },
            newTrackId = { "rec-1" },
        )
        vm.onTake(take().first, durationSeconds = 2.5f)
        var placed = 0
        vm.onAdd(automatic = ComposerAudioRole.BACKGROUND) { _, _ -> placed += 1 }
        vm.onWriteTranscription("autre chose")
        vm.onLanguage("es")
        vm.onRetryTranscription()
        assertThat(vm.state.value.take!!.phase).isEqualTo(SoundTakePhase.UPLOADING)
        assertThat(vm.state.value.take!!.transcription!!.text).isEqualTo("bom dia")
        assertThat(languagesAsked).containsExactly("pt")
        assertThat(vm.state.value.language).isEqualTo("pt")
        vm.onAdd(automatic = ComposerAudioRole.BACKGROUND) { _, _ -> placed += 1 }
        pending.complete(NetworkResult.Success(listOf(uploaded)))
        assertThat(placed).isEqualTo(1)
    }

    @Test
    fun `redoing discards the take and its file`() {
        val vm = model()
        val (item, file) = take()
        vm.onTake(item, durationSeconds = 2.5f)
        vm.onRedo()
        assertThat(vm.state.value.take).isNull()
        assertThat(file.exists()).isFalse()
    }
}
