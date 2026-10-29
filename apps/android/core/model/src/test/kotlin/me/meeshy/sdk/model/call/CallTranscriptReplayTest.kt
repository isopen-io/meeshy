package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * The « Transcription » section of the call detail — port of iOS
 * `CallTranscriptLoader.fetchRemote` + `CallTranscriptSection`: the persisted
 * journal served by `GET /calls/{callId}/transcript`, projected for one reader.
 *
 *  - the reader's own segments are never translated and carry their name (« Vous » when unknown);
 *  - another speaker's segment is served in the reader's prism — the first language served
 *    wins, the original language competes at its rank, no match ⇒ the original (never
 *    `translations.first`);
 *  - each line carries its elapsed clock since the call started, in capture order;
 *  - an empty journal, a refusal (403) or an unknown call (404) hide the section, as iOS does;
 *    only a transient failure offers a retry.
 */
class CallTranscriptReplayTest {

    private val startIso = "2026-10-29T10:00:00.000Z"
    private val startMs = 1_793_268_000_000L

    private fun segment(
        id: String = "s1",
        speakerId: String = "peer",
        speakerDisplayName: String? = "Zoé",
        text: String = "Hello there",
        language: String = "en",
        capturedAtMs: Long = startMs + 5_000,
        translations: List<PersistedTranscriptTranslation> = emptyList(),
    ) = PersistedTranscriptSegment(
        id = id,
        speakerId = speakerId,
        speakerDisplayName = speakerDisplayName,
        text = text,
        language = language,
        capturedAtMs = capturedAtMs,
        translations = translations,
    )

    private fun page(vararg segments: PersistedTranscriptSegment, callStartedAt: String? = startIso) = CallTranscriptPage(
        callId = "call-1",
        conversationId = "conv-1",
        callStartedAt = callStartedAt,
        total = segments.size,
        segments = segments.toList(),
    )

    private fun reader(
        userId: String? = "me",
        name: String? = "Ada",
        prism: List<String> = listOf("fr"),
    ) = CallTranscriptReader(userId = userId, name = name, prism = prism)

    private fun lines(
        page: CallTranscriptPage,
        reader: CallTranscriptReader = reader(),
        recordStartedAt: String = startIso,
    ) = CallTranscriptReplay.lines(
        page = page,
        reader = reader,
        recordStartedAt = recordStartedAt,
        youLabel = "Vous",
        participantLabel = "Participant",
    )

    private fun fr(text: String) = PersistedTranscriptTranslation(targetLanguage = "fr", translatedText = text)
    private fun es(text: String) = PersistedTranscriptTranslation(targetLanguage = "es", translatedText = text)

    // --- speakers ---------------------------------------------------------------------------

    @Test
    fun `the reader's own segment carries the reader's name and is never translated`() {
        val line = lines(page(segment(speakerId = "me", text = "Salut", language = "fr", translations = listOf(es("Hola"))))).single()

        assertThat(line.isLocal).isTrue()
        assertThat(line.speakerName).isEqualTo("Ada")
        assertThat(line.translated).isNull()
        assertThat(line.text(showOriginal = false)).isEqualTo("Salut")
    }

    @Test
    fun `the reader without a name reads « Vous »`() {
        val line = lines(page(segment(speakerId = "me")), reader = reader(name = " ")).single()

        assertThat(line.speakerName).isEqualTo("Vous")
    }

    @Test
    fun `another speaker without a served name reads the participant label`() {
        val line = lines(page(segment(speakerDisplayName = null))).single()

        assertThat(line.isLocal).isFalse()
        assertThat(line.speakerName).isEqualTo("Participant")
    }

    @Test
    fun `an unknown reader never claims a segment as their own`() {
        val line = lines(page(segment(speakerId = "")), reader = reader(userId = null)).single()

        assertThat(line.isLocal).isFalse()
    }

    // --- Prisme -----------------------------------------------------------------------------

    @Test
    fun `another speaker's segment is served in the reader's primary language`() {
        val line = lines(page(segment(text = "Hello", translations = listOf(es("Hola"), fr("Bonjour"))))).single()

        assertThat(line.text(showOriginal = false)).isEqualTo("Bonjour")
        assertThat(line.translatedLanguage).isEqualTo("fr")
        assertThat(line.text(showOriginal = true)).isEqualTo("Hello")
    }

