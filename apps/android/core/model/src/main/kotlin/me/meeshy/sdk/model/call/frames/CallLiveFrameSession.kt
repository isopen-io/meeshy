package me.meeshy.sdk.model.call.frames

import me.meeshy.sdk.model.call.CallLiveFrameReply
import me.meeshy.sdk.model.call.CallLiveFrameSelected
import me.meeshy.sdk.model.call.CallLiveFrameTexts

/** Une proposition reçue : le cadre que l'autre m'invite à appliquer, et le prénom qu'il partage. */
data class CallLiveFrameProposal(val frameId: String, val from: String?)

/** Ce que l'autre a répondu à MA proposition — montré par l'écran d'appel, pas par un toast. */
data class CallLiveFrameAnswer(val frameId: String, val reply: CallLiveFrameReply, val from: String?)

/** Ce qui part vers la passerelle (`call:frame-select`) : un cadre proposé, retiré (`frameId == null`) ou une réponse. */
data class CallLiveFrameOutgoing(
    val frameId: String?,
    val texts: CallLiveFrameTexts? = null,
    val reply: CallLiveFrameReply? = null,
)

data class CallLiveFrameState(
    /** Le cadre que MOI je montre. */
    val frameId: String? = null,
    val proposal: CallLiveFrameProposal? = null,
    val sentProposal: String? = null,
    val answer: CallLiveFrameAnswer? = null,
    val remoteSharedName: String? = null,
    /** Le cadre que l'autre montre de son côté, quand il me l'a dit (proposé, ou accepté le mien). */
    val peerFrameId: String? = null,
)

/** Un pas de la session : le nouvel état, et ce qu'il faut émettre. */
data class CallLiveFrameStep(val state: CallLiveFrameState, val send: List<CallLiveFrameOutgoing> = emptyList())

/**
 * **LE CADRE EN DIRECT D'UN APPEL À DEUX** (miroir de iOS `CallLiveFrameSession`, #9214, #9287) — la
 * machine d'états pure du flux de validation.
 *
 * Chacun reste libre de son cadre : le mien s'applique tout de suite CHEZ MOI et part à l'autre comme
 * une PROPOSITION, avec le prénom que je partage. Une proposition reçue ne touche jamais à mon cadre :
 * je l'applique ([accept]) ou je la refuse ([decline]), et l'autre l'apprend. Rien n'est persisté : un
 * nouvel appel repart sans cadre.
 *
 * Un cadre PARTAGÉ — celui que nous montrons tous les deux, parce que l'un a accepté celui de l'autre — tombe
 * chez les deux quand l'un le relâche (loi 16, #18183) : le relâchement part comme le retrait d'une proposition
 * (`call:frame-select`, `frameId: null`), et ce retrait reçu fait tomber chez moi le cadre que nous partagions,
 * sans rien renvoyer. Un cadre qui n'est qu'à moi tombe chez moi seul.
 */
object CallLiveFrameMachine {
    /**
     * Mon cadre s'applique chez moi, puis se PROPOSE — sauf si l'autre le montre déjà. `null` le retire : il retire ma
     * proposition en attente, et un cadre partagé tombe aussi chez l'autre (#18183).
     */
    fun apply(state: CallLiveFrameState, id: String?, myName: String?): CallLiveFrameStep {
        if (id != null && !CallLiveFrameRule.isFrameId(id)) return CallLiveFrameStep(state)
        val next = state.copy(frameId = id, answer = null)
        if (id == null) return released(state, next)
        if (id == state.peerFrameId) return CallLiveFrameStep(next)
        return CallLiveFrameStep(next.copy(sentProposal = id), listOf(proposal(id, myName)))
    }

    /** La passerelle a refusé ma proposition : le cadre reste chez moi, il n'est simplement pas proposé. */
    fun proposalRefused(state: CallLiveFrameState, id: String): CallLiveFrameState =
        if (state.sentProposal == id) state.copy(sentProposal = null) else state

    fun accept(state: CallLiveFrameState, myName: String?): CallLiveFrameStep {
        val proposal = state.proposal ?: return CallLiveFrameStep(state)
        return CallLiveFrameStep(
            state.copy(proposal = null, frameId = proposal.frameId, peerFrameId = proposal.frameId),
            listOf(reply(proposal.frameId, CallLiveFrameReply.ACCEPTED, myName)),
        )
    }

    fun decline(state: CallLiveFrameState, myName: String?): CallLiveFrameStep {
        val proposal = state.proposal ?: return CallLiveFrameStep(state)
        return CallLiveFrameStep(state.copy(proposal = null), listOf(reply(proposal.frameId, CallLiveFrameReply.DECLINED, myName)))
    }

    /** `call:frame-selected` : une proposition de l'autre, son retrait, ou sa réponse à la mienne. */
    fun receive(state: CallLiveFrameState, event: CallLiveFrameSelected, callId: String?, myName: String?): CallLiveFrameStep {
        if (callId == null || event.callId != callId) return CallLiveFrameStep(state)
        val id = event.frameId
        if (id != null && !CallLiveFrameRule.isFrameId(id)) return CallLiveFrameStep(state)
        val shared = event.texts?.name?.trim()?.takeIf { it.isNotEmpty() }?.take(CallLiveFrameTexts.MAX_LENGTH)
        val named = if (shared != null) state.copy(remoteSharedName = shared) else state
        event.reply?.let { return CallLiveFrameStep(answered(named, it, id)) }
        val peer = named.copy(peerFrameId = id)
        if (id == null) return CallLiveFrameStep(peer.copy(proposal = null, frameId = named.frameId.takeUnless { sharesFrame(named) }))
        if (id == peer.frameId) {
            return CallLiveFrameStep(peer.copy(proposal = null), listOf(reply(id, CallLiveFrameReply.ACCEPTED, myName)))
        }
        return CallLiveFrameStep(peer.copy(proposal = CallLiveFrameProposal(id, peer.remoteSharedName)))
    }

    /** L'écran a montré la réponse : elle s'efface. */
    fun dismissAnswer(state: CallLiveFrameState): CallLiveFrameState = state.copy(answer = null)

    /** Nous montrons le même cadre : l'un a accepté celui de l'autre (ou l'a proposé alors que l'autre le montrait déjà). */
    private fun sharesFrame(state: CallLiveFrameState): Boolean = state.frameId != null && state.frameId == state.peerFrameId

    /** Relâcher : le retrait part si une proposition attend sa réponse OU si le cadre est partagé — l'autre le voit alors tomber. */
    private fun released(state: CallLiveFrameState, next: CallLiveFrameState): CallLiveFrameStep {
        val shared = sharesFrame(state)
        if (state.sentProposal == null && !shared) return CallLiveFrameStep(next)
        val settled = next.copy(sentProposal = null, peerFrameId = next.peerFrameId.takeUnless { shared })
        return CallLiveFrameStep(settled, listOf(CallLiveFrameOutgoing(frameId = null)))
    }

    private fun answered(state: CallLiveFrameState, reply: CallLiveFrameReply, id: String?): CallLiveFrameState {
        if (id == null || id != state.sentProposal) return state
        val settled = state.copy(sentProposal = null, answer = CallLiveFrameAnswer(id, reply, state.remoteSharedName))
        return if (reply == CallLiveFrameReply.ACCEPTED) settled.copy(peerFrameId = id) else settled
    }

    private fun proposal(id: String, myName: String?) = CallLiveFrameOutgoing(id, CallLiveFrameTexts(name = myName))

    private fun reply(id: String, reply: CallLiveFrameReply, myName: String?) =
        CallLiveFrameOutgoing(id, CallLiveFrameTexts(name = myName), reply)
}
