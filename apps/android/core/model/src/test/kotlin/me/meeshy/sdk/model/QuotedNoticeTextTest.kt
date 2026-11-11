package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Test

/**
 * #17441 — un avis AFFICHÉ (appel, arrivée, arrivées regroupées, départ annoncé) se cite, et sa
 * citation se dit dans la langue du LECTEUR, jamais dans le repli français stocké en `content`.
 * Miroir de `quotedNoticeText` (`packages/shared/utils/quotable-notice.ts`) et de `QuotedNotice` (iOS).
 */
class QuotedNoticeTextTest {

    private fun notice(json: String): JsonObject = Json.parseToJsonElement(json).jsonObject

    private fun call(extra: String = ""): String =
        """{"kind":"call","callId":"c-1","initiatorId":"u-ama","callType":"audio","outcome":"missed",
            "durationSeconds":0,"bytesTotal":null,"bytesEstimated":false,"networkQuality":null$extra}"""

    @Test
    fun a_missed_call_is_missed_for_the_callee_and_unanswered_or_cancelled_for_the_caller() {
        assertThat(QuotedNoticeText.of(notice(call()), viewerId = "u-kofi", language = "en")).isEqualTo("Missed call")
        assertThat(QuotedNoticeText.of(notice(call()), viewerId = "u-ama", language = "en")).isEqualTo("Unanswered call")
        assertThat(QuotedNoticeText.of(notice(call(""","endedByInitiator":true""")), viewerId = "u-ama", language = "en"))
            .isEqualTo("Cancelled call")
    }

    @Test
    fun a_completed_call_says_its_medium_and_duration_and_a_live_call_says_ongoing() {
        val video = call().replace("\"audio\"", "\"video\"").replace("\"missed\"", "\"completed\"")
            .replace("\"durationSeconds\":0", "\"durationSeconds\":272")
        assertThat(QuotedNoticeText.of(notice(video), viewerId = "u-kofi", language = "es")).isEqualTo("Videollamada · 04:32")
        val live = call().replace("\"kind\":\"call\"", "\"kind\":\"call-live\"")
        assertThat(QuotedNoticeText.of(notice(live), viewerId = "u-kofi", language = "de")).isEqualTo("Laufender Anruf")
    }

    @Test
    fun an_arrival_grouped_arrivals_and_a_leave_speak_the_reader_language() {
        val joined = """{"kind":"member-joined","participantId":"p-1","displayName":"Bruno","isAnonymous":false,"viaShareLink":false}"""
        assertThat(QuotedNoticeText.of(notice(joined), viewerId = "u", language = "en")).isEqualTo("Bruno joined the conversation")
        val added = """{"kind":"member-joined","participantId":"p-1","displayName":"Bruno","addedBy":{"participantId":"p-2","displayName":"Demo"}}"""
        assertThat(QuotedNoticeText.of(notice(added), viewerId = "u", language = "en")).isEqualTo("Demo added Bruno")
        val arrived = """{"kind":"members-arrived","arrivals":[{"participantId":"p-1","displayName":"Aïcha"}],"count":1,"windowStartedAt":"2026-11-10T08:00:00.000Z"}"""
        assertThat(QuotedNoticeText.of(notice(arrived), viewerId = "u", language = "en")).isEqualTo("Aïcha just arrived — say hi")
        val left = """{"kind":"member-left","actor":{"participantId":"p-1","displayName":"Bob"}}"""
        assertThat(QuotedNoticeText.of(notice(left), viewerId = "u", language = "fr")).isEqualTo("Bob a quitté la conversation")
    }

    @Test
    fun a_notice_that_is_not_quotable_or_unreadable_says_nothing_and_the_quote_keeps_its_content() {
        val removed = """{"kind":"member-removed","actor":{"participantId":"a","displayName":"A"},"target":{"participantId":"b","displayName":"B"}}"""
        assertThat(QuotedNoticeText.of(notice(removed), viewerId = "u", language = "en")).isNull()
        assertThat(QuotedNoticeText.of(notice("""{"kind":"member-left"}"""), viewerId = "u", language = "en")).isNull()
        assertThat(QuotedNoticeText.of(notice("""{"kind":"content-capture"}"""), viewerId = "u", language = "en")).isNull()
        assertThat(QuotedNoticeText.of(null, viewerId = "u", language = "en")).isNull()
    }

    @Test
    fun a_language_outside_the_catalog_falls_back_to_french() {
        assertThat(QuotedNoticeText.of(notice(call()), viewerId = "u-kofi", language = "ja")).isEqualTo("Appel manqué")
    }
}