    @Test
    fun `no translation in the reader's prism serves the original, never the first translation`() {
        val line = lines(page(segment(text = "Hello", translations = listOf(es("Hola"))))).single()

        assertThat(line.translated).isNull()
        assertThat(line.text(showOriginal = false)).isEqualTo("Hello")
    }

    @Test
    fun `a lower rank translation serves when the primary language is missing`() {
        val line = lines(
            page(segment(text = "Hello", language = "en", translations = listOf(es("Hola")))),
            reader = reader(prism = listOf("fr", "es")),
        ).single()

        assertThat(line.text(showOriginal = false)).isEqualTo("Hola")
    }

    @Test
    fun `the original language competes at its rank`() {
        val line = lines(
            page(segment(text = "Hello", language = "en", translations = listOf(es("Hola")))),
            reader = reader(prism = listOf("fr", "en", "es")),
        ).single()

        assertThat(line.translated).isNull()
        assertThat(line.text(showOriginal = false)).isEqualTo("Hello")
    }

    @Test
    fun `a blank translation is not a translation`() {
        val line = lines(page(segment(text = "Hello", translations = listOf(fr("  "))))).single()

        assertThat(line.text(showOriginal = false)).isEqualTo("Hello")
    }

    // --- order and clock --------------------------------------------------------------------

    @Test
    fun `lines follow capture order with their elapsed clock since the call started`() {
        val result = lines(
            page(
                segment(id = "b", text = "second", capturedAtMs = startMs + 65_000),
                segment(id = "a", text = "first", capturedAtMs = startMs + 4_000),
            ),
        )

        assertThat(result.map { it.original }).containsExactly("first", "second").inOrder()
        assertThat(result.map { it.elapsedLabel }).containsExactly("00:04", "01:05").inOrder()
    }

    @Test
    fun `a segment captured before the served start reads zero, never a negative clock`() {
        val line = lines(page(segment(capturedAtMs = startMs - 3_000))).single()

        assertThat(line.elapsedLabel).isEqualTo("00:00")
    }

    @Test
    fun `without a served start the call record's start is the origin`() {
        val line = lines(page(segment(capturedAtMs = startMs + 10_000), callStartedAt = null)).single()

        assertThat(line.elapsedLabel).isEqualTo("00:10")
    }

    @Test
    fun `without any parsable start the line carries no clock`() {
        val line = lines(page(segment(), callStartedAt = null), recordStartedAt = "not-a-date").single()

        assertThat(line.elapsedLabel).isNull()
    }

    @Test
    fun `a blank segment is dropped`() {
        assertThat(lines(page(segment(text = "  ")))).isEmpty()
    }

    // --- states -----------------------------------------------------------------------------

    @Test
    fun `an empty journal hides the section`() {
        assertThat(CallTranscriptState.of(emptyList())).isEqualTo(CallTranscriptState.Absent)
    }

    @Test
    fun `a served journal is ready, and offers the original toggle only when something is translated`() {
        val untranslated = CallTranscriptState.of(lines(page(segment(translations = emptyList()))))
        val translated = CallTranscriptState.of(lines(page(segment(translations = listOf(fr("Bonjour"))))))

        assertThat((untranslated as CallTranscriptState.Ready).canShowOriginal).isFalse()
        assertThat((translated as CallTranscriptState.Ready).canShowOriginal).isTrue()
    }

    @Test
    fun `a refusal or an unknown call hides the section like iOS`() {
        assertThat(CallTranscriptState.forFailure(httpStatus = 403)).isEqualTo(CallTranscriptState.Absent)
        assertThat(CallTranscriptState.forFailure(httpStatus = 404)).isEqualTo(CallTranscriptState.Absent)
    }

    @Test
    fun `a transient failure offers a retry`() {
        assertThat(CallTranscriptState.forFailure(httpStatus = null)).isEqualTo(CallTranscriptState.Failed)
        assertThat(CallTranscriptState.forFailure(httpStatus = 500)).isEqualTo(CallTranscriptState.Failed)
    }

    @Test
    fun `nothing is drawn while loading, so a call without transcript never flashes a placeholder`() {
        assertThat(CallTranscriptState.Loading.isVisible).isFalse()
        assertThat(CallTranscriptState.Absent.isVisible).isFalse()
        assertThat(CallTranscriptState.Failed.isVisible).isTrue()
    }
}
