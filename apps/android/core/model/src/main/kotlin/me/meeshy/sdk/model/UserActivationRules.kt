package me.meeshy.sdk.model

/**
 * Ce que l'app demande, discretement, selon la phase d'activation (#8239) — le bandeau n'existe
 * qu'en phase `invite` avec quelque chose a demander. Miroir de `ActivationInviteViewModel`.
 */
data class ActivationInvite(
    val daysLeft: Int?,
    val missingEmail: Boolean,
    val missingPhone: Boolean,
)

object UserActivationRules {

    /** `null` hors phase `invite` (quiet, blocked, done) ou sans rien a demander : aucun bandeau. */
    fun invite(activation: UserActivation?, nowEpochMillis: Long): ActivationInvite? {
        val served = activation?.takeIf { it.invites } ?: return null
        return ActivationInvite(
            daysLeft = served.daysLeft(nowEpochMillis),
            missingEmail = UserActivation.Channel.EMAIL in served.missing,
            missingPhone = UserActivation.Channel.PHONE in served.missing,
        )
    }

    /** Apres J28 la connexion mene a l'ecran du code (ecran du domaine auth). */
    fun leadsToCodeScreen(activation: UserActivation?): Boolean =
        activation?.phase == UserActivation.Phase.BLOCKED
}

/** La demande de suppression telle que l'ecran la raconte — `status == null` est une REPONSE. */
sealed interface AccountDeletionPhase {
    data object None : AccountDeletionPhase

    /** Le lien recu par e-mail n'est pas encore confirme. */
    data object PendingConfirmation : AccountDeletionPhase

    /** Confirmee : delai de grace jusqu'a [cancelableUntil] ; l'annulation passe par le lien de l'e-mail. */
    data class GracePeriod(val cancelableUntil: String?) : AccountDeletionPhase

    companion object {
        fun from(status: AccountDeletionStatus): AccountDeletionPhase = when (status.status) {
            null -> None
            "PENDING_EMAIL_CONFIRMATION" -> PendingConfirmation
            else -> GracePeriod(status.canCancelUntil ?: status.gracePeriodEndsAt)
        }
    }
}
