package me.meeshy.sdk.model.appearance

import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneOffset
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Comment revient l'événement d'une décoration (#16450) : chaque année, ou une seule fois. */
@Serializable
enum class DecorationEventRecurrence {
    @SerialName("yearly")
    YEARLY,

    @SerialName("none")
    NONE,
}

/**
 * La déclaration `event` d'un pack de décoration, telle que le catalogue d'apparence la transmet (#16450).
 * Annuelle : `{ id, recurrence: "yearly", startsOn?, endsOn? }` (bornes écrites en `MM-DD`) ; unique : `{ id, year }`.
 */
@Serializable
data class DecorationEventDeclaration(
    val id: String,
    val recurrence: DecorationEventRecurrence = DecorationEventRecurrence.NONE,
    val year: Int? = null,
    val startsOn: String? = null,
    val endsOn: String? = null,
)

/** Une fenêtre d'offre : `startsAt` inclus, `endsAt` exclu. */
data class DecorationWindow(val startsAt: Instant, val endsAt: Instant) {
    fun isOpen(now: Instant): Boolean = !now.isBefore(startsAt) && now.isBefore(endsAt)
}

/**
 * LA FENÊTRE D'UNE DÉCORATION D'ÉVÉNEMENT — miroir Kotlin de `resolveEventWindow`
 * (`packages/shared/utils/decoration-event-window.ts`, #16447, #16450) ; le Swift a le sien
 * (`DecorationEventWindow.swift`, MeeshySDK). Toute évolution touche les TROIS.
 *
 * De deux mois calendaires avant l'événement à un mois après, en UTC ; des bornes écrites priment. Un jour sans
 * équivalent dans le mois visé est borné au dernier jour de ce mois (le 29 février d'une année commune devient le 28).
 * Pour un événement annuel : l'occurrence EN COURS, sinon la PROCHAINE.
 */
object DecorationEventWindow {
    const val MONTHS_BEFORE_EVENT: Int = 2
    const val MONTHS_AFTER_EVENT: Int = 1

    data class EventDate(val month: Int, val day: Int)

    /** Le registre partagé, ids en anglais. */
    val events: Map<String, EventDate> = mapOf(
        "christmas" to EventDate(12, 25),
        "new-year" to EventDate(1, 1),
        "valentines-day" to EventDate(2, 14),
        "music-day" to EventDate(6, 21),
        "halloween" to EventDate(10, 31),
    )

    private val MONTH_DAY = Regex("""^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$""")

    /** La fenêtre de l'événement à [now] ; `null` si l'événement est inconnu ou une borne illisible (la fenêtre servie fait foi). */
    fun resolve(event: DecorationEventDeclaration, now: Instant): DecorationWindow? {
        val date = events[event.id] ?: return null
        if (event.recurrence != DecorationEventRecurrence.YEARLY) return event.year?.let { ruleWindow(date, it) }
        val startsOn = event.startsOn?.let { parseMonthDay(it) ?: return null }
        val endsOn = event.endsOn?.let { parseMonthDay(it) ?: return null }
        val year = now.atOffset(ZoneOffset.UTC).year
        val windows = (year - 1..year + 2).map { yearlyWindow(date, it, startsOn, endsOn) }
        return windows.firstOrNull { it.endsAt.isAfter(now) } ?: windows.last()
    }

    /** La fenêtre que la règle donne à l'occurrence [year] d'un événement. */
    fun ruleWindow(date: EventDate, year: Int): DecorationWindow = DecorationWindow(
        startsAt = clampedDay(year, date.month - 1 - MONTHS_BEFORE_EVENT, date.day),
        endsAt = clampedDay(year, date.month - 1 + MONTHS_AFTER_EVENT, date.day),
    )

    /** La fenêtre d'OFFRE : un événement annuel se recalcule à [now], sinon la fenêtre [served] fait foi. */
    fun offerWindow(event: DecorationEventDeclaration?, served: DecorationWindow?, now: Instant): DecorationWindow? {
        if (event == null || event.recurrence != DecorationEventRecurrence.YEARLY) return served
        return resolve(event, now) ?: served
    }

    private fun yearlyWindow(date: EventDate, year: Int, startsOn: EventDate?, endsOn: EventDate?): DecorationWindow {
        val eventDay = clampedDay(year, date.month - 1, date.day)
        val rule = ruleWindow(date, year)
        val start = startsOn?.let { bound ->
            val same = clampedDay(year, bound.month - 1, bound.day)
            if (!same.isAfter(eventDay)) same else clampedDay(year - 1, bound.month - 1, bound.day)
        } ?: rule.startsAt
        val end = endsOn?.let { bound ->
            val same = clampedDay(year, bound.month - 1, bound.day)
            if (same.isAfter(eventDay)) same else clampedDay(year + 1, bound.month - 1, bound.day)
        } ?: rule.endsAt
        return DecorationWindow(start, end)
    }

    /** Minuit UTC du jour, borné au dernier jour du mois ; [monthIndex] (0 = janvier) peut déborder d'une année. */
    internal fun clampedDay(year: Int, monthIndex: Int, day: Int): Instant {
        val month = YearMonth.of(year, 1).plusMonths(monthIndex.toLong())
        return LocalDate.of(month.year, month.monthValue, minOf(day, month.lengthOfMonth())).atStartOfDay(ZoneOffset.UTC).toInstant()
    }

    private fun parseMonthDay(value: String): EventDate? {
        val match = MONTH_DAY.matchEntire(value) ?: return null
        return EventDate(match.groupValues[1].toInt(), match.groupValues[2].toInt())
    }
}
