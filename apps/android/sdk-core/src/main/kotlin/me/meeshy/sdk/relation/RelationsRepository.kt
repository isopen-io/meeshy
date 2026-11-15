package me.meeshy.sdk.relation

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.map
import kotlinx.serialization.builtins.ListSerializer
import me.meeshy.core.database.dao.KeyedJsonCacheDao
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.friend.FriendListRepository
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.friend.OutboxFlushScheduler
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestDirection
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.friend.resolvedName
import me.meeshy.sdk.model.relation.CirclePerson
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.model.relation.RelationLink
import me.meeshy.sdk.model.relation.RelationLinkWire
import me.meeshy.sdk.model.relation.RelationRaiseGate
import me.meeshy.sdk.model.relation.RelationRitualBody
import me.meeshy.sdk.model.relation.RelationRitualConsents
import me.meeshy.sdk.model.relation.RelationRitualPhase
import me.meeshy.sdk.model.relation.RelationRitualStep
import me.meeshy.sdk.model.relation.RelationsConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.RelationLowerBody
import me.meeshy.sdk.net.api.RelationsApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.outbox.OutboxOutcome
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.user.UserRepository

/**
 * Ce dont « Mes cercles » a besoin (#13938) — le port de l'écran, miroir de `RelationsProviding` + `FriendServiceProviding`
 * + `CirclePeopleResolving` côté iOS. Le dépôt ne décide d'aucun niveau : la passerelle sert le lien, sa progression et son
 * éligibilité ; les refus typés remontent tels quels (`ApiError.code`).
 */
interface CirclesGateway {
    /** Les derniers liens connus, ou `null` à froid (jamais synchronisés) : la peinture cache d'abord. */
    suspend fun cachedLinks(): List<RelationLink>?

    /** Relit `GET /relations` et réécrit le disque ; un échec garde le cache. */
    suspend fun refreshLinks(): NetworkResult<List<RelationLink>>

    suspend fun config(): RelationsConfig?

    suspend fun pendingRequests(direction: FriendRequestDirection): List<FriendRequest>?

    /** Met la demande d'un cran en file durable (hors ligne : elle attend la reconnexion). Rend son `cmid`, ou `null`. */
    suspend fun enqueueRaise(userId: String, target: RelationLevel): String?

    /** Met la réponse à une demande reçue en file durable ; le cache d'amitié bascule tout de suite. */
    suspend fun enqueueRespond(request: FriendRequest, accept: Boolean): String?

    /** Retire une demande envoyée, en direct (elle suppose le réseau). */
    suspend fun cancel(request: FriendRequest): Boolean

    /** Les `cmid` que la file a abandonnés pour de bon (refus du serveur, essais épuisés) : l'optimiste se défait. */
    val exhausted: Flow<String>

    suspend fun ritual(
        userId: String,
        phase: RelationRitualPhase,
        token: String?,
        consents: RelationRitualConsents?,
    ): NetworkResult<RelationRitualStep>

    /**
     * Baisse MON accord (#14910) : un cran sous le niveau effectif, ou [RelationLevel.PUBLIC] pour annuler le lien. En direct
     * (un geste destructif ne part pas en file) ; le succès réécrit le lien en cache, et un lien annulé sous Ami quitte
     * le cache d'amitié. Les refus typés (`RELATION_NOT_A_DROP`) remontent tels quels.
     */
    suspend fun lower(userId: String, level: RelationLevel): NetworkResult<RelationLink>

    /** Le verrou de remontée que `GET /relations/:userId` sert ; `null` en panne : rien n'est verrouillé par défaut. */
    suspend fun raiseGate(userId: String): RelationRaiseGate?

    /**
     * Nomme les personnes des cercles : `GET /relations` ne sert jamais un nom (RG-07). Le cache des amis d'abord (sur
     * disque, aucune requête), puis le profil des autres, borné. Un profil illisible laisse la personne ABSENTE.
     */
    suspend fun people(ids: List<String>): Map<String, CirclePerson>
}

