package me.meeshy.sdk.model.conversationlist

/** Identités des sections calculées par la loi (jamais repliables ni assignables). */
object LentilleSectionIdentity {
    const val ID_PREFIX = "lentille."
    const val LIVE_ID = ID_PREFIX + "live"

    fun idFor(kind: TemporalSectionKind): String = ID_PREFIX + when (kind) {
        TemporalSectionKind.TODAY -> "today"
        TemporalSectionKind.YESTERDAY -> "yesterday"
        TemporalSectionKind.THIS_WEEK -> "thisWeek"
        TemporalSectionKind.OLDER -> "older"
    }

    fun isLentilleOnly(sectionId: String): Boolean = sectionId.startsWith(ID_PREFIX)
}

/**
 * Règles pures de repliage et de dépôt — ports de `ConversationListSectionMemory`
 * et de `ConversationListView+SectionRules` (iOS).
 */
object ConversationListSectionDefaults {

    const val PINNED_ID = "pinned"
    const val OTHER_ID = "other"

    /** Sections dépliées à la première ouverture. */
    val defaultExpanded: Set<String> = setOf(PINNED_ID, OTHER_ID)

    /** Défauts + catégories dont `isExpanded` vaut vrai. */
    fun initialExpanded(expandedCategoryIds: Collection<String>): Set<String> =
        defaultExpanded + expandedCategoryIds

    /** Ensemble mémorisé pour la session, sinon les défauts. */
    fun initial(remembered: Set<String>?, expandedCategoryIds: Collection<String> = emptyList()): Set<String> =
        remembered ?: initialExpanded(expandedCategoryIds)

    fun isCollapsible(sectionId: String): Boolean =
        !LentilleSectionIdentity.isLentilleOnly(sectionId) && !ConversationWorldHead.isHead(sectionId)

    fun acceptsDrop(sectionId: String): Boolean = isCollapsible(sectionId)

    /** Une seule section « other » (hors tête World Wide) = liste plate. */
    fun isSingleUngroupedSection(sectionIds: List<String>): Boolean {
        val sections = sectionIds.filterNot(ConversationWorldHead::isHead)
        return sections.size == 1 && sections[0] == OTHER_ID
    }

    fun showsHeader(sectionId: String, isSingleUngroupedSection: Boolean): Boolean =
        !isSingleUngroupedSection && !ConversationWorldHead.isHead(sectionId)

    fun isContentVisible(
        sectionId: String,
        expandedSections: Set<String>,
        isSingleUngroupedSection: Boolean,
    ): Boolean = isSingleUngroupedSection || !isCollapsible(sectionId) || sectionId in expandedSections
}
