package me.meeshy.sdk.model.mediacache

/** Identité d'une case : un type x un domaine. */
public data class CachePurgeCellId(val kind: CacheDataKind, val domain: CacheDomain)

public data class CachePurgeCell(val id: CachePurgeCellId, val availability: CachePurgeAvailability) {
    val kind: CacheDataKind get() = id.kind
    val domain: CacheDomain get() = id.domain
}

/**
 * Photographie mesurée du cache. [unattributedBytes] = octets disque qu'aucun domaine ne revendique ;
 * [totalDiskBytes] = total des stores, mesuré indépendamment (garde-fou).
 */
public data class CachePurgeReport(
    val cells: List<CachePurgeCell>,
    val unattributedBytes: Long,
    val totalDiskBytes: Long,
) {
    public fun cell(kind: CacheDataKind, domain: CacheDomain): CachePurgeCell? =
        cells.firstOrNull { it.kind == kind && it.domain == domain }

    public fun bytesFor(kind: CacheDataKind): Long = cells.filter { it.kind == kind }.sumOf { it.availability.bytes }

    public fun bytesFor(domain: CacheDomain): Long = cells.filter { it.domain == domain }.sumOf { it.availability.bytes }

    /** Somme des cases médias (images, vidéos, sons). */
    public val attributedMediaBytes: Long
        get() = cells.filter { it.kind.isMedia }.sumOf { it.availability.bytes }

    /** Invariant : cases médias + résidu = total disque. Faux si un fichier est compté pour deux domaines. */
    public val isDiskInvariantHolding: Boolean
        get() = attributedMediaBytes + unattributedBytes == totalDiskBytes

    /** Cases qu'une sélection peut contenir : purgeables ET non vides. */
    public val selectableIds: List<CachePurgeCellId>
        get() = cells.filter { it.availability.isPurgeable && it.availability.bytes > 0L }.map { it.id }

    public companion object {
        public val EMPTY: CachePurgeReport = of(emptyMap(), 0L, 0L)

        /** Construit la grille complète 7 x 4 ; chaque case reçoit son verdict structurel. */
        public fun of(
            measuredBytes: Map<CachePurgeCellId, Long>,
            unattributedBytes: Long,
            totalDiskBytes: Long,
        ): CachePurgeReport = CachePurgeReport(
            cells = CacheDataKind.entries.flatMap { kind ->
                CacheDomain.entries.map { domain ->
                    val id = CachePurgeCellId(kind, domain)
                    CachePurgeCell(id, CachePurgeStructuralLimits.availability(kind, domain, measuredBytes[id] ?: 0L))
                }
            },
            unattributedBytes = unattributedBytes.coerceAtLeast(0L),
            totalDiskBytes = totalDiskBytes.coerceAtLeast(0L),
        )
    }
}
