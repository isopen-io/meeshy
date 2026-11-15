package me.meeshy.sdk.model.auth

import me.meeshy.sdk.model.net.MaskedEmailOwner

/**
 * L'adresse que la passerelle a refusée comme DÉJÀ UTILISÉE, et son titulaire masqué (iOS `rejectedEmail` +
 * `emailOwner`, #8216).
 *
 * Les gestes « Est-ce vous ? » ne valent que pour l'adresse REFUSÉE : corrigée, elle n'est plus celle d'un compte
 * connu et ils disparaissent ([isShownFor]). Modifier un AUTRE champ ne les retire pas.
 */
public data class EmailTaken(
    val rejectedEmail: String,
    /** `null` sur une passerelle qui ne sert pas le titulaire : l'écran se replie sur la récupération seule. */
    val owner: MaskedEmailOwner? = null,
) {
    /** Les gestes sont à montrer tant que la saisie courante est EXACTEMENT l'adresse refusée. */
    public fun isShownFor(currentEmail: String): Boolean = rejectedEmail == currentEmail

    public companion object {
        /** Le refus `EMAIL_TAKEN` d'une soumission pour [typedEmail], ou `null` pour tout autre refus. */
        public fun from(error: SignupSubmitError?, typedEmail: String): EmailTaken? {
            val refused = (error as? SignupSubmitError.Field)?.takeIf { it.refusal == SignupRefusal.EMAIL_TAKEN }
                ?: return null
            return EmailTaken(rejectedEmail = typedEmail, owner = refused.owner)
        }
    }
}

/** L'adresse de l'utilisateur, abrégée pour la ligne « e-mail partiel » du titulaire (`j•••@gmail.com`). */
public object EmailMasking {
    private const val BULLETS: String = "•••"

    public fun partial(email: String): String {
        val trimmed = email.trim()
        val at = trimmed.indexOf('@')
        if (at <= 0) return trimmed
        return trimmed.first().toString() + BULLETS + trimmed.substring(at)
    }
}
