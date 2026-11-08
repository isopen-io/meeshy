package me.meeshy.sdk.story

import me.meeshy.sdk.net.ApiError

/**
 * Ce qu'il advient d'une réaction de story que le POST direct a tentée — port de iOS
 * `StoryReactionRecovery`. Le tri distingue un REFUS du serveur (409 `REACTION_LIMIT_REACHED`,
 * 403, 404, ou tout autre statut HTTP : rejouer ne changerait rien, l'optimisme est rembobiné)
 * d'une PANNE de transport (aucune réponse : la file durable rejouera, l'emoji affiché reste vrai).
 */
sealed interface StoryReactionOutcome {
    data object Applied : StoryReactionOutcome

    /** Le serveur a répondu et refusé : restaurer l'état d'avant le tap. */
    data class Refused(val httpStatus: Int?, val code: String?, val message: String) : StoryReactionOutcome {
        val isLimitReached: Boolean get() = code == LIMIT_REACHED_CODE
    }

    /** Aucune réponse du serveur : rejouable. */
    data class TransportFailure(val message: String) : StoryReactionOutcome

    companion object {
        const val LIMIT_REACHED_CODE: String = "REACTION_LIMIT_REACHED"
        private const val TRANSPORT_CODE = "NETWORK"

        fun of(error: ApiError): StoryReactionOutcome =
            if (error.httpStatus == null && error.code == TRANSPORT_CODE) {
                TransportFailure(error.message)
            } else {
                Refused(error.httpStatus, error.code, error.message)
            }
    }
}
