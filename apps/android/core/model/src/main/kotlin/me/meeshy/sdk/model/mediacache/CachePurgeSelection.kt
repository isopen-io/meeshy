package me.meeshy.sdk.model.mediacache

/** Libellé du bouton de purge : sans sélection, ou majorant « jusqu'à X ». */
public sealed interface CachePurgeButtonState {
    public data object NothingSelected : CachePurgeButtonState

    public data class UpTo(val bytes: Long) : CachePurgeButtonState
}

/**
 * Sélection immuable de la purge sélective (miroir de `CachePurgeViewModel`, iOS). Chaque réduction
 * reçoit le [CachePurgeReport] courant : une case non purgeable ou vide n'entre jamais dans la sélection.
 */
public data class CachePurgeSelection(
    val ids: Set<CachePurgeCellId> = emptySet(),
    val includeUnattributed: Boolean = false,
) {
    public fun isSelected(id: CachePurgeCellId): Boolean = id in ids

    public fun toggle(id: CachePurgeCellId, report: CachePurgeReport): CachePurgeSelection {
        if (id !in report.selectableIds && id !in ids) return this
        return if (id in ids) copy(ids = ids - id) else copy(ids = ids + id)
    }

    public fun toggleKind(kind: CacheDataKind, report: CachePurgeReport): CachePurgeSelection =
        toggleAll(report.selectableIds.filter { it.kind == kind })

    public fun toggleDomain(domain: CacheDomain, report: CachePurgeReport): CachePurgeSelection =
        toggleAll(report.selectableIds.filter { it.domain == domain })

    public fun toggleEverything(report: CachePurgeReport): CachePurgeSelection = toggleAll(report.selectableIds)

    public fun withUnattributed(include: Boolean): CachePurgeSelection = copy(includeUnattributed = include)

    /** Après une nouvelle mesure : retire les cases devenues vides ou indisponibles. */
    public fun afterMeasure(report: CachePurgeReport): CachePurgeSelection =
        copy(ids = ids.intersect(report.selectableIds.toSet()))

    /** Majorant : un fichier partagé par deux domaines compte deux fois. */
    public fun selectedBytes(report: CachePurgeReport): Long {
        val cells = ids.sumOf { id -> report.cell(id.kind, id.domain)?.availability?.bytes ?: 0L }
        return cells + if (includeUnattributed) report.unattributedBytes else 0L
    }

    public fun hasSelection(report: CachePurgeReport): Boolean =
        ids.isNotEmpty() || (includeUnattributed && report.unattributedBytes > 0L)

    public fun buttonState(report: CachePurgeReport): CachePurgeButtonState =
        if (hasSelection(report)) CachePurgeButtonState.UpTo(selectedBytes(report)) else CachePurgeButtonState.NothingSelected

    private fun toggleAll(targets: List<CachePurgeCellId>): CachePurgeSelection {
        if (targets.isEmpty()) return this
        return if (ids.containsAll(targets)) copy(ids = ids - targets.toSet()) else copy(ids = ids + targets)
    }
}
