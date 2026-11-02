package me.meeshy.sdk.model.call.frames

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallLiveFrameReply
import me.meeshy.sdk.model.call.CallLiveFrameSelected
import me.meeshy.sdk.model.call.CallLiveFrameTexts
import org.junit.Test

class CallLiveFrameSessionTest {
    private val call = "call-1"
    private val frame = "elegant.classic.duo"
    private val other = "futuriste.neon.duo"
    private fun event(id: String?, reply: CallLiveFrameReply? = null, name: String? = null, callId: String = call) =
        CallLiveFrameSelected(callId, "peer", id, name?.let { CallLiveFrameTexts(name = it) }, reply)

    @Test
    fun `mon cadre s'applique chez moi puis se propose avec mon prenom`() {
        val step = CallLiveFrameMachine.apply(CallLiveFrameState(), frame, "Ana")
        assertThat(step.state.frameId).isEqualTo(frame)
        assertThat(step.state.sentProposal).isEqualTo(frame)
        assertThat(step.send).containsExactly(CallLiveFrameOutgoing(frame, CallLiveFrameTexts(name = "Ana")))
    }

    @Test
    fun `un cadre que l'autre montre deja s'applique sans etre propose`() {
        val state = CallLiveFrameState(peerFrameId = frame)
        val step = CallLiveFrameMachine.apply(state, frame, "Ana")
        assertThat(step.state.frameId).isEqualTo(frame)
        assertThat(step.send).isEmpty()
        assertThat(step.state.sentProposal).isNull()
    }

    @Test
    fun `un identifiant mal forme n'est ni applique ni propose`() {
        val step = CallLiveFrameMachine.apply(CallLiveFrameState(), "Pas Un Id", "Ana")
        assertThat(step.state).isEqualTo(CallLiveFrameState())
        assertThat(step.send).isEmpty()
    }

    @Test
    fun `retirer mon cadre retire ma proposition en attente, sinon rien ne part`() {
        val proposed = CallLiveFrameMachine.apply(CallLiveFrameState(), frame, "Ana").state
        val withdrawn = CallLiveFrameMachine.apply(proposed, null, "Ana")
        assertThat(withdrawn.state.frameId).isNull()
        assertThat(withdrawn.send).containsExactly(CallLiveFrameOutgoing(frameId = null))
        assertThat(CallLiveFrameMachine.apply(withdrawn.state, null, "Ana").send).isEmpty()
    }

    @Test
    fun `un refus de la passerelle garde le cadre chez moi sans le proposer`() {
        val proposed = CallLiveFrameMachine.apply(CallLiveFrameState(), frame, "Ana").state
        val state = CallLiveFrameMachine.proposalRefused(proposed, frame)
        assertThat(state.frameId).isEqualTo(frame)
        assertThat(state.sentProposal).isNull()
    }

    @Test
    fun `une proposition recue ne touche pas a mon cadre`() {
        val mine = CallLiveFrameState(frameId = frame)
        val step = CallLiveFrameMachine.receive(mine, event(other, name = "Bob"), call, "Ana")
        assertThat(step.state.frameId).isEqualTo(frame)
        assertThat(step.state.proposal).isEqualTo(CallLiveFrameProposal(other, "Bob"))
        assertThat(step.send).isEmpty()
    }

    @Test
    fun `accepter applique le cadre et le dit a l'autre, refuser le dit sans rien changer`() {
        val pending = CallLiveFrameMachine.receive(CallLiveFrameState(), event(other, name = "Bob"), call, "Ana").state
        val accepted = CallLiveFrameMachine.accept(pending, "Ana")
        assertThat(accepted.state.frameId).isEqualTo(other)
        assertThat(accepted.state.proposal).isNull()
        assertThat(accepted.send).containsExactly(CallLiveFrameOutgoing(other, CallLiveFrameTexts(name = "Ana"), CallLiveFrameReply.ACCEPTED))
        val declined = CallLiveFrameMachine.decline(pending, "Ana")
        assertThat(declined.state.frameId).isNull()
        assertThat(declined.state.proposal).isNull()
        assertThat(declined.send.single().reply).isEqualTo(CallLiveFrameReply.DECLINED)
    }

    @Test
    fun `l'autre propose le cadre que je montre deja - j'accepte d'office`() {
        val mine = CallLiveFrameState(frameId = frame)
        val step = CallLiveFrameMachine.receive(mine, event(frame), call, "Ana")
        assertThat(step.state.proposal).isNull()
        assertThat(step.send.single().reply).isEqualTo(CallLiveFrameReply.ACCEPTED)
    }

    @Test
    fun `l'autre retire sa proposition - elle disparait`() {
        val pending = CallLiveFrameMachine.receive(CallLiveFrameState(), event(other), call, "Ana").state
        val step = CallLiveFrameMachine.receive(pending, event(null), call, "Ana")
        assertThat(step.state.proposal).isNull()
        assertThat(step.state.peerFrameId).isNull()
    }

    @Test
    fun `la reponse a MA proposition s'affiche, une reponse a un autre cadre est ignoree`() {
        val proposed = CallLiveFrameMachine.apply(CallLiveFrameState(), frame, "Ana").state
        val ignored = CallLiveFrameMachine.receive(proposed, event(other, CallLiveFrameReply.ACCEPTED), call, "Ana")
        assertThat(ignored.state.answer).isNull()
        val declined = CallLiveFrameMachine.receive(proposed, event(frame, CallLiveFrameReply.DECLINED, name = "Bob"), call, "Ana").state
        assertThat(declined.answer).isEqualTo(CallLiveFrameAnswer(frame, CallLiveFrameReply.DECLINED, "Bob"))
        assertThat(declined.sentProposal).isNull()
        assertThat(declined.peerFrameId).isNull()
        val accepted = CallLiveFrameMachine.receive(proposed, event(frame, CallLiveFrameReply.ACCEPTED), call, "Ana").state
        assertThat(accepted.peerFrameId).isEqualTo(frame)
        assertThat(CallLiveFrameMachine.dismissAnswer(accepted).answer).isNull()
    }

    @Test
    fun `un evenement d'un autre appel, ou sans appel, est ignore`() {
        val state = CallLiveFrameState()
        assertThat(CallLiveFrameMachine.receive(state, event(other, callId = "autre"), call, "Ana").state).isEqualTo(state)
        assertThat(CallLiveFrameMachine.receive(state, event(other), null, "Ana").state).isEqualTo(state)
    }

    @Test
    fun `le prenom partage est rogne et borne, un identifiant mal forme est ignore`() {
        val long = "x".repeat(200)
        val state = CallLiveFrameMachine.receive(CallLiveFrameState(), event(other, name = "  $long  "), call, "Ana").state
        assertThat(state.remoteSharedName).hasLength(CallLiveFrameTexts.MAX_LENGTH)
        assertThat(CallLiveFrameMachine.receive(CallLiveFrameState(), event("!!"), call, "Ana").state).isEqualTo(CallLiveFrameState())
    }
}
