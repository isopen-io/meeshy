package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Test

class SystemNoticeTextTest {

    private fun obj(raw: String): JsonObject = Json.parseToJsonElement(raw) as JsonObject

    private fun captureJson(
        nature: String = "timed-flame",
        outcome: String = "announced",
        captureKind: String = "screenshot",
        actor: String = """{"participantId":"p1","displayName":"Alice","isAnonymous":false}""",
        sentAt: String = "2026-10-07T12:05:00.000Z",
    ) = """{"kind":"content-capture","actor":$actor,"capturedMessageId":"m1","nature":"$nature",
        "outcome":"$outcome","captureKind":"$captureKind","sentAt":"$sentAt"}"""

    private fun capture(json: String = captureJson()) = CaptureNoticeMetadata.parse(obj(json))!!

    @Test
    fun `a screenshot of a flame reads in the reader language and zone`() {
        assertThat(SystemNoticeText.capture(capture(), "fr", "Europe/Paris"))
            .isEqualTo("Alice a capturé l’éphémère du 07/10/2026 à 14:05")
        assertThat(SystemNoticeText.capture(capture(), "de", "Europe/Paris"))
            .isEqualTo("Alice hat einen Screenshot der verschwindenden Nachricht vom 07.10.2026 um 14:05 gemacht")
    }

    @Test
    fun `two readers in different zones can read two different days`() {
        val notice = capture(captureJson(sentAt = "2026-10-07T23:30:00Z"))
        assertThat(SystemNoticeText.capture(notice, "fr", "Europe/Paris")).contains("08/10/2026 à 01:30")
        assertThat(SystemNoticeText.capture(notice, "fr", "America/New_York")).contains("07/10/2026 à 19:30")
    }

    @Test
    fun `an unknown language falls back to French and an invalid zone to UTC`() {
        assertThat(SystemNoticeText.capture(capture(), "xx", "Mars/Olympus"))
            .isEqualTo("Alice a capturé l’éphémère du 07/10/2026 à 12:05")
        assertThat(SystemNoticeText.capture(capture(), null, null)).contains("12:05")
        assertThat(SystemNoticeText.normalizedLanguage("PT-br")).isEqualTo("pt")
    }

    @Test
    fun `every catalog language composes every capture form without a leftover placeholder`() {
        val forms = listOf(
            capture(),
            capture(captureJson(captureKind = "recording")),
            capture(captureJson(nature = "view-once", outcome = "blocked")),
            capture(captureJson(nature = "view-once", outcome = "blocked", captureKind = "recording")),
        )
        for (lang in SystemNoticeText.LANGUAGES) for (form in forms) {
            val text = SystemNoticeText.capture(form, lang, "UTC")
            assertThat(text).doesNotContain("{")
            assertThat(text).contains("Alice")
        }
    }

    @Test
    fun `a blocked view-once says the attempt`() {
        val text = SystemNoticeText.capture(capture(captureJson(nature = "view-once", outcome = "blocked")), "en", "UTC")
        assertThat(text).isEqualTo("Alice tried to capture a view-once message — not possible")
    }

    @Test
    fun `a guest is always labelled and a registered user carries the handle`() {
        val guest = capture(
            captureJson(actor = """{"participantId":"p2","displayName":"Bob","isAnonymous":true,"username":"ano_x"}"""),
        )
        assertThat(SystemNoticeText.capture(guest, "en", "UTC")).startsWith("Bob (guest) ")
        assertThat(guest.actor.username).isNull()
        val member = capture(
            captureJson(actor = """{"participantId":"p3","displayName":"Bob","isAnonymous":false,"username":"bob"}"""),
        )
        assertThat(SystemNoticeText.capture(member, "fr", "UTC")).startsWith("Bob (@bob) ")
    }

    @Test
    fun `names are stripped of direction controls and bounded`() {
        assertThat(SystemNoticeText.sanitizedName("A‮B\u0000 \n C")).isEqualTo("AB C")
        assertThat(SystemNoticeText.sanitizedName("‮")).isEqualTo("?")
        assertThat(SystemNoticeText.sanitizedName("x".repeat(100))).hasLength(64)
    }

    @Test
    fun `the stored fallback is French UTC and says so unless blocked`() {
        assertThat(SystemNoticeText.captureFallback(capture())).endsWith("à 12:05 (UTC)")
        val blocked = capture(captureJson(nature = "view-once", outcome = "blocked"))
        assertThat(SystemNoticeText.captureFallback(blocked)).doesNotContain("UTC")
    }

    private fun arrivals(count: Int, vararg names: String): ArrivalsNoticeMetadata =
        ArrivalsNoticeMetadata(names.mapIndexed { i, n -> ArrivalsNoticeMetadata.Arrival("p$i", n) }, count, "t")

    @Test
    fun `arrivals cap the named people at two plus the others`() {
        val line = arrivals(14, "Aïcha", "Tom", "Zoé")
        assertThat(SystemNoticeText.arrivals(line, "fr"))
            .isEqualTo("Aïcha, Tom et 12 autres viennent d’arriver — dis-leur salut")
        assertThat(SystemNoticeText.arrivals(line, "en"))
            .isEqualTo("Aïcha, Tom and 12 others just arrived — say hi")
    }

    @Test
    fun `arrivals name up to three people`() {
        assertThat(SystemNoticeText.arrivals(arrivals(1, "Aïcha"), "en")).isEqualTo("Aïcha just arrived — say hi")
        assertThat(SystemNoticeText.arrivals(arrivals(2, "Aïcha", "Tom"), "en")).isEqualTo("Aïcha and Tom just arrived — say hi")
        assertThat(SystemNoticeText.arrivals(arrivals(3, "A", "B", "C"), "en")).isEqualTo("A, B and C just arrived — say hi")
    }

    @Test
    fun `every language composes every arrivals form`() {
        for (lang in SystemNoticeText.LANGUAGES) for (n in 1..5) {
            val text = SystemNoticeText.arrivals(arrivals(n, "A", "B", "C"), lang)
            assertThat(text).doesNotContain("{")
            assertThat(text).contains("A")
        }
    }
}