@Singleton
class RelationsRepository internal constructor(
    private val api: RelationsApi,
    private val cache: KeyedJsonCache,
    private val friends: FriendRepository,
    private val friendList: FriendListRepository,
    private val friendshipCache: FriendshipCache,
    private val outbox: OutboxRepository,
    private val users: UserRepository,
    private val flush: OutboxFlushScheduler,
) : CirclesGateway {

    @Inject
    constructor(
        api: RelationsApi,
        dao: KeyedJsonCacheDao,
        fence: AccountFence,
        friends: FriendRepository,
        friendList: FriendListRepository,
        friendshipCache: FriendshipCache,
        outbox: OutboxRepository,
        users: UserRepository,
        flush: OutboxFlushScheduler,
    ) : this(api, KeyedJsonCache(dao, fence = fence), friends, friendList, friendshipCache, outbox, users, flush)

    override suspend fun cachedLinks(): List<RelationLink>? =
        cache.get(NAMESPACE, LINKS_KEY, LINKS_SERIALIZER)?.value?.map(RelationLinkWire::toLink)

    override suspend fun refreshLinks(): NetworkResult<List<RelationLink>> {
        val ticket = cache.ticket()
        return when (val served = apiCall { api.links() }) {
            is NetworkResult.Success -> {
                cache.put(NAMESPACE, LINKS_KEY, served.data, LINKS_SERIALIZER, ticket)
                NetworkResult.Success(served.data.map(RelationLinkWire::toLink))
            }
            is NetworkResult.Failure -> served
        }
    }

    override suspend fun config(): RelationsConfig? = (apiCall { api.config() } as? NetworkResult.Success)?.data

    override suspend fun pendingRequests(direction: FriendRequestDirection): List<FriendRequest>? =
        (friends.pendingRequests(direction, limit = REQUESTS_PAGE) as? NetworkResult.Success)?.data?.requests

    /** Une ligne mise en file réveille le vidage de l'outbox, comme `ConnectionActionController` : sinon elle attendrait. */
    override suspend fun enqueueRaise(userId: String, target: RelationLevel): String? =
        friends.enqueueSendFriendRequest(receiverId = userId, targetLevel = target.wire)?.also { flush.schedule() }

    override suspend fun enqueueRespond(request: FriendRequest, accept: Boolean): String? {
        val cmid = friends.enqueueRespondFriendRequest(request.id, request.senderId, accept) ?: return null
        if (accept) friendshipCache.didAcceptRequest(request.senderId) else friendshipCache.didRejectRequest(request.senderId)
        flush.schedule()
        return cmid
    }

    override suspend fun cancel(request: FriendRequest): Boolean =
        friends.deleteRequest(request.id) is NetworkResult.Success

    override val exhausted: Flow<String> =
        outbox.outcomes.filterIsInstance<OutboxOutcome.Exhausted>().map { it.cmid }

    override suspend fun ritual(
        userId: String,
        phase: RelationRitualPhase,
        token: String?,
        consents: RelationRitualConsents?,
    ): NetworkResult<RelationRitualStep> =
        apiCall { api.ritual(userId, RelationRitualBody(phase = phase.wire, token = token, consents = consents)) }

    override suspend fun lower(userId: String, level: RelationLevel): NetworkResult<RelationLink> {
        val ticket = cache.ticket()
        return when (val served = apiCall { api.lower(userId, RelationLowerBody(level = level.wire)) }) {
            is NetworkResult.Success -> {
                val link = served.data.toLink()
                val kept = link.effectiveLevel >= RelationLevel.ACQUAINTANCE
                cache.update(NAMESPACE, LINKS_KEY, LINKS_SERIALIZER, ticket) { links ->
                    links.mapNotNull { if (it.userId != userId) it else served.data.takeIf { kept } }
                }
                if (link.effectiveLevel < RelationLevel.FRIEND) friendshipCache.didRemoveFriend(userId)
                NetworkResult.Success(link)
            }
            is NetworkResult.Failure -> served
        }
    }

    override suspend fun raiseGate(userId: String): RelationRaiseGate? =
        (quietly { apiCall { api.byUserId(userId) } } as? NetworkResult.Success)?.data
            ?.let {
                RelationRaiseGate(
                    canRaise = it.canRaise,
                    raiseBlockedUntil = it.raiseBlockedUntil,
                    accessLevel = it.accessLevel?.let(RelationLevel::of),
                )
            }

    override suspend fun people(ids: List<String>): Map<String, CirclePerson> {
        val wanted = ids.distinct()
        if (wanted.isEmpty()) return emptyMap()
        val fromFriends = quietly { friendList.cachedSnapshot() }.orEmpty()
            .filter { it.id in wanted }
            .associate { it.id to CirclePerson(it.id, it.resolvedName, it.username, it.avatar) }
        val cold = wanted.filterNot { it in fromFriends }.take(PROFILE_FETCH_CAP)
        val fetched = coroutineScope {
            cold.map { id -> async { quietly { users.getPublicProfile(id, emptySet()) as? NetworkResult.Success }?.data?.user } }
                .awaitAll()
                .filterNotNull()
                .associate { it.id to it.toCirclePerson() }
        }
        return fromFriends + fetched
    }

    private suspend fun <T> quietly(block: suspend () -> T): T? = try {
        block()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        null
    }

    private companion object {
        const val NAMESPACE = "relations"
        const val LINKS_KEY = "links"
        const val REQUESTS_PAGE = 50

        /** Une liste de cercles est bornée : jamais une rafale de centaines de profils d'un coup. */
        const val PROFILE_FETCH_CAP = 40
        val LINKS_SERIALIZER = ListSerializer(RelationLinkWire.serializer())
    }
}

internal fun MeeshyUser.toCirclePerson(): CirclePerson =
    CirclePerson(id = id, name = effectiveDisplayName, username = username, avatarUrl = avatar)

@Module
@InstallIn(SingletonComponent::class)
internal abstract class CirclesGatewayModule {
    @Binds
    abstract fun bindCirclesGateway(repository: RelationsRepository): CirclesGateway
}
