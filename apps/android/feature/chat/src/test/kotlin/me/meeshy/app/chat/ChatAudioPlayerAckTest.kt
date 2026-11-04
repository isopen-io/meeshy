package me.meeshy.app.chat

import android.os.Looper
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.bubble.BubbleAudio
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * #15969 — un vocal écouté PENDANT l'accusé de son envoi continue : la bulle le nomme désormais par son id serveur, le
 * lecteur le suit sans le recharger, et si la copie locale qu'il lisait a été rangée dans le cache, il reprend au même
 * endroit sur l'adresse servie.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChatAudioPlayerAckTest {

    @After
    fun settleMainLooper() {
        shadowOf(Looper.getMainLooper()).idle()
    }

    private class Engine : VoiceNoteEngine {
        val loaded = mutableListOf<String>()
        val seeks = mutableListOf<Long>()
        var resets = 0
        var playing = false
        override var positionMs: Long = 0L
        override val durationMs: Long = 14_000L
        private var prepared: () -> Unit = {}
        private var failed: () -> Unit = {}

        override fun listen(onPrepared: () -> Unit, onCompleted: () -> Unit, onError: () -> Unit) {
            prepared = onPrepared
            failed = onError
        }

        override fun load(url: String) {
            loaded += url
        }

        fun becomesReady() = prepared()
        fun fails() {
            playing = false
            failed()
        }

        override fun start() {
            playing = true
        }

        override fun pause() {
            playing = false
        }

        override fun seekTo(positionMs: Long) {
            seeks += positionMs
            this.positionMs = positionMs
        }

        override fun setSpeed(rate: Float) = Unit
        override fun reset() {
            resets++
            playing = false
        }

        override fun release() = Unit
    }

    private val pending = BubbleAudio(attachmentId = "cmid_voice", url = "file:///data/cache/pending-previews/cmid_voice.voice.m4a", durationSeconds = 14)
    private val acked = BubbleAudio(attachmentId = "att_server", url = "https://gate.meeshy.me/api/v1/static/voice.m4a", durationSeconds = 14)

    private fun listening(engine: Engine): ChatAudioPlayer {
        val player = ChatAudioPlayer(engine, audioManager = null, acknowledgedIdOf = { if (it == "cmid_voice") "att_server" else null })
        player.toggle(pending)
        engine.becomesReady()
        engine.positionMs = 5_000L
        player.tick()
        return player
    }

    @Test
    fun `the acknowledged bubble shows the voice note still playing where it was`() {
        val engine = Engine()
        val player = listening(engine)

        val shown = player.bubbleFor(acked)

        assertThat(shown).isNotNull()
        assertThat(shown!!.attachmentId).isEqualTo("att_server")
        assertThat(shown.isPlaying).isTrue()
        assertThat(shown.currentSeconds).isEqualTo(5.0)
        assertThat(engine.loaded).containsExactly(pending.url)
    }

    @Test
    fun `touching the acknowledged bubble pauses the voice note instead of starting it over`() {
        val engine = Engine()
        val player = listening(engine)

        player.toggle(acked)

        assertThat(engine.loaded).containsExactly(pending.url)
        assertThat(engine.resets).isEqualTo(1)
        assertThat(engine.playing).isFalse()
        assertThat(player.bubbleFor(acked)!!.isPlaying).isFalse()
        assertThat(player.bubbleFor(acked)!!.currentSeconds).isEqualTo(5.0)
    }

    @Test
    fun `once the device copy is gone the voice note goes on from the same place on its served address`() {
        val engine = Engine()
        val player = listening(engine)
        player.toggle(acked)
        player.toggle(acked)

        engine.fails()
        engine.becomesReady()

        assertThat(engine.loaded).containsExactly(pending.url, acked.url).inOrder()
        assertThat(engine.seeks.last()).isEqualTo(5_000L)
        assertThat(engine.playing).isTrue()
        assertThat(player.bubbleFor(acked)!!.isPlaying).isTrue()
    }

    @Test
    fun `a voice note whose served address fails too is shown failed, not retried forever`() {
        val engine = Engine()
        val player = listening(engine)
        player.toggle(acked)

        engine.fails()
        engine.fails()

        assertThat(engine.loaded).containsExactly(pending.url, acked.url).inOrder()
        assertThat(player.bubbleFor(acked)!!.isPlaying).isFalse()
        assertThat(player.bubbleFor(acked)!!.isLoading).isFalse()
    }

    @Test
    fun `another voice note is never taken for the acknowledged one`() {
        val engine = Engine()
        val player = listening(engine)
        val other = BubbleAudio(attachmentId = "att_other", url = "https://gate.meeshy.me/api/v1/static/other.m4a", durationSeconds = 3)

        assertThat(player.bubbleFor(other)).isNull()
        player.toggle(other)

        assertThat(engine.loaded.last()).isEqualTo(other.url)
    }
}
