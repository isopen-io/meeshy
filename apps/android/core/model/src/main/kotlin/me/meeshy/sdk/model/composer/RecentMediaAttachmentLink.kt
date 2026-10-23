package me.meeshy.sdk.model.composer

/**
 * The link between the composer's attachment zone and the recent-media grid —
 * port of iOS `RecentMediaAttachmentLink`. A media already attached is marked
 * in the grid and cannot be picked twice.
 *
 * One source of truth: the `attachment -> asset` map only counts for attachments
 * still LIVE in the zone; the set of attached assets is DERIVED from it, so
 * removing, failing or sending an attachment frees its tile with no extra step.
 */
object RecentMediaAttachmentLink {

    /** Attached assets, in the zone's attachment order, without duplicates. */
    fun attachedAssetIds(links: Map<String, String>, liveAttachmentIds: List<String>): List<String> =
        liveAttachmentIds.mapNotNull { links[it] }.distinct()

    /** Links a new attachment and prunes those of vanished ones, so the map stays bounded by the zone. */
    fun linking(
        assetId: String,
        attachmentId: String,
        links: Map<String, String>,
        liveAttachmentIds: List<String>,
    ): Map<String, String> {
        val live = liveAttachmentIds.toSet()
        return links.filterKeys { it in live } + (attachmentId to assetId)
    }

    /** What is left to attach of a selection: order kept, attached assets and duplicates dropped. */
    fun fresh(candidates: List<String>, excluding: Set<String>): List<String> =
        candidates.distinct().filter { it !in excluding }

    /**
     * Indices of the system-picker results to ingest. An element without identifier
     * (library not shared) is always taken; an already attached identifier, or one
     * seen earlier in the same batch, is not.
     */
    fun ingestibleIndices(identifiers: List<String?>, excluding: Set<String>): List<Int> {
        val seen = excluding.toMutableSet()
        return identifiers.mapIndexedNotNull { index, id ->
            when {
                id == null -> index
                seen.add(id) -> index
                else -> null
            }
        }
    }

    /** System picker preselection: attached assets, then the grid selection, deduplicated and capped. */
    fun pickerPreselection(attached: List<String>, selection: List<String>, limit: Int): List<String> =
        (attached + selection).distinct().take(limit.coerceAtLeast(0))

    /** Attached assets that come back checked in the picker: only those can be unchecked there. */
    fun preselectedAttached(attached: List<String>, preselection: List<String>): List<String> {
        val primed = preselection.toSet()
        return attached.distinct().filter { it in primed }
    }

    /**
     * Attachments to remove from the zone when the system picker returns: those whose
     * asset was checked on open and does not come back. An element returned without
     * identifier concludes nothing — nothing is removed.
     */
    fun deselectedAttachmentIds(
        links: Map<String, String>,
        liveAttachmentIds: List<String>,
        preselected: List<String>,
        returned: List<String?>,
    ): List<String> {
        if (preselected.isEmpty() || returned.any { it == null }) return emptyList()
        val gone = preselected.toSet() - returned.filterNotNull().toSet()
        return liveAttachmentIds.filter { id -> links[id]?.let { it in gone } ?: false }
    }
}
