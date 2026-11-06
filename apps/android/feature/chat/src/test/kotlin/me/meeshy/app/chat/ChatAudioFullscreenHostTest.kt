package me.meeshy.app.chat

import android.os.Looper
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.media.MediaCacheDirs
import me.meeshy.sdk.media.TypedMediaCache
import me.meeshy.sdk.media.UploadedAttachmentIds
import me.meeshy.sdk.model.media.MediaPresentation
import me.meeshy.sdk.model.playback.MediaResumeMerge.StampedPosition
import me.meeshy.sdk.playback.ConversationAudioCoordinator
import me.meeshy.ui.component.bubble.BubbleCallbacks
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.nio.file.Files

/**
 * Le plein écran audio du fil (#16087) : la bulle d'un vocal le demande, l'hôte n'en présente qu'UN à la fois, et ses
 * pages jouent dans le lecteur partagé — la page déjà jouée ne change que sa suite, une autre page garde la session.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChatAudioFullscreenHostTest {

    private val main = UnconfinedTestDispatcher()

    @Before fun setUp() = Dispatchers.setMain(main)

    /** ChatMediaHost écrit un état Compose hors composition : la boucle principale se vide avant le témoin suivant (#15815). */
    @After fun tearDown() {
        shadowOf(Looper.getMainLooper()).idle()
        Dispatchers.resetMain()
    }

    private class Rig(resting: Map<String, StampedPosition> = emptyMap()) {
        val engine = FakeVoiceEngine()
        val coordinator = ConversationAudioCoordinator(engine, UnconfinedTestDispatcher())
        private val root = Files.createTempDirectory("chat-audio-fullscreen").toFile()
        val viewModel = ChatAudioViewModel(
            coordinator,
            mockk(relaxed = true),
            UploadedAttachmentIds(),
            TypedMediaCache(MediaCacheDirs(root, root)),
            UnconfinedTestDispatcher(),
            ChatRestingPositions { id -> resting[id] },
        )
    }

    private val m1 = voiceMessage("m1", "2026-11-04T08:00:00Z", voice("a"))
    private val m2 = voiceMessage("m2", "2026-11-04T08:01:00Z", voice("b"), voice("c"))
    private val thread = ChatVoiceThread("conv", "Famille", null, "#6366F1", listOf(m1, m2))

    @Test
    fun `la bulle d un vocal demande son plein ecran au fil`() = runTest {
        val rig = Rig()
        val callbacks = BubbleCallbacks().withVoice(rig.viewModel, m1)

        rig.viewModel.fullscreenRequests.test {
            callbacks.onAudioFullscreen!!.invoke(m1.audios.single())
            assertThat(awaitItem()).isEqualTo("a")
        }
    }

    @Test
    fun `une seule presentation plein ecran a la fois, la citation remplace la bulle`() {
        var imageViewerClosed = 0
        val host = ChatMediaHost { imageViewerClosed += 1 }

        host.open(MediaPresentation.Audio("a"))
        host.open(MediaPresentation.Audio("x"))
        assertThat(host.active).isEqualTo(MediaPresentation.Audio("x"))

        host.open(MediaPresentation.Image("m1", 0))
        host.open(MediaPresentation.Audio("b"))
        assertThat(host.active).isEqualTo(MediaPresentation.Audio("b"))
        assertThat(imageViewerClosed).isEqualTo(1)

        host.close()
        assertThat(host.active).isNull()
    }

    @Test
    fun `la page posee joue dans le lecteur partage, au nom de la conversation, avec la suite du plein ecran`() {
        val rig = Rig()
        rig.viewModel.bind(thread)
        val pages = ChatAudioFullscreenSources.of("a", thread.messages, "conv", "Famille")!!
        val player = rig.viewModel.fullscreenPlayer()

        player.start(pages[0], pages.drop(1).map { it.queuedAudio() })

        assertThat(rig.engine.played).containsExactly("a")
        assertThat(rig.coordinator.snapshot.value.context?.conversationName).isEqualTo("Famille")
        assertThat(rig.coordinator.snapshot.value.context?.accentHex).isEqualTo("#6366F1")
        assertThat(rig.coordinator.snapshot.value.queue.upcoming.map { it.attachmentId }).containsExactly("b", "c").inOrder()
        assertThat(player.activeAttachmentId.value).isEqualTo("a")
    }

    @Test
    fun `la page deja jouee ne relance rien, une autre page garde la session`() {
        val rig = Rig()
        rig.viewModel.bind(thread)
        val pages = ChatAudioFullscreenSources.of("a", thread.messages, "conv", "Famille")!!
        val player = rig.viewModel.fullscreenPlayer()
        player.start(pages[0], emptyList())

        player.start(pages[0], listOf(pages[2].queuedAudio()))
        assertThat(rig.engine.played).containsExactly("a")
        assertThat(rig.coordinator.snapshot.value.queue.upcoming.map { it.attachmentId }).containsExactly("c")

        player.start(pages[1], emptyList())
        assertThat(rig.engine.played).containsExactly("a", "b").inOrder()
        assertThat(rig.coordinator.snapshot.value.context?.conversationName).isEqualTo("Famille")
    }

    @Test
    fun `une page revisitee repart de la position memorisee par l appareil, jamais d une position hors de sa piste`() {
        val quoting = voiceMessage("m3", "2026-11-04T08:02:00Z").copy(replyToId = "q1", replyToAudio = voice("q", seconds = 20))
        val rig = Rig(
            resting = mapOf(
                "a" to StampedPosition(4_000L, 1L),
                "b" to StampedPosition(12_000L, 1L),
                "q" to StampedPosition(15_000L, 1L),
                "z" to StampedPosition(3_000L, 1L),
            ),
        )
        rig.viewModel.bind(thread.copy(messages = thread.messages + quoting))
        val player = rig.viewModel.fullscreenPlayer()

        assertThat(player.restingPositionMs("a")).isEqualTo(4_000L)
        assertThat(player.restingPositionMs("b")).isNull()
        assertThat(player.restingPositionMs("c")).isNull()
        assertThat(player.restingPositionMs("q")).isEqualTo(15_000L)
        assertThat(player.restingPositionMs("z")).isNull()
    }

    @Test
    fun `fermer le plein ecran rend la file de la conversation, les non ecoutes apres le vocal joue`() {
        val rig = Rig()
        rig.viewModel.bind(thread)

        assertThat(rig.viewModel.conversationTail("a").map { it.attachmentId }).containsExactly("b", "c").inOrder()
        assertThat(rig.viewModel.conversationTail("b").map { it.attachmentId }).containsExactly("c")
    }

    @Test
    fun `choisir une langue recharge la piste de la meme piece et garde la file`() {
        val rig = Rig()
        rig.viewModel.bind(thread)
        val pages = ChatAudioFullscreenSources.of("a", thread.messages, "conv", "Famille")!!
        val player = rig.viewModel.fullscreenPlayer()
        player.start(pages[0], pages.drop(1).map { it.queuedAudio() })

        val english = pages[0].copy(url = "https://cdn.meeshy.me/a-en.m4a", trackLanguage = "en", isTranslatedTrack = true)
        assertThat(player.switchTrack(english)).isTrue()

        assertThat(rig.engine.played).containsExactly("a", "a").inOrder()
        assertThat(rig.coordinator.snapshot.value.queue.current?.fileUrl).isEqualTo("https://cdn.meeshy.me/a-en.m4a")
        assertThat(rig.coordinator.snapshot.value.queue.current?.trackLanguage).isEqualTo("en")
        assertThat(rig.coordinator.snapshot.value.queue.upcoming.map { it.attachmentId }).containsExactly("b", "c").inOrder()
    }

    @Test
    fun `la piste deja servie ne recharge rien`() {
        val rig = Rig()
        rig.viewModel.bind(thread)
        val pages = ChatAudioFullscreenSources.of("a", thread.messages, "conv", "Famille")!!
        val player = rig.viewModel.fullscreenPlayer()
        player.start(pages[0], emptyList())

        assertThat(player.switchTrack(pages[0])).isFalse()

        assertThat(rig.engine.played).containsExactly("a")
    }

    @Test
    fun `une langue choisie sur une page que le lecteur ne tient pas ne touche pas au lecteur`() {
        val rig = Rig()
        rig.viewModel.bind(thread)
        val pages = ChatAudioFullscreenSources.of("a", thread.messages, "conv", "Famille")!!
        val player = rig.viewModel.fullscreenPlayer()
        player.start(pages[0], emptyList())

        assertThat(player.switchTrack(pages[1].copy(url = "https://cdn.meeshy.me/b-en.m4a", trackLanguage = "en", isTranslatedTrack = true))).isFalse()

        assertThat(rig.engine.played).containsExactly("a")
        assertThat(rig.coordinator.snapshot.value.queue.current?.attachmentId).isEqualTo("a")
    }
}
