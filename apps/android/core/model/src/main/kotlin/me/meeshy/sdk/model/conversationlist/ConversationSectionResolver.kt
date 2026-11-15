package me.meeshy.sdk.model.conversationlist

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

data class SectionableCategory(val id: String)

enum class TemporalSectionKind { TODAY, YESTERDAY, THIS_WEEK, OLDER }

/** Sections ordonnées : jamais vides, chaque conversation dans exactement une. */
sealed interface ConversationSection {
    val conversations: List<SectionableConversation>

    data class Pinned(override val conversations: List<SectionableConversation>) : ConversationSection
    data class Live(override val conversations: List<SectionableConversation>) : ConversationSection
    data class Category(
        val categoryId: String,
        override val conversations: List<SectionableConversation>,
    ) : ConversationSection
    data class Temporal(
        val kind: TemporalSectionKind,
        override val conversations: List<SectionableConversation>,
    ) : ConversationSection
}

/**
 * Miroir Kotlin de `resolveConversationSections` (TS) et de
 * `LentilleSectionResolver.resolveSections` (Swift). Précédence : épinglée >
 * en direct > catégorie > temporel. Horloge et fuseau toujours injectés ;
 * calendrier grégorien fixe, écart en jours calendaires (insensible au DST).
 */
object ConversationSectionResolver {

    private const val THIS_WEEK_MAX_DAYS = 6L

    fun resolve(
        conversations: List<SectionableConversation>,
        categories: List<SectionableCategory>,
        nowMillis: Long,
        zone: ZoneId,
    ): List<ConversationSection> {
        val declared = categories.mapTo(HashSet()) { it.id }
        val today = localDate(nowMillis, zone)
        val pinned = ArrayList<SectionableConversation>()
        val live = ArrayList<SectionableConversation>()
        val byCategory = HashMap<String, MutableList<SectionableConversation>>()
        val temporal = HashMap<TemporalSectionKind, MutableList<SectionableConversation>>()
        for (c in conversations) {
            val categoryId = c.categoryId
            when {
                c.isPinned -> pinned += c
                c.liveCall != null -> live += c
                categoryId != null && categoryId in declared ->
                    byCategory.getOrPut(categoryId) { ArrayList() } += c
                else -> temporal.getOrPut(temporalKind(c, today, zone)) { ArrayList() } += c
            }
        }
        return buildList {
            if (pinned.isNotEmpty()) add(ConversationSection.Pinned(ConversationSortOrder.sort(pinned)))
            if (live.isNotEmpty()) add(ConversationSection.Live(ConversationSortOrder.sort(live)))
            categories.forEach { category ->
                val bucket = byCategory[category.id]
                if (!bucket.isNullOrEmpty()) {
                    add(ConversationSection.Category(category.id, ConversationSortOrder.sort(bucket)))
                }
            }
            TemporalSectionKind.entries.forEach { kind ->
                val bucket = temporal[kind]
                if (!bucket.isNullOrEmpty()) {
                    add(ConversationSection.Temporal(kind, ConversationSortOrder.sort(bucket)))
                }
            }
        }
    }

    private fun localDate(millis: Long, zone: ZoneId): LocalDate =
        Instant.ofEpochMilli(millis).atZone(zone).toLocalDate()

    private fun temporalKind(c: SectionableConversation, today: LocalDate, zone: ZoneId): TemporalSectionKind {
        val days = maxOf(0L, ChronoUnit.DAYS.between(localDate(c.effectiveTimestampMillis, zone), today))
        return when {
            days == 0L -> TemporalSectionKind.TODAY
            days == 1L -> TemporalSectionKind.YESTERDAY
            days <= THIS_WEEK_MAX_DAYS -> TemporalSectionKind.THIS_WEEK
            else -> TemporalSectionKind.OLDER
        }
    }
}
