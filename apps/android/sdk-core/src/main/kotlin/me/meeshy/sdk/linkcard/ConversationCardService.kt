package me.meeshy.sdk.linkcard

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.model.conversationcard.ConversationCardChange
import me.meeshy.sdk.model.conversationcard.ConversationCardResolution
import me.meeshy.sdk.model.conversationcard.designates
import me.meeshy.sdk.model.deeplink.ConversationCardTarget
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.LinkDetailApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.PerAccountCache

/**
 * La carte d'une URL Meeshy de conversation, cache MÉMOIRE par cible (iOS `ConversationCardService`,
 * #8099). La lecture du cache est synchrone : une bulle qui défile rend une carte déjà vue à sa
 * première image. Frais 60 s ; périmé servi jusqu'à 24 h ; au-delà, vide. Un « indisponible » n'est
 * jamais servi périmé : c'est un repli, pas un contenu, et le serveur a pu gagner la route.
 *
 * Les deux routes sont additives : une passerelle qui ne les connaît pas répond 404 et la carte
 * dégrade en « indisponible », sans nouvelle tentative.
 */
@Singleton
class ConversationCardService internal constructor(
    private val api: LinkDetailApi,
    private val clock: CacheClock,
) : PerAccountCache {
    @Inject
    constructor(api: LinkDetailApi) : this(api, SystemCacheClock)

    private data class Entry(val resolution: ConversationCardResolution, val storedAtMillis: Long)

    private val entries = LinkedHashMap<ConversationCardTarget, Entry>()
    private val changeFlow = MutableSharedFlow<ConversationCardChange>(extraBufferCapacity = 16)

    /** Les cartes à l'écran se relisent quand l'une d'elles change l'appartenance du lecteur. */
    val changes: SharedFlow<ConversationCardChange> = changeFlow.asSharedFlow()

    /** Ce que le cache sait déjà — jamais d'appel réseau. */
    fun cached(target: ConversationCardTarget): CacheResult<ConversationCardResolution> {
        val entry = synchronized(entries) { entries[target] } ?: return CacheResult.Empty
        val age = clock.nowMillis() - entry.storedAtMillis
        if (age < FRESH_MILLIS) return CacheResult.Fresh(entry.resolution, age)
        if (entry.resolution is ConversationCardResolution.Unavailable) return CacheResult.Empty
        if (age < STALE_MILLIS) return CacheResult.Stale(entry.resolution, age)
        return CacheResult.Empty
    }

    /**
     * Relit la carte au serveur et la met en cache. Une erreur PASSAGÈRE ne remplace rien : on rend ce
     * que le cache avait, sinon « indisponible ».
     */
    suspend fun refresh(target: ConversationCardTarget): ConversationCardResolution {
        val result = when (target) {
            is ConversationCardTarget.ShareLink -> apiCall { api.card(target.identifier) }
            is ConversationCardTarget.Direct -> apiCall { api.directCard(target.conversationId) }
        }
        val resolution = when (result) {
            is NetworkResult.Success -> ConversationCardResolution.Card(result.data)
            is NetworkResult.Failure ->
                ConversationCardResolution.definitiveVerdict(result.error.httpStatus, target)
                    ?: return lastSnapshot(target) ?: ConversationCardResolution.Unavailable
        }
        store(resolution, target)
        return resolution
    }

    /** Pose un verdict connu localement (état optimiste d'une jonction). */
    fun store(resolution: ConversationCardResolution, target: ConversationCardTarget) {
        val entry = Entry(resolution, clock.nowMillis())
        synchronized(entries) { entries[target] = entry }
    }

    fun invalidate(target: ConversationCardTarget) {
        synchronized(entries) { entries.remove(target) }
    }

    /**
     * Oublie TOUTES les cartes d'une conversation — lien de partage et lien direct — puis l'annonce
     * ([changes]) pour que les cartes à l'écran se relisent. [origin] est la carte du geste.
     */
    fun invalidate(conversationId: String, origin: ConversationCardTarget) {
        synchronized(entries) {
            entries.entries.removeAll { (target, entry) -> entry.resolution.designates(conversationId, target) }
        }
        changeFlow.tryEmit(ConversationCardChange(conversationId, origin))
    }

    /** Au changement de compte : le compte B ne voit jamais la carte résolue pour le compte A. */
    override suspend fun clear() {
        synchronized(entries) { entries.clear() }
    }

    private fun lastSnapshot(target: ConversationCardTarget): ConversationCardResolution? {
        val entry = synchronized(entries) { entries[target] } ?: return null
        if (entry.resolution is ConversationCardResolution.Unavailable) return null
        return entry.resolution.takeIf { clock.nowMillis() - entry.storedAtMillis < STALE_MILLIS }
    }

    private companion object {
        const val FRESH_MILLIS = 60_000L
        const val STALE_MILLIS = 24 * 60 * 60 * 1000L
    }
}
