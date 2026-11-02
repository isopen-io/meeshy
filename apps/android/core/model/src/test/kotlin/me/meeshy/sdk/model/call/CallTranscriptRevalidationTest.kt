package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The transcript of a call is read from its encrypted copy first, then revalidated by the server replay (#13677):
 * the server says who may read it, a transient failure never takes away what the device already holds.
 */
class CallTranscriptRevalidationTest {

    private fun page(vararg texts: String) = CallTranscriptPage(
        callId = "call-1",
        conversationId = "conv-1",
        segments = texts.mapIndexed { index, text ->
            PersistedTranscriptSegment(id = "s$index", speakerId = "u2", text = text, language = "fr", capturedAtMs = index.toLong())
        },
    )

    private fun line(text: String) = CallTranscriptLine("Ada", false, null, text, null, null)

    private val project: (CallTranscriptPage) -> List<CallTranscriptLine> = { served -> served.segments.map { line(it.text) } }

    private val cached = CallTranscriptState.Ready(listOf(line("copie")))

    @Test
    fun `a served transcript is shown and replaces the copy`() {
        val served = page("bonjour")

        val refresh = CallTranscriptRevalidation.revalidated(cached, CallTranscriptRemote.Served(served), project)

        assertThat(refresh).isEqualTo(
            CallTranscriptRefresh(CallTranscriptState.Ready(listOf(line("bonjour"))), CallTranscriptCacheAction.Store(served)),
        )
    }

    @Test
    fun `an empty replay hides the section and removes the copy`() {
        val refresh = CallTranscriptRevalidation.revalidated(cached, CallTranscriptRemote.Served(page()), project)

        assertThat(refresh).isEqualTo(CallTranscriptRefresh(CallTranscriptState.Absent, CallTranscriptCacheAction.Drop))
    }

    @Test
    fun `a refusal or an unknown call removes the copy`() {
        listOf(403, 404).forEach { status ->
            val refresh = CallTranscriptRevalidation.revalidated(cached, CallTranscriptRemote.Failed(status), project)

            assertThat(refresh).isEqualTo(CallTranscriptRefresh(CallTranscriptState.Absent, CallTranscriptCacheAction.Drop))
        }
    }

    @Test
    fun `offline the copy keeps showing`() {
        val refresh = CallTranscriptRevalidation.revalidated(cached, CallTranscriptRemote.Failed(null), project)

        assertThat(refresh).isEqualTo(CallTranscriptRefresh(cached, CallTranscriptCacheAction.Keep))
    }

    @Test
    fun `offline without a copy offers the retry`() {
        val refresh = CallTranscriptRevalidation.revalidated(null, CallTranscriptRemote.Failed(503), project)

        assertThat(refresh).isEqualTo(CallTranscriptRefresh(CallTranscriptState.Failed, CallTranscriptCacheAction.Keep))
    }

    @Test
    fun `a conversation sealed end to end shows no transcript and keeps no copy`() {
        assertThat(CallTranscriptRevalidation.sealedEndToEnd)
            .isEqualTo(CallTranscriptRefresh(CallTranscriptState.Absent, CallTranscriptCacheAction.Drop))
    }
}
