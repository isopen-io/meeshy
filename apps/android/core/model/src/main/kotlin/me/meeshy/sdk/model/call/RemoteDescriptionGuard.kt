package me.meeshy.sdk.model.call

/**
 * Le gardien de l'ordre des descriptions distantes d'UN appel. La passerelle rejoue l'offre en tampon
 * après une reconnexion (§4.6) et une réponse peut arriver deux fois : appliquer deux fois la même
 * description faisait échouer `setRemoteDescription` et, selon l'appelant, raccrocher un appel sain.
 * Le gardien décide, sans toucher libwebrtc, s'il faut appliquer, ignorer, et que faire des candidats
 * arrivés avant la description distante (file puis vidage, jamais d'exception).
 *
 * Synchronisé : les signaux arrivent d'un collecteur, l'offre locale d'une autre coroutine.
 */
class RemoteDescriptionGuard {
    enum class DescriptionType { Offer, Answer }

    sealed interface Verdict {
        data object Apply : Verdict

        /** Même description déjà appliquée (rejeu de la passerelle). */
        data object Duplicate : Verdict

        /** Une réponse alors qu'aucune offre locale n'attend : périmée. */
        data object Unexpected : Verdict
    }

    sealed interface CandidateRoute {
        data object ApplyNow : CandidateRoute
        data object Queued : CandidateRoute
        data object Rejected : CandidateRoute
    }

    private var lastApplied: Pair<DescriptionType, String>? = null
    private var localOfferPending = false
    private var remoteDescriptionSet = false
    private val queued = ArrayDeque<IceCandidateLine>()

    @Synchronized
    fun onLocalOfferSet() {
        localOfferPending = true
    }

    @Synchronized
    fun judge(type: DescriptionType, sdp: String): Verdict = when {
        lastApplied == type to sdp -> Verdict.Duplicate
        type == DescriptionType.Answer && !localOfferPending -> Verdict.Unexpected
        else -> Verdict.Apply
    }

    /** La description vient d'être appliquée : rend les candidats gardés, à poser maintenant dans l'ordre d'arrivée. */
    @Synchronized
    fun onApplied(type: DescriptionType, sdp: String): List<IceCandidateLine> {
        lastApplied = type to sdp
        remoteDescriptionSet = true
        if (type == DescriptionType.Answer) localOfferPending = false
        return queued.toList().also { queued.clear() }
    }

    @Synchronized
    fun route(candidate: IceCandidateLine): CandidateRoute = when {
        !WebRtcSdpRules.admits(candidate) -> CandidateRoute.Rejected
        remoteDescriptionSet -> CandidateRoute.ApplyNow
        else -> {
            queued.addLast(candidate)
            CandidateRoute.Queued
        }
    }

    @Synchronized
    fun reset() {
        lastApplied = null
        localOfferPending = false
        remoteDescriptionSet = false
        queued.clear()
    }
}
