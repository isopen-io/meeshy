package me.meeshy.app.calls

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.model.call.frames.CallLiveFramePeerRelease
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #18367 — à la réception du retrait d'un cadre partagé, TalkBack dit poliment pourquoi l'image a changé : « Awa a retiré le
 * cadre », ou « Votre correspondant a retiré le cadre » sans prénom partagé. Les deux libellés sont les clés iOS
 * `call.liveFrame.peerReleased(.anonymous)` (#18415), adoptées par le manifeste et générées dans les sept langues. Rien ne se
 * montre : seule la voix parle, comme VoiceOver.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallLiveFramePeerReleaseAnnouncementTest {

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    @Test
    fun `the announcement names who released the frame, or says the other person`() {
        assertThat(peerReleasedText(context, CallLiveFramePeerRelease("Awa"))).isEqualTo("Awa removed the frame")
        assertThat(peerReleasedText(context, CallLiveFramePeerRelease(null))).isEqualTo("The other person removed the frame")
        assertThat(peerReleasedText(context, CallLiveFramePeerRelease("  "))).isEqualTo("The other person removed the frame")
    }

    @Test
    @Config(qualifiers = "fr")
    fun `en francais - Awa a retire le cadre`() {
        assertThat(peerReleasedText(context, CallLiveFramePeerRelease("Awa"))).isEqualTo("Awa a retiré le cadre")
        assertThat(peerReleasedText(context, CallLiveFramePeerRelease(null))).isEqualTo("Votre correspondant a retiré le cadre")
    }

    private val commentLine = Regex("""^\s*(//|\*|/\*)""")

    private fun calls(): File = generateSequence(File("").absoluteFile) { it.parentFile }
        .flatMap { sequenceOf(File(it, "src/main/kotlin/me/meeshy/app/calls"), File(it, "feature/calls/src/main/kotlin/me/meeshy/app/calls")) }
        .first { File(it, "CallLiveFrameUi.kt").isFile }

    @Test
    fun `the status of the frame says the release aloud, politely, without drawing anything`() {
        val ui = File(calls(), "CallLiveFrameUi.kt").readLines().filterNot { commentLine.containsMatchIn(it) }.joinToString("\n")
        val status = ui.substringAfter("internal fun CallLiveFrameStatus(").substringBefore("\n}\n")

        assertThat(status).contains("CallLiveFramePeerReleaseAnnouncer(controller)")
        val announcer = ui.substringAfter("private fun CallLiveFramePeerReleaseAnnouncer(").substringBefore("\n}\n")
        assertThat(announcer).contains("controller.peerReleases.collect")
        assertThat(announcer).contains("AnnouncementPriority.POLITE")
        assertThat(announcer).doesNotContain("Text(")
    }

    private fun res(): File = File(calls(), "../../../../../res").canonicalFile

    @Test
    fun `both labels speak the seven languages`() {
        listOf("values", "values-fr", "values-es", "values-pt", "values-de", "values-it", "values-ar").forEach { folder ->
            val xml = File(res(), "$folder/strings_generated.xml").readText()
            assertThat(xml).contains("<string name=\"call_live_frame_peer_released\">")
            assertThat(xml).contains("<string name=\"call_live_frame_peer_released_anonymous\">")
        }
    }
}
