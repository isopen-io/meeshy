package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import kotlinx.serialization.json.Json
import org.junit.Test

/** Miroir des témoins de `packages/shared/utils/__tests__/decoration-event-window.test.ts` (#16447, #16450). */
class DecorationEventWindowTest {
    private fun at(iso: String): Instant = Instant.parse(iso)
    private fun window(startsAt: String, endsAt: String) = DecorationWindow(at(startsAt), at(endsAt))

    private val christmas = DecorationEventDeclaration(id = "christmas", recurrence = DecorationEventRecurrence.YEARLY)
    private val newYear = DecorationEventDeclaration(id = "new-year", recurrence = DecorationEventRecurrence.YEARLY)

    @Test
    fun `the rule is two months before and one month after`() {
        assertThat(DecorationEventWindow.MONTHS_BEFORE_EVENT).isEqualTo(2)
        assertThat(DecorationEventWindow.MONTHS_AFTER_EVENT).isEqualTo(1)
    }

    @Test
    fun `the registry names its events in English`() {
        assertThat(DecorationEventWindow.events.keys).containsExactly("christmas", "new-year", "valentines-day", "music-day", "halloween")
        assertThat(DecorationEventWindow.events["christmas"]).isEqualTo(DecorationEventWindow.EventDate(12, 25))
        assertThat(DecorationEventWindow.events["new-year"]).isEqualTo(DecorationEventWindow.EventDate(1, 1))
    }

    @Test
    fun `christmas on November 6 2026 is the open 2026 occurrence`() {
        val now = at("2026-11-06T12:00:00Z")
        val resolved = DecorationEventWindow.resolve(christmas, now)
        assertThat(resolved).isEqualTo(window("2026-10-25T00:00:00Z", "2027-01-25T00:00:00Z"))
        assertThat(resolved?.isOpen(now)).isTrue()
    }

    @Test
    fun `across the year January 24 is still Christmas 2026`() {
        assertThat(DecorationEventWindow.resolve(christmas, at("2027-01-24T23:59:59Z"))?.startsAt).isEqualTo(at("2026-10-25T00:00:00Z"))
    }

    @Test
    fun `a closed occurrence points to the next one`() {
        val now = at("2027-01-25T00:00:00Z")
        val resolved = DecorationEventWindow.resolve(christmas, now)
        assertThat(resolved).isEqualTo(window("2027-10-25T00:00:00Z", "2028-01-25T00:00:00Z"))
        assertThat(resolved?.isOpen(now)).isFalse()
    }

    @Test
    fun `an upcoming New Year is next year's event`() {
        assertThat(DecorationEventWindow.resolve(newYear, at("2026-10-01T00:00:00Z"))).isEqualTo(window("2026-11-01T00:00:00Z", "2027-02-01T00:00:00Z"))
        assertThat(DecorationEventWindow.resolve(newYear, at("2026-01-15T00:00:00Z"))).isEqualTo(window("2025-11-01T00:00:00Z", "2026-02-01T00:00:00Z"))
    }

    @Test
    fun `February 29 exists only in leap years`() {
        assertThat(DecorationEventWindow.ruleWindow(DecorationEventWindow.EventDate(4, 30), 2027).startsAt).isEqualTo(at("2027-02-28T00:00:00Z"))
        assertThat(DecorationEventWindow.ruleWindow(DecorationEventWindow.EventDate(4, 30), 2028).startsAt).isEqualTo(at("2028-02-29T00:00:00Z"))
        assertThat(DecorationEventWindow.ruleWindow(DecorationEventWindow.EventDate(8, 31), 2026)).isEqualTo(window("2026-06-30T00:00:00Z", "2026-09-30T00:00:00Z"))
        val bounded = newYear.copy(endsOn = "02-29")
        assertThat(DecorationEventWindow.resolve(bounded, at("2026-11-06T00:00:00Z"))?.endsAt).isEqualTo(at("2027-02-28T00:00:00Z"))
        assertThat(DecorationEventWindow.resolve(bounded, at("2027-11-06T00:00:00Z"))?.endsAt).isEqualTo(at("2028-02-29T00:00:00Z"))
    }

    @Test
    fun `written month-day bounds win and a single one keeps the rule for the other`() {
        val now = at("2026-11-06T00:00:00Z")
        assertThat(DecorationEventWindow.resolve(christmas.copy(startsOn = "12-01", endsOn = "01-07"), now)).isEqualTo(window("2026-12-01T00:00:00Z", "2027-01-07T00:00:00Z"))
        assertThat(DecorationEventWindow.resolve(christmas.copy(startsOn = "12-01"), now)).isEqualTo(window("2026-12-01T00:00:00Z", "2027-01-25T00:00:00Z"))
    }

    @Test
    fun `a single occurrence does not repeat`() {
        val once = DecorationEventDeclaration(id = "christmas", year = 2026)
        assertThat(DecorationEventWindow.resolve(once, at("2030-01-01T00:00:00Z"))).isEqualTo(window("2026-10-25T00:00:00Z", "2027-01-25T00:00:00Z"))
    }

    @Test
    fun `an unknown event or an unreadable bound resolves to nothing and the served window stands`() {
        val served = window("2026-12-01T00:00:00Z", "2027-01-07T00:00:00Z")
        val unknown = DecorationEventDeclaration(id = "inconnu", recurrence = DecorationEventRecurrence.YEARLY)
        assertThat(DecorationEventWindow.resolve(unknown, at("2026-11-06T00:00:00Z"))).isNull()
        assertThat(DecorationEventWindow.resolve(christmas.copy(startsOn = "13-01"), at("2026-11-06T00:00:00Z"))).isNull()
        assertThat(DecorationEventWindow.offerWindow(unknown, served, at("2026-11-06T00:00:00Z"))).isEqualTo(served)
    }

    @Test
    fun `the offer window recomputes a yearly pack and keeps the served window otherwise`() {
        val snapshot = window("2026-10-25T00:00:00Z", "2027-01-25T00:00:00Z")
        val now = at("2027-06-01T00:00:00Z")
        assertThat(DecorationEventWindow.offerWindow(christmas, snapshot, now)).isEqualTo(window("2027-10-25T00:00:00Z", "2028-01-25T00:00:00Z"))
        assertThat(DecorationEventWindow.offerWindow(null, snapshot, now)).isEqualTo(snapshot)
    }

    @Test
    fun `the declaration decodes both catalog forms`() {
        val json = Json { ignoreUnknownKeys = true }
        assertThat(json.decodeFromString(DecorationEventDeclaration.serializer(), """{"id":"christmas","recurrence":"yearly"}""")).isEqualTo(christmas)
        assertThat(json.decodeFromString(DecorationEventDeclaration.serializer(), """{"id":"christmas","year":2026}"""))
            .isEqualTo(DecorationEventDeclaration(id = "christmas", year = 2026))
    }
}
