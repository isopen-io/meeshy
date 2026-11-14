package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.model.call.CallAudioRouteKind
import org.junit.Test

/**
 * P1.6 · #17843 — l'état de « Sortie » dans la pilule, miroir de iOS `CallOutputButtonRule` (`CallButtonGlassRuleTests`,
 * mêmes vecteurs). En vidéo le haut-parleur démarre allumé d'office : c'est le repos, un verre. Un appareil externe est
 * un choix : disque blanc, en audio comme en vidéo.
 */
class CallOutputButtonRuleTest {

    @Test
    fun `in a video call the output stays glass at rest, even with the speaker on`() {
        assertThat(CallOutputButtonRule.kind(isSpeaker = true, routesExternally = false, isVideoCall = true)).isEqualTo(CallPillKind.Normal)
        assertThat(CallOutputButtonRule.kind(isSpeaker = false, routesExternally = false, isVideoCall = true)).isEqualTo(CallPillKind.Normal)
    }

    @Test
    fun `in an audio call the output is active when the speaker is on`() {
        assertThat(CallOutputButtonRule.kind(isSpeaker = true, routesExternally = false, isVideoCall = false)).isEqualTo(CallPillKind.Active)
        assertThat(CallOutputButtonRule.kind(isSpeaker = false, routesExternally = false, isVideoCall = false)).isEqualTo(CallPillKind.Normal)
    }

    @Test
    fun `routed to an external device, the output is active in every call`() {
        for (video in listOf(true, false)) {
            assertThat(CallOutputButtonRule.kind(isSpeaker = false, routesExternally = true, isVideoCall = video)).isEqualTo(CallPillKind.Active)
        }
    }

    @Test
    fun `the active route decides, every external kind lights the output and the built-in ones follow the speaker law`() {
        val externals = CallAudioRouteKind.entries.filter { it.isExternal }
        assertThat(externals).isNotEmpty()
        for (kind in externals) for (video in listOf(true, false)) {
            assertThat(CallOutputButtonRule.kind(activeRoute = kind, isSpeakerOn = false, isVideoCall = video)).isEqualTo(CallPillKind.Active)
        }
        assertThat(CallOutputButtonRule.kind(activeRoute = CallAudioRouteKind.Speaker, isSpeakerOn = false, isVideoCall = false)).isEqualTo(CallPillKind.Active)
        assertThat(CallOutputButtonRule.kind(activeRoute = CallAudioRouteKind.Speaker, isSpeakerOn = true, isVideoCall = true)).isEqualTo(CallPillKind.Normal)
        assertThat(CallOutputButtonRule.kind(activeRoute = CallAudioRouteKind.Earpiece, isSpeakerOn = true, isVideoCall = false)).isEqualTo(CallPillKind.Normal)
    }

    @Test
    fun `with no route reported yet, the speaker state of the call decides`() {
        assertThat(CallOutputButtonRule.kind(activeRoute = null, isSpeakerOn = true, isVideoCall = false)).isEqualTo(CallPillKind.Active)
        assertThat(CallOutputButtonRule.kind(activeRoute = null, isSpeakerOn = false, isVideoCall = false)).isEqualTo(CallPillKind.Normal)
        assertThat(CallOutputButtonRule.kind(activeRoute = null, isSpeakerOn = true, isVideoCall = true)).isEqualTo(CallPillKind.Normal)
    }

    private val commentLine = Regex("""^\s*(//|\*|/\*)""")

    private fun code(name: String): String = generateSequence(File("").absoluteFile) { it.parentFile }
        .map { File(it, "src/main/kotlin/me/meeshy/app/calls") }
        .first { File(it, "CallControlsPill.kt").isFile }
        .let { File(it, name) }
        .readLines().filterNot { commentLine.containsMatchIn(it) }.joinToString("\n")

    @Test
    fun `the pill draws the output with the kind the law picks, never a hard-coded glass`() {
        val pill = code("CallControlsPill.kt")
        val output = pill.substring(pill.indexOf("icon = output.icon"), pill.indexOf("Icons.Filled.CallEnd"))
        assertThat(output).contains("kind = output.kind")
        assertThat(output).doesNotContain("kind = CallPillKind.Normal")
        assertThat(output).contains("stateDescription = where")
        assertThat(pill).contains("CallOutputFace(outputIcon, outputKind, outputState)")
    }

    @Test
    fun `the call screen asks the law with the active route, and tells the screen reader where the sound goes`() {
        val layout = code("CallConnectedLayout.kt")
        assertThat(layout).contains("outputKind = CallOutputButtonRule.kind(")
        assertThat(layout).contains("activeRoute = route.route.active?.kind")
        assertThat(layout).contains("outputState = route.route.active?.displayName()")
    }
}
