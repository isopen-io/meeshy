package me.meeshy.sdk.model.auth

/**
 * Ce que l'écran du code DIT de la situation (iOS `EmailVerificationLead`, #8186). Un mot de passe tapé à la
 * connexion sans compte créé est celui d'un compte EXISTANT dont l'adresse n'est pas prouvée : la passerelle a
 * reconnu le mot de passe et attend le code.
 */
enum class EmailVerificationLead {
    ACCOUNT_CREATED,
    ACTIVATION_REQUIRED,
    CODE_SENT,
    ;

    /** L'astuce « regardez dans les indésirables » : seulement quand un compte existant attend son activation. */
    val showsInboxHint: Boolean get() = this == ACTIVATION_REQUIRED

    companion object {
        fun from(accountCreated: Boolean, passwordProven: Boolean): EmailVerificationLead = when {
            accountCreated -> ACCOUNT_CREATED
            passwordProven -> ACTIVATION_REQUIRED
            else -> CODE_SENT
        }
    }
}

/**
 * Les règles de la veille d'une preuve faite AILLEURS (iOS `EmailVerificationViewModel.watchProof`, #8083) :
 * une lecture de l'état toutes les 3 s, au plus 15 min (la durée d'un code de connexion), et un arrêt net quand
 * le jeton n'a plus rien à dire (401/410) ou que l'adresse est prouvée.
 */
object EmailVerificationWatchPolicy {
    const val INTERVAL_MS: Long = 3_000L
    const val LIMIT_MS: Long = 15L * 60_000L

    /** « Code renvoyé ! » reste affiché ce temps-là avant que le bouton redevienne actif. */
    const val RESEND_CONFIRMATION_MS: Long = 3_000L

    /** La pause « Email vérifié ! » avant la fermeture de la feuille et l'ouverture de la session. */
    const val SUCCESS_PAUSE_MS: Long = 800L

    fun withinLimit(elapsedMs: Long): Boolean = elapsedMs < LIMIT_MS

    /** Vrai tant qu'une nouvelle lecture a un sens après [status]. */
    fun keepsWatching(status: EmailVerificationWatchStatus): Boolean =
        status == EmailVerificationWatchStatus.PENDING
}
