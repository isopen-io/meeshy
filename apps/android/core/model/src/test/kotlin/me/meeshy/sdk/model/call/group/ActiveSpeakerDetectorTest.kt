package me.meeshy.sdk.model.call.group

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Qui parle, avec hystérésis — miroir de iOS `ActiveSpeakerDetectorTests`. */
class ActiveSpeakerDetectorTest {

    private val idle = ActiveSpeakerDetector()

    @Test
    fun `iOS thresholds, hold and cadence`() {
        assertThat(idle.enterLevel).isEqualTo(0.06)
        assertThat(idle.exitLevel).isEqualTo(0.03)
        assertThat(idle.holdMillis).isEqualTo(800L)
        assertThat(ActiveSpeakerDetector.SAMPLING_INTERVAL_MILLIS).isEqualTo(400L)
    }

    @Test
    fun `a member enters only above the enter level`() {
        assertThat(idle.recording(mapOf("alice" to 0.05), nowMillis = 0).speakers).isEmpty()
        assertThat(idle.recording(mapOf("alice" to 0.06), nowMillis = 0).speakers).containsExactly("alice")
    }

    @Test
    fun `a speaker stays while above the exit level, below the enter level`() {
        val speaking = idle.recording(mapOf("alice" to 0.2), nowMillis = 0)
        val quieter = speaking.recording(mapOf("alice" to 0.04), nowMillis = 2_000)
        assertThat(quieter.isSpeaking("alice")).isTrue()
    }

    @Test
    fun `a speaker leaves only after the hold under the exit level`() {
        val speaking = idle.recording(mapOf("alice" to 0.2), nowMillis = 0)
        assertThat(speaking.recording(mapOf("alice" to 0.0), nowMillis = 400).isSpeaking("alice")).isTrue()
        assertThat(speaking.recording(mapOf("alice" to 0.0), nowMillis = 800).isSpeaking("alice")).isTrue()
        assertThat(speaking.recording(mapOf("alice" to 0.0), nowMillis = 801).isSpeaking("alice")).isFalse()
    }

    @Test
    fun `a member missing from a reading keeps their state until the hold expires`() {
        val speaking = idle.recording(mapOf("alice" to 0.2), nowMillis = 0)
        assertThat(speaking.recording(mapOf("bob" to 0.0), nowMillis = 500).isSpeaking("alice")).isTrue()
        assertThat(speaking.recording(emptyMap(), nowMillis = 900).speakers).isEmpty()
    }

    @Test
    fun `several people can speak at once`() {
        val both = idle.recording(mapOf("alice" to 0.1, "bob" to 0.3, "carol" to 0.01), nowMillis = 0)
        assertThat(both.speakers).containsExactly("alice", "bob")
    }

    @Test
    fun `a departed member is forgotten at once`() {
        val speaking = idle.recording(mapOf("alice" to 0.2, "bob" to 0.2), nowMillis = 0)
        assertThat(speaking.forgetting("alice").speakers).containsExactly("bob")
        assertThat(idle.forgetting("alice")).isSameInstanceAs(idle)
    }

    @Test
    fun `a reading that changes nothing keeps the same detector`() {
        assertThat(idle.recording(mapOf("alice" to 0.01), nowMillis = 0)).isSameInstanceAs(idle)
    }
}
