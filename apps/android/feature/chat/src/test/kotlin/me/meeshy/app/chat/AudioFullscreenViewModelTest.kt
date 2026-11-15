package me.meeshy.app.chat

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import java.io.File
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.attachment.TranscriptionRequestTracker
import me.meeshy.sdk.media.TypedMediaCache
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessageTranscriptionFiche.Request
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.sdk.model.speech.OnDeviceTranscription
import me.meeshy.sdk.model.speech.OnDeviceTranscriptionSegment
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.speech.SoundFileTranscriber
import me.meeshy.sdk.speech.SoundTranscriptionOutcome
import me.meeshy.ui.component.audio.AudioFullscreenSource
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * La transcription d'un vocal en plein écran : sur l'appareil quand une copie entière est en cache, sinon (ou si l'appareil ne
 * sait pas) par le serveur — l'utilisateur ne touche qu'une capsule. Le résultat local reste en mémoire ; celui du serveur
 * arrive par Room et se lit sur la source, jamais ici.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AudioFullscreenViewModelTest {

    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After fun tearDown() = Dispatchers.resetMain()

    private val url = "https://cdn.meeshy.me/a.m4a"

    private fun source(
        language: String? = "fr",
        conversationId: String = "conv",
        carrierId: String = "m1",
    ) = AudioFullscreenSource(
        attachmentId = "a",
        url = url,
        durationMs = 4_000,
        author = ProfileSheetUser(username = "nour"),
        createdAtEpochMs = 1L,
        carrierId = carrierId,
        conversationId = conversationId,
        contextName = "Famille",
        originalLanguage = language,
        trackLanguage = language,
    )

    private class Rig(copy: File? = File("/cache/a.m4a")) {
        val serverState = MutableStateFlow(Request.IDLE)
        val tracker = mockk<TranscriptionRequestTracker> {
            every { observe(any(), any()) } returns serverState
            coEvery { request(any(), any()) } returns Unit
        }
        val transcriber = mockk<SoundFileTranscriber>()
        val cache = mockk<TypedMediaCache> {
            every { file(MediaCacheCategory.AUDIO, any()) } returns copy
        }
        val user = MutableStateFlow<MeeshyUser?>(null)
        val session = mockk<SessionRepository> { every { currentUser } returns user }
        val viewModel = AudioFullscreenViewModel(tracker, transcriber, cache, session, UnconfinedTestDispatcher())
    }

    private fun heard(text: String = "bonjour tout le monde") = SoundTranscriptionOutcome.Heard(
        OnDeviceTranscription(
            text = text,
            language = "fr",
            confidence = 0.9,
            segments = listOf(OnDeviceTranscriptionSegment(text, startMs = 0, durationMs = 2_000, confidence = 0.9)),
        ),
    )

    @Test
    fun `au repos la page est vide et rien n est demande`() = runTest {
        val rig = Rig()

        rig.viewModel.transcript(source()).test {
            val state = expectMostRecentItem()
            assertThat(state.request).isEqualTo(Request.IDLE)
            assertThat(state.localSegments).isEmpty()
        }
        coVerify(exactly = 0) { rig.tracker.request(any(), any()) }
    }

    @Test
    fun `transcrire sur l appareil passe de vide a en cours puis au resultat local`() = runTest {
        val rig = Rig()
        val gate = CompletableDeferred<Unit>()
        coEvery { rig.transcriber.transcribe("/cache/a.m4a", "fr") } coAnswers {
            gate.await()
            heard()
        }

        rig.viewModel.transcript(source()).test {
            assertThat(expectMostRecentItem().request).isEqualTo(Request.IDLE)

            rig.viewModel.transcribeOnDevice(source())
            assertThat(expectMostRecentItem().request).isEqualTo(Request.IN_FLIGHT)

            gate.complete(Unit)
            val done = expectMostRecentItem()
            assertThat(done.request).isEqualTo(Request.IDLE)
            assertThat(done.localText).isEqualTo("bonjour tout le monde")
            assertThat(done.localSegments.single().endTime).isEqualTo(2.0)
        }
        coVerify(exactly = 0) { rig.tracker.request(any(), any()) }
    }

    @Test
    fun `sur une piste traduite l appareil reconnait la langue que la piste parle`() = runTest {
        val rig = Rig()
        coEvery { rig.transcriber.transcribe(any(), any()) } returns heard()
        val english = source().copy(url = "https://cdn.meeshy.me/a-en.m4a", trackLanguage = "en", isTranslatedTrack = true)

        rig.viewModel.transcribeOnDevice(english)

        coVerify(exactly = 1) { rig.transcriber.transcribe("/cache/a.m4a", "en") }
        coVerify(exactly = 0) { rig.transcriber.transcribe(any(), "fr") }
    }

    @Test
    fun `une demande locale en cours n est pas relancee`() = runTest {
        val rig = Rig()
        val gate = CompletableDeferred<Unit>()
        coEvery { rig.transcriber.transcribe(any(), any()) } coAnswers {
            gate.await()
            heard()
        }

        rig.viewModel.transcript(source()).test {
            rig.viewModel.transcribeOnDevice(source())
            rig.viewModel.transcribeOnDevice(source())
            gate.complete(Unit)
            expectMostRecentItem()
        }
        coVerify(exactly = 1) { rig.transcriber.transcribe(any(), any()) }
    }

    @Test
    fun `sans copie entiere en cache la demande part au serveur sans rien telecharger`() = runTest {
        val rig = Rig(copy = null)

        rig.viewModel.transcribeOnDevice(source())

        coVerify(exactly = 1) { rig.tracker.request("m1", "a") }
        coVerify(exactly = 0) { rig.transcriber.transcribe(any(), any()) }
    }

    @Test
    fun `un appareil qui ne sait pas transcrire laisse le serveur le faire`() = runTest {
        val rig = Rig()
        coEvery { rig.transcriber.transcribe(any(), any()) } returns SoundTranscriptionOutcome.ServerWillTranscribe

        rig.viewModel.transcribeOnDevice(source())

        coVerify(exactly = 1) { rig.tracker.request("m1", "a") }
    }

    @Test
    fun `une langue inconnue part au serveur qui la detecte`() = runTest {
        val rig = Rig()

        rig.viewModel.transcribeOnDevice(source(language = null))

        coVerify(exactly = 1) { rig.tracker.request("m1", "a") }
        coVerify(exactly = 0) { rig.transcriber.transcribe(any(), any()) }
    }

    @Test
    fun `transcrire via le serveur ne sollicite jamais le reconnaisseur`() = runTest {
        val rig = Rig()

        rig.viewModel.transcribeOnServer(source())

        coVerify(exactly = 1) { rig.tracker.request("m1", "a") }
        coVerify(exactly = 0) { rig.transcriber.transcribe(any(), any()) }
    }

    @Test
    fun `la demande au serveur suivie par le suivi partage apparait dans l etat de la page`() = runTest {
        val rig = Rig()

        rig.viewModel.transcript(source()).test {
            expectMostRecentItem()
            rig.serverState.value = Request.IN_FLIGHT
            assertThat(expectMostRecentItem().request).isEqualTo(Request.IN_FLIGHT)
            rig.serverState.value = Request.FAILED
            assertThat(expectMostRecentItem().request).isEqualTo(Request.FAILED)
        }
    }

    @Test
    fun `un echec de la reconnaissance se dit puis se reessaie`() = runTest {
        val rig = Rig()
        coEvery { rig.transcriber.transcribe(any(), any()) } returnsMany listOf(SoundTranscriptionOutcome.Failed, heard())

        rig.viewModel.transcript(source()).test {
            expectMostRecentItem()
            rig.viewModel.transcribeOnDevice(source())
            assertThat(expectMostRecentItem().request).isEqualTo(Request.FAILED)

            rig.viewModel.transcribeOnDevice(source())
            val retried = expectMostRecentItem()
            assertThat(retried.request).isEqualTo(Request.IDLE)
            assertThat(retried.localText).isEqualTo("bonjour tout le monde")
        }
    }

    @Test
    fun `une reconnaissance sans texte est un echec`() = runTest {
        val rig = Rig()
        coEvery { rig.transcriber.transcribe(any(), any()) } returns heard(text = "  ")

        rig.viewModel.transcript(source()).test {
            expectMostRecentItem()
            rig.viewModel.transcribeOnDevice(source())
            val state = expectMostRecentItem()
            assertThat(state.request).isEqualTo(Request.FAILED)
            assertThat(state.localSegments).isEmpty()
        }
    }

    @Test
    fun `seule une piece de conversation dont le porteur est connu se transcrit`() {
        val rig = Rig()

        assertThat(rig.viewModel.offersTranscription(source())).isTrue()
        assertThat(rig.viewModel.offersTranscription(source(conversationId = ""))).isFalse()
        assertThat(rig.viewModel.offersTranscription(source(carrierId = ""))).isFalse()
    }

    @Test
    fun `sans session le prisme du lecteur est vide`() {
        assertThat(Rig().viewModel.readerLanguages()).isEmpty()
    }
}
