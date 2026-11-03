package me.meeshy.sdk.model.call

/**
 * La mémoire de la dernière offre distante déjà RÉPONDUE : un rejeu exact (la passerelle rejoue l'offre en
 * tampon après une reconnexion, §4.6) reçoit la MÊME réponse, sans renégociation. Une offre différente (ou une
 * nouvelle génération) oublie la précédente.
 */
class AnsweredRemoteOffer {
    private var offerSdp: String? = null
    private var answerSdp: String? = null
    private var generation: Int = 0

    fun remember(offer: String, answer: String, generation: Int) {
        offerSdp = offer
        answerSdp = answer
        this.generation = generation
    }

    /** La réponse déjà donnée à cette offre exacte, ou `null` si elle est nouvelle. */
    fun replayFor(offer: String): AnsweredReplay? {
        val answer = answerSdp ?: return null
        return if (offer == offerSdp) AnsweredReplay(answer, generation) else null
    }

    fun clear() {
        offerSdp = null
        answerSdp = null
        generation = 0
    }
}

data class AnsweredReplay(val answerSdp: String, val generation: Int)
