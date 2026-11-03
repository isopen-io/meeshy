package me.meeshy.sdk.pack

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.model.pack.InstallablePack
import me.meeshy.sdk.model.pack.PackShelfState
import me.meeshy.sdk.session.PerAccountCache

/** Ce que le cache retient pour UN compte et UN domaine : l'étagère et, si elle a été ouverte, la boutique. */
@Serializable
data class PackSnapshot<P>(val installed: List<P>, val catalogue: List<P>? = null)

/** Le sort d'un geste d'installation ou de retrait. */
sealed interface PackToggleOutcome {
    /** Confirmé par la passerelle. */
    data object Done : PackToggleOutcome

    /** Un geste est déjà en vol sur ce pack, ou le pack est inconnu : rien n'a bougé. */
    data object Ignored : PackToggleOutcome

    /** Hors ligne : refusé tout de suite, sans bascule — l'étagère n'a pas bougé. */
    data object Offline : PackToggleOutcome

    /** La passerelle a refusé : l'état d'avant est revenu et [PackShelfState.failed] le dit. */
    data class Refused(val httpStatus: Int?, val code: String?) : PackToggleOutcome
}

/**
 * **Les packs installés et la boutique d'un domaine, cache d'abord** — miroir de `PackStore<Pack>` d'iOS.
 *
 * - [loadInstalled] sert le cache du compte sans attendre, puis revalide À CHAQUE APPARITION : un pack installé
 *   ailleurs (le web, un autre appareil) rejoint l'étagère dès la prochaine ouverture. Une panne réseau ne vide rien.
 * - [toggle] bascule à l'instant, puis confirme ou revient en arrière en le disant. Un pack non intégré installé relit
 *   les packs installés : ses octets n'arrivent qu'avec eux.
 * - `installed == null` = on ne sait pas : [served] sert alors [defaults] (les packs intégrés).
 * - Le cache est par compte : [clear] (déconnexion, changement de compte) remet tout à zéro, et une réponse partie pour
 *   l'ancien compte n'écrit rien dans le nouveau.
 */
class PackStore<P : InstallablePack<P>>(
    private val service: PackService<P>,
    private val cache: KeyedJsonCache,
    elementSerializer: KSerializer<P>,
    private val defaults: List<P> = emptyList(),
    private val isOnline: () -> Boolean = { true },
    private val clock: CacheClock = SystemCacheClock,
    private val onShelfShrank: suspend () -> Unit = {},
) : PerAccountCache {
    private val snapshotSerializer = PackSnapshot.serializer(elementSerializer)
    private val _state = MutableStateFlow(PackShelfState<P>())
    private val gate = Mutex()

    @Volatile private var epoch = 0
    @Volatile private var cacheRead = false
    @Volatile private var refreshing = false

    val domain get() = service.domain

    val state: StateFlow<PackShelfState<P>> = _state.asStateFlow()

    /** L'étagère à montrer : la liste connue, sinon les packs intégrés (jamais une étagère vide par ignorance). */
    fun served(): List<P> = _state.value.served(defaults)

    suspend fun loadInstalled() {
        serveCache()
        refreshInstalled()
    }

    suspend fun loadCatalogue() {
        serveCache()
        val owner = epoch
        val ticket = cache.ticket()
        val served = try {
            service.catalogue()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            return
        }
        if (owner != epoch) return
        _state.value = _state.value.copy(catalogue = served)
        remember(ticket)
    }

    suspend fun toggle(slug: String): PackToggleOutcome {
        val current = _state.value
        val pack = current.catalogue?.firstOrNull { it.slug == slug } ?: current.installed?.firstOrNull { it.slug == slug }
        return if (pack == null) PackToggleOutcome.Ignored else toggle(pack)
    }

    suspend fun toggle(pack: P): PackToggleOutcome {
        if (!isOnline()) return PackToggleOutcome.Offline
        val owner = epoch
        val ticket = cache.ticket()
        val (previous, next) = gate.withLock {
            val before = _state.value
            val flipped = before.togglingInstall(pack) ?: return PackToggleOutcome.Ignored
            _state.value = flipped
            before to flipped
        }
        val wantsInstalled = next.catalogue?.firstOrNull { it.slug == pack.slug }?.installed ?: !pack.installed
        val confirmed = try {
            service.setInstalled(wantsInstalled, pack.slug)
        } catch (e: CancellationException) {
            rollBack(pack.slug, previous, owner)
            throw e
        } catch (e: Exception) {
            rollBack(pack.slug, previous, owner)
            val refusal = e as? PackServiceException
            return if (refusal?.kind == PackServiceException.Kind.OFFLINE) PackToggleOutcome.Offline
            else PackToggleOutcome.Refused(refusal?.httpStatus, refusal?.code)
        }
        if (owner != epoch) return PackToggleOutcome.Done
        gate.withLock { _state.value = _state.value.settled(pack.slug, confirmed) }
        if ((wantsInstalled && !pack.isBundled) || _state.value.installed == null) refreshInstalled() else remember(ticket)
        if (!wantsInstalled) onShelfShrank()
        return PackToggleOutcome.Done
    }

    /** Un pack relu par un autre chemin (achat confirmé) prend sa place dans l'étagère et la boutique. */
    suspend fun absorb(pack: P) {
        val ticket = cache.ticket()
        gate.withLock { _state.value = _state.value.replacing(pack) }
        remember(ticket)
    }

    fun clearFailure() {
        _state.value = _state.value.clearFailure()
    }

    override suspend fun clear() {
        gate.withLock {
            epoch += 1
            cacheRead = false
            refreshing = false
            _state.value = PackShelfState()
        }
        cache.clear(NAMESPACE, key())
    }

    private suspend fun rollBack(slug: String, previous: PackShelfState<P>, owner: Int) {
        if (owner != epoch) return
        withContext(NonCancellable) { gate.withLock { _state.value = _state.value.rolledBack(slug, previous) } }
    }

    /** Sert le cache du compte une fois par vie de l'étagère : frais une heure, servi périmé un mois. */
    private suspend fun serveCache() {
        if (cacheRead) return
        cacheRead = true
        val owner = epoch
        val document = cache.get(NAMESPACE, key(), snapshotSerializer) ?: return
        if (owner != epoch || clock.nowMillis() - document.fetchedAt > SERVED_STALE_MILLIS) return
        gate.withLock {
            val now = _state.value
            _state.value = now.copy(
                installed = now.installed ?: document.value.installed,
                catalogue = now.catalogue ?: document.value.catalogue,
            )
        }
    }

    private suspend fun refreshInstalled() {
        if (refreshing) return
        refreshing = true
        val owner = epoch
        val ticket = cache.ticket()
        try {
            val installed = service.installed()
            if (owner != epoch) return
            val before = _state.value.installed.orEmpty().map { it.slug }.toSet()
            gate.withLock { _state.value = _state.value.copy(installed = installed) }
            remember(ticket)
            if (!installed.map { it.slug }.toSet().containsAll(before)) onShelfShrank()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Une panne n'efface rien : l'étagère garde ce qu'elle sait.
        } finally {
            if (owner == epoch) refreshing = false
        }
    }

    private suspend fun remember(ticket: me.meeshy.sdk.session.AccountTicket?) {
        val now = _state.value
        val installed = now.installed ?: return
        cache.put(NAMESPACE, key(), PackSnapshot(installed, now.catalogue), snapshotSerializer, ticket)
    }

    private fun key(): String = service.domain.wire ?: "unknown"

    private companion object {
        const val NAMESPACE = "pack-shelf"
        const val SERVED_STALE_MILLIS = 30L * 24 * 3_600_000
    }
}
