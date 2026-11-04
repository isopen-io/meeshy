package me.meeshy.sdk.model.translation

import me.meeshy.sdk.model.AttachmentConsentError
import me.meeshy.sdk.model.ServerTranscriptionWait

/**
 * **L'état de la demande de traduction audio d'UNE pièce dans UNE langue** (feuille « Traduire l'audio »). Il ne tient
 * que des horodatages et des états, jamais un contenu.
 */
public sealed interface AudioTranslationRequestState {

    public val isBusy: Boolean get() = this is InFlight

    public data object Idle : AudioTranslationRequestState

    public data class InFlight(val sinceMs: Long) : AudioTranslationRequestState

    /** La piste est arrivée (`audio:translation-ready` / progressive / completed) : la langue se joue. */
    public data object Ready : AudioTranslationRequestState

    public data object Failed : AudioTranslationRequestState

    /** Un 403 qui LISTE des consentements : la notice de clonage vocal, jamais une erreur générique. */
    public data class ConsentRequired(val message: String, val requiredConsents: List<String>) : AudioTranslationRequestState

    /** Pièce scellée de bout en bout : la traduction passe par l'appareil, la requête ne part pas. */
    public data object Refused : AudioTranslationRequestState

    public companion object {

        /**
         * Plusieurs vocaux dans un message : la langue se lit par son état le plus urgent — le refus de chiffrement, le
         * consentement manquant, l'échec, l'attente ; prête seulement quand TOUS les vocaux le sont ; au repos sinon.
         */
        public fun aggregate(states: List<AudioTranslationRequestState>): AudioTranslationRequestState = when {
            states.isEmpty() -> Idle
            states.any { it is Refused } -> Refused
            else -> states.firstOrNull { it is ConsentRequired }
                ?: states.firstOrNull { it is Failed }
                ?: states.firstOrNull { it is InFlight }
                ?: if (states.all { it is Ready }) Ready else Idle
        }

        /**
         * Le réducteur. Priorité : le refus de chiffrement, puis la piste arrivée (elle dément tout échec resté), puis le
         * consentement manquant, l'échec reçu, l'attente sous le plafond de silence ([ServerTranscriptionWait]), le repos.
         */
        public fun of(
            requestedAtMs: Long?,
            nowMs: Long,
            hasTrack: Boolean,
            failed: Boolean,
            consent: AttachmentConsentError?,
            refused: Boolean,
        ): AudioTranslationRequestState = when {
            refused -> Refused
            hasTrack -> Ready
            consent != null -> ConsentRequired(consent.message, consent.requiredConsents)
            failed -> Failed
            requestedAtMs != null && ServerTranscriptionWait.isWaiting(requestedAtMs, nowMs, hasArrived = false) -> InFlight(requestedAtMs)
            else -> Idle
        }
    }
}
