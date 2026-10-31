package me.meeshy.app.calls

/**
 * Où part la réponse d'un appel entrant refusé avec un message (#13866) : la conversation de
 * l'appel, comme iOS (`CallDeclineReplyRule.plan` n'écrit que dans `conversationId`), ou, quand
 * elle manque, la conversation directe avec l'appelant que [CallDeclineMessenger] résout à
 * l'envoi.
 *
 * L'invitation du socket et le push d'appel arrivent par `CallRoute.incoming`, qui transporte la
 * conversation mais pas l'identifiant de l'appelant : exiger ce dernier retirait la capsule
 * « Message » de tout appel entrant nominal. `null` = aucune destination, ou un appel sortant.
 */
data class CallDeclineReplyTarget(val peerId: String, val conversationId: String) {
    companion object {
        fun of(config: CallConfig): CallDeclineReplyTarget? = when {
            config.isOutgoing -> null
            config.conversationId.isBlank() && config.peerId.isBlank() -> null
            else -> CallDeclineReplyTarget(config.peerId, config.conversationId)
        }
    }
}
