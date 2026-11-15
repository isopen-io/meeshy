package me.meeshy.sdk.model.reading.summary

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/**
 * Segmentation en épisodes — miroir de `EpisodeSegmenter.swift`. Coupure sur trou > 6 h, jour
 * franchi ou changement complet de locuteurs ; fusion des épisodes < 4 messages dans le voisin
 * le plus proche ; plafond de 8. Partition EXACTE des messages. Le fuseau est injecté et le
 * titre se calcule relativement à la fin de l'épisode (jamais l'horloge murale), donc stable.
 */
object EpisodeSegmenter {
    val GAP_THRESHOLD: Duration = Duration.ofHours(6)
    const val MIN_EPISODE_MESSAGES = 4
    const val MAX_EPISODES = 8

    fun segment(messages: List<EpisodeInputMessage>, zone: ZoneId): List<ConversationEpisode> {
        if (messages.isEmpty()) return emptyList()
        val sorted = messages.sortedBy { it.createdAt }
        val capped = capGroups(mergeSmallGroups(splitIntoRawGroups(sorted, zone)), MAX_EPISODES)
        return capped.map { makeEpisode(it, zone) }
    }

    private fun day(at: Instant, zone: ZoneId): LocalDate = at.atZone(zone).toLocalDate()

    private fun splitIntoRawGroups(sorted: List<EpisodeInputMessage>, zone: ZoneId): List<List<EpisodeInputMessage>> {
        val groups = mutableListOf<List<EpisodeInputMessage>>()
        var current = mutableListOf(sorted.first())
        for (message in sorted.drop(1)) {
            val previous = current.last()
            val gap = Duration.between(previous.createdAt, message.createdAt)
            val crossedDay = day(message.createdAt, zone) != day(previous.createdAt, zone)
            val recentSpeakers = current.takeLast(MIN_EPISODE_MESSAGES).map { it.senderId }.toSet()
            val completeSpeakerChange = current.size >= MIN_EPISODE_MESSAGES && message.senderId !in recentSpeakers
            if (gap > GAP_THRESHOLD || crossedDay || completeSpeakerChange) {
                groups += current
                current = mutableListOf(message)
            } else {
                current += message
            }
        }
        groups += current
        return groups
    }

    private fun mergeSmallGroups(groups: List<List<EpisodeInputMessage>>): List<List<EpisodeInputMessage>> {
        val result = groups.toMutableList()
        while (result.size > 1) {
            val idx = result.indexOfFirst { it.size < MIN_EPISODE_MESSAGES }
            if (idx < 0) break
            val intoNext = when (idx) {
                0 -> true
                result.lastIndex -> false
                else -> {
                    val gapToPrev = Duration.between(result[idx - 1].last().createdAt, result[idx].first().createdAt)
                    val gapToNext = Duration.between(result[idx].last().createdAt, result[idx + 1].first().createdAt)
                    gapToNext <= gapToPrev
                }
            }
            if (intoNext) result[idx + 1] = result[idx] + result[idx + 1] else result[idx - 1] = result[idx - 1] + result[idx]
            result.removeAt(idx)
        }
        return result
    }

    private fun capGroups(groups: List<List<EpisodeInputMessage>>, maxCount: Int): List<List<EpisodeInputMessage>> {
        val result = groups.toMutableList()
        while (result.size > maxCount) {
            var bestIdx = 0
            var bestSize = Int.MAX_VALUE
            for (i in 0 until result.lastIndex) {
                val combined = result[i].size + result[i + 1].size
                if (combined < bestSize) {
                    bestSize = combined
                    bestIdx = i
                }
            }
            result[bestIdx] = result[bestIdx] + result[bestIdx + 1]
            result.removeAt(bestIdx + 1)
        }
        return result
    }

    private fun makeEpisode(group: List<EpisodeInputMessage>, zone: ZoneId): ConversationEpisode {
        val start = group.first().createdAt
        val end = group.last().createdAt
        val sameDay = day(start, zone) == day(end, zone)
        val title = EpisodeTitle(
            start = dayLabel(start, end, zone),
            end = if (sameDay) null else dayLabel(end, end, zone),
            messageCount = group.size,
        )
        return ConversationEpisode(
            id = "${group.first().id}_${group.last().id}",
            start = start,
            end = end,
            messageIds = group.map { it.id },
            participantIds = group.map { it.senderId }.toSet().sorted(),
            deterministicTitle = title,
        )
    }

    /** Miroir de `MessageDayLabel.label` : J0 (ou futur) aujourd'hui, J-1, J-2, J-3..6 semaine, au-delà date. */
    internal fun dayLabel(at: Instant, now: Instant, zone: ZoneId): DayLabel {
        val target = day(at, zone)
        val today = day(now, zone)
        val diff = ChronoUnit.DAYS.between(target, today)
        return when {
            diff <= 0 -> DayLabel.Relative(DayLabelKey.TODAY)
            diff == 1L -> DayLabel.Relative(DayLabelKey.YESTERDAY)
            diff == 2L -> DayLabel.Relative(DayLabelKey.DAY_BEFORE_YESTERDAY)
            diff <= 6L -> DayLabel.Weekday(target.dayOfWeek)
            else -> DayLabel.FullDate(target, includeYear = target.year != today.year)
        }
    }
}
