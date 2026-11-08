package me.meeshy.sdk.cache.purge

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.mediacache.CacheDataKind
import me.meeshy.sdk.model.mediacache.CacheDomain
import me.meeshy.sdk.model.mediacache.CacheMediaIndex
import me.meeshy.sdk.model.mediacache.CacheMediaKind
import me.meeshy.sdk.model.mediacache.CachePurgeCellId
import me.meeshy.sdk.model.mediacache.CachePurgeReport
import me.meeshy.sdk.model.mediacache.CachePurgeStructuralLimits
import timber.log.Timber

/**
 * Résultat d'une purge : [freedBytes] est ce qui a RÉELLEMENT quitté le disque ou la base ; [refused] sont les cases
 * demandées qui ne sont pas purgeables (limite structurelle), ignorées sans bloquer les autres.
 */
public data class CachePurgeResult(val freedBytes: Long, val refused: Set<CachePurgeCellId> = emptySet())

/**
 * Mesure et purge sélective du cache, croisant type de donnée et domaine métier (miroir de `CachePurgeService`, iOS).
 *
 * L'attribution est DÉRIVÉE à chaque appel ([CacheAttributionSource]) : les stockages disque sont indexés par URL et ne
 * portent aucun domaine. Un fichier que plus aucune entité ne cite est compté à part ([CachePurgeReport.unattributedBytes],
 * les « médias orphelins ») et purgeable en bloc. Mesure et purge tournent sur [dispatcher] (jamais le fil principal),
 * se laissent annuler, et une erreur d'E/S sur un stockage n'abandonne pas le reste.
 *
 * Un fichier cité par deux domaines n'est supprimé qu'UNE fois (ses URLs sont réunies avant la suppression) : les octets
 * rendus sont ceux réellement libérés, alors que les cases l'affichent dans chaque domaine (majorant).
 */
public class CachePurgeService(
    private val disks: CacheMediaDisks,
    private val payloads: CachePayloadStores,
    private val attribution: CacheAttributionSource,
    private val ledger: MediaAttributionLedger?,
    private val dispatcher: CoroutineDispatcher,
) {

    public suspend fun report(): CachePurgeReport = withContext(dispatcher) {
        val index = attribution.index()
        val measured = HashMap<CachePurgeCellId, Long>()
        for (kind in CacheDataKind.entries) {
            for (domain in CacheDomain.entries) {
                ensureActive()
                if (!CachePurgeStructuralLimits.isMeasurable(kind, domain)) continue
                measured[CachePurgeCellId(kind, domain)] = measure(kind, domain, index)
            }
        }
        val claimed = union(index)
        val unattributed = CacheMediaKind.entries.sumOf { kind ->
            ensureActive()
            disks.stores(kind).sumOf { store -> guarded { store.bytesExcluding(claimed.urls(kind)) } }
        }
        val total = disks.all().sumOf { store -> ensureActive(); guarded { store.totalBytes() } }
        CachePurgeReport.of(measured, unattributed, total)
    }

    /** Libère exactement les cases de [selection] (et le résidu si [includeUnattributed]). */
    public suspend fun purge(
        selection: Set<CachePurgeCellId>,
        includeUnattributed: Boolean = false,
    ): CachePurgeResult = withContext(dispatcher) {
        val (accepted, refused) = selection.partition { CachePurgeStructuralLimits.isMeasurable(it.kind, it.domain) }
        if (accepted.isEmpty() && !includeUnattributed) return@withContext CachePurgeResult(0L, refused.toSet())

        val index = attribution.index()
        var freed = 0L
        val purgedUrls = HashSet<String>()

        for (kind in CacheMediaKind.entries) {
            val urls = accepted.filter { it.kind == dataKind(kind) }
                .flatMapTo(HashSet()) { (index[it.domain] ?: CacheMediaIndex()).urls(kind) }
            if (urls.isEmpty()) continue
            ensureActive()
            freed += disks.stores(kind).sumOf { store -> guarded { store.purge(urls) } }
            purgedUrls += urls
        }
        accepted.filter { !it.kind.isMedia }.forEach { cell ->
            ensureActive()
            val store = payloads.store(cell.kind, cell.domain) ?: return@forEach
            freed += guarded { store.clear() }
        }
        if (includeUnattributed) freed += purgeUnclaimed(index)
        ledger?.let { registry -> guarded { registry.forget(purgedUrls); 0L } }
        Timber.i("Purge sélective : %d case(s), %d octets libérés", accepted.size, freed)
        CachePurgeResult(freed, refused.toSet())
    }

    /** Purge le résidu : les fichiers dont l'entité porteuse a disparu. */
    public suspend fun purgeUnattributed(): Long = withContext(dispatcher) { purgeUnclaimed(attribution.index()) }

    private suspend fun purgeUnclaimed(index: Map<CacheDomain, CacheMediaIndex>): Long {
        val claimed = union(index)
        return CacheMediaKind.entries.sumOf { kind ->
            disks.stores(kind).sumOf { store -> guarded { store.purgeExcluding(claimed.urls(kind)) } }
        }
    }

    private suspend fun measure(kind: CacheDataKind, domain: CacheDomain, index: Map<CacheDomain, CacheMediaIndex>): Long {
        if (!kind.isMedia) return payloads.store(kind, domain)?.let { guarded { it.bytes() } } ?: 0L
        val mediaKind = mediaKind(kind) ?: return 0L
        val urls = (index[domain] ?: CacheMediaIndex()).urls(mediaKind)
        if (urls.isEmpty()) return 0L
        return disks.stores(mediaKind).sumOf { store -> guarded { store.bytesFor(urls) } }
    }

    private fun union(index: Map<CacheDomain, CacheMediaIndex>): CacheMediaIndex =
        index.values.fold(CacheMediaIndex()) { acc, next -> acc + next }

    private fun mediaKind(kind: CacheDataKind): CacheMediaKind? = when (kind) {
        CacheDataKind.IMAGES -> CacheMediaKind.IMAGES
        CacheDataKind.VIDEOS -> CacheMediaKind.VIDEOS
        CacheDataKind.AUDIO -> CacheMediaKind.AUDIO
        else -> null
    }

    private fun dataKind(kind: CacheMediaKind): CacheDataKind = when (kind) {
        CacheMediaKind.IMAGES -> CacheDataKind.IMAGES
        CacheMediaKind.VIDEOS -> CacheDataKind.VIDEOS
        CacheMediaKind.AUDIO -> CacheDataKind.AUDIO
    }

    /** Une erreur d'E/S ne compte que pour zéro ; l'annulation, elle, traverse. */
    private suspend inline fun guarded(block: () -> Long): Long = try {
        block()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (failure: Exception) {
        Timber.w(failure, "Cache : opération de stockage ignorée")
        0L
    }
}
