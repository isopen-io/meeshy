package me.meeshy.sdk.model.auth

import kotlinx.serialization.Serializable

/** Corps de `POST /invitations/email` : l'adresse de quelqu'un qui n'est pas encore sur Meeshy. */
@Serializable
data class EmailInvitationRequest(val email: String)

/**
 * `data` du `201` de `POST /invitations/email`. [invitationUrl] porte un jeton
 * d'affiliation à usage unique (jamais l'adresse du destinataire).
 *
 * Refus typés servis par la passerelle : `409 USER_ALREADY_EXISTS` (cette personne est déjà
 * sur Meeshy), `400 VALIDATION_ERROR` (adresse illisible), et l'exigence d'une adresse du
 * compte déjà prouvée (#6437) — l'appelant lit le `code` de l'erreur.
 */
@Serializable
data class EmailInvitationSent(
    val email: String,
    val sentAt: String? = null,
    val invitationUrl: String? = null,
)
