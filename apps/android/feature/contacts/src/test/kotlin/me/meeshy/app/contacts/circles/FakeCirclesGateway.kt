package me.meeshy.app.contacts.circles

import kotlinx.coroutines.flow.MutableSharedFlow
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestDirection
import me.meeshy.sdk.model.relation.CirclePerson
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.model.relation.RelationLink
import me.meeshy.sdk.model.relation.RelationProgress
import me.meeshy.sdk.model.relation.RelationRaiseGate
import me.meeshy.sdk.model.relation.RelationRitualConsents
import me.meeshy.sdk.model.relation.RelationRitualPhase
import me.meeshy.sdk.model.relation.RelationRitualStep
import me.meeshy.sdk.model.relation.RelationsConfig
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.relation.CirclesGateway

/** Un double du port des cercles : réponses réglées par test, appels comptés. */
internal class FakeCirclesGateway(
    var cached: List<RelationLink>? = null,
    var served: NetworkResult<List<RelationLink>> = NetworkResult.Success(emptyList()),
    var received: List<FriendRequest> = emptyList(),
    var sent: List<FriendRequest> = emptyList(),
    var known: Map<String, CirclePerson> = emptyMap(),
    var raiseCmid: String? = "cmid-raise",
    var respondCmid: String? = "cmid-respond",
    var cancelSucceeds: Boolean = true,
) : CirclesGateway {

    val raises = mutableListOf<Pair<String, RelationLevel>>()
    val responses = mutableListOf<Pair<String, Boolean>>()
    val ritualCalls = mutableListOf<Triple<RelationRitualPhase, String?, RelationRitualConsents?>>()
    val ritualReplies = ArrayDeque<NetworkResult<RelationRitualStep>>()
    var refreshCount = 0

    override val exhausted = MutableSharedFlow<String>(extraBufferCapacity = 8)

    override suspend fun cachedLinks(): List<RelationLink>? = cached

    override suspend fun refreshLinks(): NetworkResult<List<RelationLink>> {
        refreshCount++
        return served
    }

    override suspend fun config(): RelationsConfig? = null

    override suspend fun pendingRequests(direction: FriendRequestDirection): List<FriendRequest>? =
        if (direction == FriendRequestDirection.Received) received else sent

    override suspend fun enqueueRaise(userId: String, target: RelationLevel): String? {
        raises += userId to target
        return raiseCmid
    }

    override suspend fun enqueueRespond(request: FriendRequest, accept: Boolean): String? {
        responses += request.id to accept
        return respondCmid
    }

    override suspend fun cancel(request: FriendRequest): Boolean = cancelSucceeds

    override suspend fun ritual(
        userId: String,
        phase: RelationRitualPhase,
        token: String?,
        consents: RelationRitualConsents?,
    ): NetworkResult<RelationRitualStep> {
        ritualCalls += Triple(phase, token, consents)
        return ritualReplies.removeFirstOrNull() ?: NetworkResult.Success(RelationRitualStep())
    }

    override suspend fun people(ids: List<String>): Map<String, CirclePerson> = known.filterKeys { it in ids }

    override suspend fun lower(userId: String, level: RelationLevel): NetworkResult<RelationLink> =
        NetworkResult.Success(link(userId, level))

    override suspend fun raiseGate(userId: String): RelationRaiseGate? = null
}

internal fun link(
    id: String,
    level: RelationLevel,
    eligibleFor: RelationLevel? = null,
    activeWeeks: Int = 0,
    needed: Int? = null,
) = RelationLink(id, level, level, null, RelationProgress(activeWeeks, needed, emptyList()), eligibleFor)

internal fun refused(code: String) = NetworkResult.Failure(ApiError(message = "refused", code = code, httpStatus = 409))
