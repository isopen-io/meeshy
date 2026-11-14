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
    fun `relacher un cadre que l'autre a accepte le retire chez les deux - le retrait part`() {
        val proposed = CallLiveFrameMachine.apply(CallLiveFrameState(), frame, "Ana").state
        val shared = CallLiveFrameMachine.receive(proposed, event(frame, CallLiveFrameReply.ACCEPTED), call, "Ana").state
        val released = CallLiveFrameMachine.apply(shared, null, "Ana")
        assertThat(released.send).containsExactly(CallLiveFrameOutgoing(frameId = null))
        assertThat(released.state.frameId).isNull()
        assertThat(released.state.peerFrameId).isNull()
        assertThat(released.state.sentProposal).isNull()
        assertThat(CallLiveFrameMachine.apply(released.state, null, "Ana").send).isEmpty()
    }

    @Test
    fun `relacher un cadre de l'autre que j'ai accepte le retire chez les deux`() {
        val pending = CallLiveFrameMachine.receive(CallLiveFrameState(), event(other, name = "Bob"), call, "Ana").state
        val shared = CallLiveFrameMachine.accept(pending, "Ana").state
        val released = CallLiveFrameMachine.apply(shared, null, "Ana")
        assertThat(released.send).containsExactly(CallLiveFrameOutgoing(frameId = null))
        assertThat(released.state.frameId).isNull()
        assertThat(released.state.peerFrameId).isNull()
    }

    @Test
    fun `relacher mon cadre quand l'autre en montre un autre ne lui envoie rien`() {
        val state = CallLiveFrameState(frameId = frame, peerFrameId = other)
        val released = CallLiveFrameMachine.apply(state, null, "Ana")
        assertThat(released.send).isEmpty()
        assertThat(released.state.frameId).isNull()
        assertThat(released.state.peerFrameId).isEqualTo(other)
    }

    @Test
    fun `apres un relachement, garder de nouveau le meme cadre le propose`() {
        val released = CallLiveFrameMachine.apply(CallLiveFrameState(frameId = frame, peerFrameId = frame), null, "Ana").state
        val again = CallLiveFrameMachine.apply(released, frame, "Ana")
        assertThat(again.send).containsExactly(CallLiveFrameOutgoing(frame, CallLiveFrameTexts(name = "Ana")))
        assertThat(again.state.sentProposal).isEqualTo(frame)
    }

    @Test
    fun `l'autre relache le cadre que nous partagions - il tombe chez moi, sans rien renvoyer`() {
        val shared = CallLiveFrameState(frameId = frame, peerFrameId = frame)
        val step = CallLiveFrameMachine.receive(shared, event(null), call, "Ana")
        assertThat(step.state.frameId).isNull()
        assertThat(step.state.peerFrameId).isNull()
        assertThat(step.send).isEmpty()
    }

    /**
     * #18367 — le retrait reçu d'un cadre PARTAGÉ le fait tomber chez moi, et le pas dit qui l'a relâché, pour que le lecteur
     * d'écran annonce pourquoi l'image a changé (« Awa a retiré le cadre », iOS #18415). Sans prénom partagé, l'annonce est
     * anonyme. Mêmes vecteurs que iOS `peerReleaseDropsMine`.
     */
    @Test
    fun `#18367 - le retrait recu du cadre partage dit qui l'a relache`() {
        val shared = CallLiveFrameState(frameId = frame, peerFrameId = frame, remoteSharedName = "Awa")
        assertThat(CallLiveFrameMachine.receive(shared, event(null), call, "Ana").peerRelease).isEqualTo(CallLiveFramePeerRelease("Awa"))

        val anonymous = CallLiveFrameState(frameId = frame, peerFrameId = frame)
        assertThat(CallLiveFrameMachine.receive(anonymous, event(null), call, "Ana").peerRelease).isEqualTo(CallLiveFramePeerRelease(null))
    }

    @Test
    fun `#18367 - rien ne s'annonce quand c'est moi qui relache, ni quand rien de partage ne tombe`() {
        val shared = CallLiveFrameState(frameId = frame, peerFrameId = frame, remoteSharedName = "Awa")
        assertThat(CallLiveFrameMachine.apply(shared, null, "Ana").peerRelease).isNull()

        val mine = CallLiveFrameState(frameId = other, peerFrameId = frame, remoteSharedName = "Awa")
        assertThat(CallLiveFrameMachine.receive(mine, event(null), call, "Ana").peerRelease).isNull()

        val pending = CallLiveFrameMachine.receive(CallLiveFrameState(), event(other, name = "Awa"), call, "Ana")
        assertThat(pending.peerRelease).isNull()
        assertThat(CallLiveFrameMachine.receive(pending.state, event(null), call, "Ana").peerRelease).isNull()
        assertThat(CallLiveFrameMachine.receive(shared, event(other), call, "Ana").peerRelease).isNull()
    }

    @Test
    fun `l'autre relache son cadre alors que j'en montre un autre - je garde le mien`() {
        val mine = CallLiveFrameState(frameId = other, peerFrameId = frame)
        val step = CallLiveFrameMachine.receive(mine, event(null), call, "Ana")
        assertThat(step.state.frameId).isEqualTo(other)
        assertThat(step.state.peerFrameId).isNull()
        assertThat(step.send).isEmpty()
    }

    @Test
    fun `duo de bout en bout - Ana garde, Awa accepte, Ana relache - le cadre tombe chez les deux`() {
        val anaProposes = CallLiveFrameMachine.apply(CallLiveFrameState(), frame, "Ana")
        val awaReceives = CallLiveFrameMachine.receive(CallLiveFrameState(), wire(anaProposes.send.single()), call, "Awa").state
        val awaAccepts = CallLiveFrameMachine.accept(awaReceives, "Awa")
        val anaShared = CallLiveFrameMachine.receive(anaProposes.state, wire(awaAccepts.send.single()), call, "Ana").state
        val anaReleases = CallLiveFrameMachine.apply(anaShared, null, "Ana")
        val awaAfter = CallLiveFrameMachine.receive(awaAccepts.state, wire(anaReleases.send.single()), call, "Awa")
        assertThat(anaReleases.state.frameId).isNull()
        assertThat(awaAfter.state.frameId).isNull()
        assertThat(awaAfter.state.proposal).isNull()
        assertThat(awaAfter.send).isEmpty()
        assertThat(awaAfter.peerRelease).isEqualTo(CallLiveFramePeerRelease("Ana"))
        assertThat(anaReleases.peerRelease).isNull()
    }

    private fun wire(outgoing: CallLiveFrameOutgoing) =
        CallLiveFrameSelected(call, "peer", outgoing.frameId, outgoing.texts, outgoing.reply)

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
