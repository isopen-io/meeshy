package me.meeshy.sdk.model.auth

/**
 * Un code et un lien DÉJÀ partis vers [email] (iOS `SentEmailCode`, #8216) : l'inscription d'une adresse déjà utilisée
 * les demande en un geste, puis ouvre la connexion par e-mail sur son attente plutôt que sur une saisie à refaire.
 */
data class SentEmailCode(
    val email: String,
    val dispatch: EmailCodeDispatch,
)
