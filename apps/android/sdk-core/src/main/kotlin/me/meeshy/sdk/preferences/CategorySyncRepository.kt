package me.meeshy.sdk.preferences

import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.PendingPreferenceCategories
import me.meeshy.sdk.model.PreferenceCategory
import me.meeshy.sdk.model.PreferenceCategoryCodec
import me.meeshy.sdk.model.PreferenceCategoryCodecs
import me.meeshy.sdk.model.routeSegment
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PreferencesCategoryApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.outbox.OutboxEnqueueResult
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxMutation
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.session.SessionRepository
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Le côté DURABLE de la synchronisation des sept catégories de préférences (iOS `UserPreferencesManager`,
 * `pendingCategories` + `syncCategoryToBackend`) :
 *
 * - les catégories EN ATTENTE — modifiées ici, pas encore confirmées — sont persistées (elles survivent à une mort du
 *   processus avant le débounce) et opposent leur veto à toute relecture du serveur ;
 * - l'écriture est UNE ligne de file par catégorie ([OutboxKind.UPDATE_PREFERENCE_CATEGORY], cible = nom de route), donc
 *   une rafale hors ligne se réduit à un seul PATCH par catégorie ;
 * - la relecture des quatre blocs que seul ce dépôt tient (message, vidéo, document, application) fusionne le serveur
 *   sur le cliché local, clés inconnues comprises.
 */
@Singleton
public class CategorySyncRepository @Inject constructor(
    private val sessionRepository: SessionRepository,
    private val outboxRepository: OutboxRepository,
    private val readApi: PreferencesCategoryApi,
    private val store: PreferenceSnapshotStore,
    private val clock: CacheClock,
) {
    private val lock = Mutex()
    private var pending: Set<PreferenceCategory>? = null

    /** `true` quand une session est ouverte : sans elle rien ne part, et l'attente est conservée. */
    public fun hasSession(): Boolean = !sessionRepository.currentUserId.isNullOrBlank()

    public suspend fun pendingCategories(): Set<PreferenceCategory> = lock.withLock { loaded() }

    public suspend fun isPending(category: PreferenceCategory): Boolean = category in pendingCategories()

    public suspend fun markPending(category: PreferenceCategory) {
        lock.withLock { persist(loaded() + category) }
    }

    public suspend fun clearPending(category: PreferenceCategory) {
        lock.withLock { persist(loaded() - category) }
    }

    /** Oublie toute attente (déconnexion) : en mémoire ET sur disque. */
    public suspend fun resetPending() {
        lock.withLock {
            pending = emptySet()
            store.save(PENDING_KEY, PendingPreferenceCategories.encode(emptySet()), clock.nowMillis())
        }
    }

    /**
     * Met en file le cliché complet de [category]. `false` quand rien n'a été pris en charge (hors session, file
     * pleine) : l'appelant garde alors la catégorie en attente.
     */
    public suspend fun enqueue(category: PreferenceCategory, snapshot: JsonObject): Boolean {
        if (!hasSession()) return false
        val mutation = OutboxMutation(
            kind = OutboxKind.UPDATE_PREFERENCE_CATEGORY,
            lane = OutboxLanes.SETTINGS,
            targetId = category.routeSegment,
            payload = snapshot.toString(),
        )
        return outboxRepository.tryEnqueue(mutation) !is OutboxEnqueueResult.QueueFull
    }

    /**
     * Cette catégorie porte-t-elle une écriture que le serveur n'a pas encore reçue ? Une attente locale, ou une ligne
     * de file livrable de son type. Une file illisible vaut « oui » : sauter une relecture se rattrape, écraser le choix
     * de l'utilisateur non.
     */
    public suspend fun owesWrite(category: PreferenceCategory): Boolean {
        if (isPending(category)) return true
        return try {
            kindsFor(category).any { outboxRepository.hasDeliverable(OutboxLanes.SETTINGS, it) }
        } catch (cancellation: kotlinx.coroutines.CancellationException) {
            throw cancellation
        } catch (error: Exception) {
            Timber.w(error, "Outbox illisible : relecture des préférences %s sautée", category.routeSegment)
            true
        }
    }

    /**
     * Relit [category] chez la passerelle et la fusionne sur le cliché local. Rend `false` sans rien lire pour une
     * catégorie que ce dépôt ne tient pas (notification, confidentialité, audio ont leur magasin) ou qui attend une
     * écriture. Un échec réseau ne touche à rien.
     */
    public suspend fun refreshBlock(category: PreferenceCategory): Boolean {
        val codec = codecFor(category) ?: return false
        if (owesWrite(category)) return false
        return refreshWith(codec)
    }

    private suspend fun <T : Any> refreshWith(codec: PreferenceCategoryCodec<T>): Boolean {
        val key = blockKey(codec.category)
        return when (val result = apiCall { readApi.getBlock(codec.category.routeSegment) }) {
            is NetworkResult.Success -> {
                val local = codec.fromStorage(store.observe(key).first())
                val merged = codec.mergeServed(local, codec.decode(result.data))
                store.save(key, codec.storageValue(merged), clock.nowMillis())
                true
            }
            is NetworkResult.Failure -> {
                Timber.w("Relecture des préférences %s échouée : %s", codec.category.routeSegment, result.error.message)
                false
            }
        }
    }

    private suspend fun loaded(): Set<PreferenceCategory> =
        pending ?: PendingPreferenceCategories.decode(store.observe(PENDING_KEY).first()).also { pending = it }

    private suspend fun persist(next: Set<PreferenceCategory>) {
        pending = next
        store.save(PENDING_KEY, PendingPreferenceCategories.encode(next), clock.nowMillis())
    }

    internal companion object {
        const val PENDING_KEY: String = "pending-categories"

        fun blockKey(category: PreferenceCategory): String = "block:${category.routeSegment}"

        /** Les types de ligne qui portaient déjà cette catégorie avant le type unique. */
        fun kindsFor(category: PreferenceCategory): List<OutboxKind> = listOfNotNull(
            OutboxKind.UPDATE_PREFERENCE_CATEGORY,
            when (category) {
                PreferenceCategory.NOTIFICATION -> OutboxKind.UPDATE_SETTINGS
                PreferenceCategory.PRIVACY -> OutboxKind.UPDATE_PRIVACY_SETTINGS
                PreferenceCategory.AUDIO -> OutboxKind.UPDATE_AUDIO_SETTINGS
                PreferenceCategory.APPLICATION -> OutboxKind.UPDATE_APPLICATION_SETTINGS
                else -> null
            },
        )

        fun codecFor(category: PreferenceCategory): PreferenceCategoryCodec<*>? = when (category) {
            PreferenceCategory.MESSAGE -> PreferenceCategoryCodecs.message
            PreferenceCategory.VIDEO -> PreferenceCategoryCodecs.video
            PreferenceCategory.DOCUMENT -> PreferenceCategoryCodecs.document
            PreferenceCategory.APPLICATION -> PreferenceCategoryCodecs.application
            else -> null
        }
    }
}
