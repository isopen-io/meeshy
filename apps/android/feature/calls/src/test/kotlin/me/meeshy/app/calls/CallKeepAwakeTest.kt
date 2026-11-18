package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/** #19695 — tant qu'un appel vit, l'écran ne se met pas en veille, en audio comme en vidéo et pendant un partage. */
class CallKeepAwakeTest {

    @Test
    fun `a live call keeps the screen on, from ringing to reconnecting`() {
        listOf(CallStatus.INCOMING, CallStatus.OUTGOING_RINGING, CallStatus.CONNECTING, CallStatus.CONNECTED, CallStatus.RECONNECTING)
            .forEach { assertThat(CallKeepAwake.keepsScreenOn(it)).isTrue() }
    }

    @Test
    fun `no call and an ended call let the screen sleep`() {
        assertThat(CallKeepAwake.keepsScreenOn(CallStatus.IDLE)).isFalse()
        assertThat(CallKeepAwake.keepsScreenOn(CallStatus.ENDED)).isFalse()
    }

    @Test
    fun `every status is decided`() {
        val decided = CallStatus.entries.map { CallKeepAwake.keepsScreenOn(it) }
        assertThat(decided).hasSize(CallStatus.entries.size)
    }

    @Test
    fun `the app root keeps the screen on from the call phase, full screen and reduced alike`() {
        val root = generateSequence(File("").absoluteFile) { it.parentFile }
            .map { File(it, "app/src/main/kotlin/me/meeshy/app/navigation/MeeshyApp.kt") }
            .first { it.isFile }
            .readText()
        assertThat(root).contains("CallKeepScreenOn(callStatus)")
        val composable = generateSequence(File("").absoluteFile) { it.parentFile }
            .map { File(it, "src/main/kotlin/me/meeshy/app/calls/CallKeepAwake.kt") }
            .first { it.isFile }
            .readText()
        assertThat(composable).contains("view.keepScreenOn = keep")
        assertThat(composable).contains("onDispose { view.keepScreenOn = false }")
    }
}
