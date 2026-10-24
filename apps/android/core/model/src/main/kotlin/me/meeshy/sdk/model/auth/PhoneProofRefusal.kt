package me.meeshy.sdk.model.auth

/**
 * Pourquoi une étape d'une preuve par SMS (récupération du mot de passe par
 * téléphone, transfert de numéro) a été refusée — lu une seule fois ici, pour que
 * chaque écran pose la bonne phrase au lieu d'un « erreur » unique.
 *
 * La passerelle ne sert pas de `code` sur ces routes : le motif voyage dans le
 * champ `error` sous forme de chaîne machine (`identity_mismatch`,
 * `max_attempts_exceeded`, `transfer_expired`…), parfois de phrase française
 * (`Numéro de téléphone invalide`). [from] lit le `code` d'abord (si elle en sert
 * un demain), puis cette chaîne ; un motif inconnu devient [FAILED], jamais un
 * crash — le contrat peut gagner des motifs sans casser un client plus ancien
 * (#9223).
 */
enum class PhoneProofRefusal {
    /** Le numéro n'a pas la forme d'un numéro. */
    INVALID_PHONE,

    /** Aucun compte ne répond à ce numéro (indistinguable d'un numéro libre côté transfert). */
    ACCOUNT_NOT_FOUND,

    /** Le compte existe mais son numéro n'a jamais été vérifié : le SMS ne peut pas servir de preuve. */
    PHONE_NOT_VERIFIED,

    /** Le pseudo ou l'adresse complets ne correspondent pas ; le nombre d'essais est limité. */
    IDENTITY_MISMATCH,

    /** Le code SMS est faux. */
    CODE_INVALID,

    /** Le code SMS a expiré : il faut en demander un autre. */
    CODE_EXPIRED,

    /** Trop d'essais : l'étape est fermée, il faut recommencer. */
    ATTEMPTS_EXHAUSTED,

    /** Le jeton d'étape est inconnu ou périmé, ou l'étape n'est pas la bonne : le parcours est à recommencer. */
    SESSION_EXPIRED,

    /** La passerelle n'a pas pu envoyer le SMS. */
    SMS_FAILED,

    /** Trop de demandes (429) ou renvoi trop rapproché : attendre avant de réessayer. */
    RATE_LIMITED,

    /** Pas de réseau : rien n'a été refusé, l'étape peut être rejouée telle quelle. */
    OFFLINE,

    /** Tout autre refus, y compris un motif que ce client ne connaît pas encore. */
    FAILED,
    ;

    companion object {
        private val BY_REASON: Map<String, PhoneProofRefusal> = mapOf(
            "invalid_phone" to INVALID_PHONE,
            "numéro de téléphone invalide" to INVALID_PHONE,
            "user_not_found" to ACCOUNT_NOT_FOUND,
            "phone_not_found" to ACCOUNT_NOT_FOUND,
            "phone_not_verified" to PHONE_NOT_VERIFIED,
            "identity_mismatch" to IDENTITY_MISMATCH,
            "invalid_code" to CODE_INVALID,
            "code_expired" to CODE_EXPIRED,
            "max_attempts_exceeded" to ATTEMPTS_EXHAUSTED,
            "invalid_token" to SESSION_EXPIRED,
            "token_expired" to SESSION_EXPIRED,
            "invalid_step" to SESSION_EXPIRED,
            "transfer_expired" to SESSION_EXPIRED,
            "invalid_transfer_type" to SESSION_EXPIRED,
            "invalid_transfer_token" to SESSION_EXPIRED,
            "sms_send_failed" to SMS_FAILED,
            "rate_limited" to RATE_LIMITED,
        )

        private const val NETWORK_CODE: String = "NETWORK"
        private const val RATE_LIMIT_STATUS: Int = 429

        /**
         * Le motif d'un refus, depuis ce qu'en dit l'enveloppe d'erreur :
         * [httpStatus] (le verdict de transport), [code] (le motif typé, s'il y en
         * a un) et [message] (la chaîne machine ou la phrase servie).
         */
        fun from(httpStatus: Int?, code: String?, message: String?): PhoneProofRefusal {
            if (code == NETWORK_CODE) return OFFLINE
            if (httpStatus == RATE_LIMIT_STATUS) return RATE_LIMITED
            return reason(code) ?: reason(message) ?: FAILED
        }

        private fun reason(raw: String?): PhoneProofRefusal? =
            raw?.trim()?.lowercase()?.replace('-', '_')?.let(BY_REASON::get)
    }
}
