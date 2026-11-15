package me.meeshy.sdk.model.ongoing

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VoicePlaybackActivityLawTest {

    private val wording = VoicePlaybackActivityLaw.Wording("Message vocal", "Message protégé")
    private val t0 = 10_000_000L

    private fun track(
        id: String = "att1",
        sender: String = "Alice Martin",
        isProtected: Boolean = false,
        language: String? = "fr",
        translated: Boolean = true,
    ) = VoicePlaybackActivityLaw.Track(id, "msg-$id", "conv1", "Famille", sender, "6366F1", isProtected, language, translated, 60_000L)

    private fun input(
        track: VoicePlaybackActivityLaw.Track? = track(),
        playing: Boolean = true,
        position: Long = 0L,
        duration: Long = 60_000L,
        rate: Double = 1.0,
        upNext: Int = 0,
        at: Long = 0L,
    ) = VoicePlaybackActivityLaw.Input(track, playing, position, duration, rate, upNext, t0 + at)

    private fun step(running: VoicePlaybackPresentation?, input: VoicePlaybackActivityLaw.Input) =
        VoicePlaybackActivityLaw.step(running, input, wording)

    @Test
    fun `nothing playing does nothing`() {
        val result = step(null, input(track = null))
        assertThat(result.running).isNull()
        assertThat(result.action).isEqualTo(VoicePlaybackActivityLaw.Action.None)
    }

    @Test
    fun `playback starting opens with sender conversation and track language`() {
        val start = step(null, input(upNext = 2)).action as VoicePlaybackActivityLaw.Action.Start
        assertThat(start.snapshot.title).isEqualTo("Alice Martin")
        assertThat(start.snapshot.subtitle).isEqualTo("Famille")
        assertThat(start.snapshot.initials).isEqualTo("AM")
        assertThat(start.snapshot.trackLanguage).isEqualTo("FR")
        assertThat(start.snapshot.isTranslatedTrack).isTrue()
        assertThat(start.snapshot.upNextCount).isEqualTo(2)
        assertThat(start.snapshot.anchorEpochMs).isEqualTo(t0)
    }

    @Test
    fun `regular progress does not wake the activity`() {
        val opened = step(null, input())
        val later = step(opened.running, input(position = 10_000L, at = 10_000L))
        assertThat(later.action).isEqualTo(VoicePlaybackActivityLaw.Action.None)
        assertThat(later.running!!.anchorEpochMs).isEqualTo(t0)
    }

    @Test
    fun `a forward seek updates the activity`() {
        val opened = step(null, input())
        val jumped = step(opened.running, input(position = 25_000L, at = 10_000L)).action as VoicePlaybackActivityLaw.Action.Update
        assertThat(jumped.snapshot.positionMs).isEqualTo(25_000L)
        assertThat(jumped.snapshot.anchorEpochMs).isEqualTo(t0 + 10_000L)
    }

    @Test
    fun `a small drift under the tolerance is not a seek`() {
        val opened = step(null, input())
        assertThat(step(opened.running, input(position = 11_000L, at = 10_000L)).action)
            .isEqualTo(VoicePlaybackActivityLaw.Action.None)
    }

    @Test
    fun `pause updates the activity`() {
        val opened = step(null, input())
        val paused = step(opened.running, input(playing = false, position = 5_000L, at = 5_000L)).action as VoicePlaybackActivityLaw.Action.Update
        assertThat(paused.snapshot.isPlaying).isFalse()
        assertThat(paused.snapshot.positionMs).isEqualTo(5_000L)
    }

    @Test
    fun `a paused position is not projected forward`() {
        val paused = step(null, input(playing = false, position = 5_000L))
        assertThat(step(paused.running, input(playing = false, position = 5_000L, at = 30_000L)).action)
            .isEqualTo(VoicePlaybackActivityLaw.Action.None)
    }

    @Test
    fun `the next voice message in the queue updates the activity`() {
        val opened = step(null, input(track = track("att1"), upNext = 1))
        val next = step(opened.running, input(track = track("att2", sender = "Bob"), upNext = 0, at = 60_000L)).action
            as VoicePlaybackActivityLaw.Action.Update
        assertThat(next.snapshot.messageId).isEqualTo("msg-att2")
        assertThat(next.snapshot.title).isEqualTo("Bob")
        assertThat(next.snapshot.upNextCount).isEqualTo(0)
    }

    @Test
    fun `a language switch updates the track language`() {
        val opened = step(null, input(track = track(language = "fr", translated = true)))
        val switched = step(opened.running, input(track = track(language = "en", translated = false), at = 1_000L)).action
            as VoicePlaybackActivityLaw.Action.Update
        assertThat(switched.snapshot.trackLanguage).isEqualTo("EN")
        assertThat(switched.snapshot.isTranslatedTrack).isFalse()
    }

    @Test
    fun `a rate change updates the activity`() {
        val opened = step(null, input())
        assertThat(step(opened.running, input(rate = 2.0, at = 1_000L, position = 1_000L)).action)
            .isInstanceOf(VoicePlaybackActivityLaw.Action.Update::class.java)
    }

    @Test
    fun `playback stopping closes with the last projected position then removes`() {
        val opened = step(null, input())
        val stopped = step(opened.running, input(track = null, at = 12_000L))
        assertThat(stopped.running).isNull()
        val end = stopped.action as VoicePlaybackActivityLaw.Action.End
        assertThat(end.snapshot.isPlaying).isFalse()
        assertThat(end.snapshot.positionMs).isEqualTo(12_000L)
    }

    @Test
    fun `a protected message says neutral words only`() {
        val snapshot = VoicePlaybackActivityLaw.snapshot(input(track = track(isProtected = true)), wording)!!
        assertThat(snapshot.subtitle).isEqualTo("Message protégé")
    }

    @Test
    fun `an unknown sender falls back to voice message`() {
        val snapshot = VoicePlaybackActivityLaw.snapshot(input(track = track(sender = " ")), wording)!!
        assertThat(snapshot.title).isEqualTo("Message vocal")
        assertThat(snapshot.initials).isEmpty()
    }

    @Test
    fun `an unloaded duration uses the message duration`() {
        assertThat(VoicePlaybackActivityLaw.snapshot(input(duration = 0L), wording)!!.durationMs).isEqualTo(60_000L)
    }

    @Test
    fun `the projected position follows the playback rate and is clamped`() {
        val snapshot = step(null, input(position = 10_000L, rate = 2.0)).running!!
        assertThat(VoicePlaybackActivityLaw.projectedPosition(snapshot, t0 + 5_000L)).isEqualTo(20_000L)
        assertThat(VoicePlaybackActivityLaw.projectedPosition(snapshot, t0 + 100_000L)).isEqualTo(60_000L)
    }

    @Test
    fun `seek fraction skips fifteen seconds within the track`() {
        assertThat(VoicePlaybackActivityLaw.seekFraction(30_000L, 60_000L, 15_000L)).isEqualTo(0.75)
        assertThat(VoicePlaybackActivityLaw.seekFraction(5_000L, 60_000L, -15_000L)).isEqualTo(0.0)
        assertThat(VoicePlaybackActivityLaw.seekFraction(55_000L, 60_000L, 15_000L)).isEqualTo(1.0)
        assertThat(VoicePlaybackActivityLaw.seekFraction(0L, 0L, 15_000L)).isNull()
    }
}
