package me.meeshy.sdk.model.auth

import me.meeshy.sdk.model.AuthSession

/**
 * Une session que la preuve de l'adresse a rendue, pas encore posée — miroir de
 * `EmailProvenSession` (iOS `AuthManager+EmailAccess.swift`).
 *
 * [receivedAtMs] est l'instant de réception (l'âge de la session) et [adoptableForMs] la durée,
 * à compter de là, pendant laquelle l'adopter vaut encore : le délai servi moins la marge, ou le
 * repli. Toujours entre zéro et la borne dure.
 */
data class EmailProvenSession(
    val session: AuthSession,
    val origin: SessionOrigin = SessionOrigin.LOGIN,
    val receivedAtMs: Long,
    val adoptableForMs: Long = ProvenAdoptionWindow.fallbackMs(ProvenAdoptionKind.SESSION),
) {
    fun hasLapsedAdoptionWindow(nowMs: Long): Boolean =
        ProvenAdoptionWindow.hasLapsed(receivedAtMs, adoptableForMs, nowMs)

    /** La même session, sous une autre origine. */
    fun originating(from: SessionOrigin): EmailProvenSession = copy(origin = from)

    val userId: String get() = session.user.id
}

/**
 * Le compte attend son second facteur : l'adresse est prouvée, aucune session n'est rendue.
 * Le défi a sa fenêtre ([adoptableForMs] à compter de [receivedAtMs]) : un plafond, un défi plus
 * récent du même compte le remplace.
 */
data class SecondFactorRequired(
    val twoFactorToken: String?,
    val receivedAtMs: Long,
    val adoptableForMs: Long = ProvenAdoptionWindow.fallbackMs(ProvenAdoptionKind.SECOND_FACTOR),
) {
    fun hasLapsedAdoptionWindow(nowMs: Long): Boolean =
        ProvenAdoptionWindow.hasLapsed(receivedAtMs, adoptableForMs, nowMs)
}

/** Ce qu'une réponse de preuve par e-mail a remis. */
sealed interface EmailProof {
    data class Session(val proven: EmailProvenSession) : EmailProof
    data class SecondFactor(val required: SecondFactorRequired) : EmailProof

    /** Le lien n'a pas été demandé par cet appareil : aucune session, l'identité du compte à confirmer. */
    data class LinkConfirmation(val required: LoginOutcome.LinkConfirmationRequired) : EmailProof

    companion object {
        /**
         * Lit une issue de preuve à l'instant [receivedAtMs]. `null` quand l'issue n'est pas une
         * preuve (adresse encore à prouver) : l'appelant la traite comme avant.
         */
        fun served(outcome: LoginOutcome, receivedAtMs: Long, origin: SessionOrigin = SessionOrigin.LOGIN): EmailProof? =
            when (outcome) {
                is LoginOutcome.LinkConfirmationRequired -> LinkConfirmation(outcome)
                is LoginOutcome.TwoFactorRequired -> SecondFactor(
                    SecondFactorRequired(
                        twoFactorToken = outcome.twoFactorToken,
                        receivedAtMs = receivedAtMs,
                        adoptableForMs = ProvenAdoptionWindow.clientWindowMs(
                            ProvenAdoptionKind.SECOND_FACTOR,
                            outcome.adoptWithinSeconds?.toLong(),
                        ),
                    ),
                )
                is LoginOutcome.Authenticated -> Session(
                    EmailProvenSession(
                        session = outcome.session,
                        origin = origin,
                        receivedAtMs = receivedAtMs,
                        adoptableForMs = ProvenAdoptionWindow.clientWindowMs(
                            ProvenAdoptionKind.SESSION,
                            outcome.adoptWithinSeconds?.toLong(),
                        ),
                    ),
                )
                is LoginOutcome.VerificationRequired -> null
            }
    }
}

/** Pourquoi une session prouvée n'a pas été posée. */
sealed interface ProvenRefusal {
    /** Une connexion, un second facteur ou une inscription pendant un changement de compte. */
    data object AccountSwitchUnderway : ProvenRefusal

    /** Un AUTRE utilisateur que celui de la session ouverte : rien n'est posé par-dessus. */
    data class SessionReplacementRefused(val activeUserId: String?, val incomingUserId: String) : ProvenRefusal

    /** La fenêtre d'adoption est passée : il faut une nouvelle preuve. */
    data object WindowLapsed : ProvenRefusal
}

/** Le verdict de l'ouverture d'une session prouvée. */
sealed interface ProvenOpenResult {
    data object Opened : ProvenOpenResult
    data class Refused(val reason: ProvenRefusal) : ProvenOpenResult
}
