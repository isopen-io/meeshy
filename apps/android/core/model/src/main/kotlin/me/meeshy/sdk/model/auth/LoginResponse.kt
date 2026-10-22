package me.meeshy.sdk.model.auth

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.MeeshyUser

/**
 * Charge du `200` de `POST /auth/login`, `POST /auth/login/2fa`,
 * `POST /auth/verify-email` et `POST /auth/magic-link/validate` — QUATRE formes
 * sous un seul statut, lues par UN type tolérant (miroir de `LoginResponseData`,
 * `packages/MeeshySDK/.../Auth/AuthModels.swift`) :
 *
 *  - la **session** : [user] + [token] (+ [sessionToken], [expiresIn]) ;
 *  - le **défi de second facteur** : [requires2FA] + [twoFactorToken], sans jeton ;
 *  - l'**adresse à prouver** : [status] `verification-required` + [email] (+
 *    [accountCreated], [pendingSessionToken]) — aucune session, un code est parti ;
 *  - la **confirmation du compte** qu'un lien ouvrirait : [requiresConfirmation]
 *    + [account] (+ [intent], [maskedEmail]) — le jeton n'est pas consommé.
 *
 * Tous les champs sont nullables et lus EN TOLÉRANCE (un champ mal typé se lit
 * absent) : un `status` ou un champ que la passerelle ajoutera demain ne plante
 * jamais le décodage. [outcome] est le SEUL endroit qui décide de ce que la
 * charge veut dire.
 */
@Serializable
data class LoginResponse(
    @Serializable(with = TolerantUserSerializer::class) val user: MeeshyUser? = null,
    @Serializable(with = TolerantStringSerializer::class) val token: String? = null,
    @Serializable(with = TolerantStringSerializer::class) val sessionToken: String? = null,
    @Serializable(with = TolerantIntSerializer::class) val expiresIn: Int? = null,
    @Serializable(with = TolerantBooleanSerializer::class) val requires2FA: Boolean? = null,
    @Serializable(with = TolerantStringSerializer::class) val twoFactorToken: String? = null,
    @Serializable(with = TolerantStringSerializer::class) val status: String? = null,
    @Serializable(with = TolerantBooleanSerializer::class) val accountCreated: Boolean? = null,
    @Serializable(with = TolerantStringSerializer::class) val email: String? = null,
    @Serializable(with = TolerantStringSerializer::class) val pendingSessionToken: String? = null,
    /** Secondes qui restent, à l'instant de la réponse, pour adopter ce que la preuve a rendu (#10518). */
    @Serializable(with = TolerantIntSerializer::class) val adoptWithinSeconds: Int? = null,
    @Serializable(with = TolerantBooleanSerializer::class) val requiresConfirmation: Boolean? = null,
    @Serializable(with = TolerantLinkSignInAccountSerializer::class) val account: LinkSignInAccount? = null,
    /** Ce que fera le « oui » (`sign-in` | `claim-email`) ; lu par [LinkSignInIntent.from]. */
    @Serializable(with = TolerantStringSerializer::class) val intent: String? = null,
    @Serializable(with = TolerantStringSerializer::class) val maskedEmail: String? = null,
) {

    /**
     * Ce que la charge veut dire, ou `null` quand elle ne dit rien d'exploitable
     * (statut inconnu sans session, défi sans jeton, confirmation sans compte
     * lisible). Un `null` devient un échec TYPÉ chez l'appelant, jamais une
     * session supposée.
     *
     * L'ordre est celui de la prudence, pas de la fréquence : une branche qui
     * DIT « pas de session » (confirmation, adresse à prouver, second facteur)
     * est TERMINALE, même si un jeton traîne à côté — aucune session ne s'ouvre
     * sur une réponse qui annonce qu'elle n'en accorde pas.
     *
     * [typedIdentifier] n'est que le repli de l'adresse à prouver : l'adresse
     * SERVIE fait foi.
     */
    fun outcome(typedIdentifier: String = ""): LoginOutcome? = when {
        requiresConfirmation == true -> linkConfirmation()
        status == VERIFICATION_REQUIRED_STATUS -> pendingVerification(typedIdentifier)
        requires2FA == true -> twoFactorChallenge()
        else -> session()
    }

    private fun linkConfirmation(): LoginOutcome? {
        val target = account?.takeIf { it.id.isNotBlank() && it.username.isNotBlank() } ?: return null
        return LoginOutcome.LinkConfirmationRequired(
            account = target,
            intent = LinkSignInIntent.from(intent),
            maskedEmail = maskedEmail?.trim()?.takeIf { it.isNotEmpty() },
        )
    }

    private fun pendingVerification(typedIdentifier: String): LoginOutcome? {
        val address = email?.trim()?.takeIf { it.isNotEmpty() } ?: typedIdentifier.trim().takeIf { it.isNotEmpty() }
            ?: return null
        return LoginOutcome.VerificationRequired(
            PendingEmailVerification(
                email = address,
                accountCreated = accountCreated ?: false,
                pendingSessionToken = pendingSessionToken?.takeIf { it.isNotEmpty() },
            ),
        )
    }

    private fun twoFactorChallenge(): LoginOutcome? {
        val challenge = twoFactorToken?.takeIf { it.isNotBlank() } ?: return null
        return LoginOutcome.TwoFactorRequired(twoFactorToken = challenge, adoptWithinSeconds = adoptWithinSeconds)
    }

    private fun session(): LoginOutcome? {
        val identity = user ?: return null
        val jwt = token?.takeIf { it.isNotBlank() } ?: return null
        return LoginOutcome.Authenticated(
            session = AuthSession(user = identity, token = jwt, sessionToken = sessionToken, expiresIn = expiresIn),
            adoptWithinSeconds = adoptWithinSeconds,
        )
    }

    companion object {
        /** `status` servi quand `POST /auth/login` reçoit une adresse dont la possession reste à prouver (#8035). */
        const val VERIFICATION_REQUIRED_STATUS: String = "verification-required"
    }
}

/**
 * Une adresse qui attend sa preuve de possession avant toute session (#8035).
 *
 * [accountCreated] distingue la première fois du renvoi. [pendingSessionToken]
 * (#8083) est le jeton d'attente de CET appareil : il dit à l'écran du code si
 * l'adresse a été prouvée ailleurs, jamais plus ; `null` quand la passerelle ne
 * l'a pas servi.
 */
data class PendingEmailVerification(
    val email: String,
    val accountCreated: Boolean,
    val pendingSessionToken: String? = null,
)

/** L'identité du compte qu'un lien ouvrirait, servie SANS session (#10872). */
@Serializable
data class LinkSignInAccount(
    val id: String,
    val username: String,
    val displayName: String? = null,
    val avatar: String? = null,
)

/** Ce que fera le « oui » à la question d'un lien (#10879, #10883). */
enum class LinkSignInIntent(val wire: String) {
    /** Le oui ouvre le compte. */
    SIGN_IN("sign-in"),

    /** Le oui ouvre le compte ET lui rattache l'adresse revendiquée : elle quitte le compte qui la porte. */
    CLAIM_EMAIL("claim-email"),
    ;

    companion object {
        /** Absent (passerelle d'avant #10879), inconnu ou illisible ⇒ [SIGN_IN]. */
        fun from(raw: String?): LinkSignInIntent = entries.firstOrNull { it.wire == raw } ?: SIGN_IN
    }
}

/** Ce que la connexion (ou toute preuve qui ouvre une session) a produit — l'écran en choisit la suite. */
sealed interface LoginOutcome {

    /** La session est ouverte ; [adoptWithinSeconds] est la fenêtre servie pour l'adopter (preuve par lien). */
    data class Authenticated(
        val session: AuthSession,
        val adoptWithinSeconds: Int? = null,
    ) : LoginOutcome

    /** Compte protégé : aucun accès avant le code, à présenter avec [twoFactorToken] à `POST /auth/login/2fa`. */
    data class TwoFactorRequired(
        val twoFactorToken: String,
        val adoptWithinSeconds: Int? = null,
    ) : LoginOutcome

    /** L'adresse doit être prouvée par code ou par lien ; aucune session. */
    data class VerificationRequired(val pending: PendingEmailVerification) : LoginOutcome

    /** Le lien n'a pas été demandé par cet appareil : le compte qu'il ouvrirait attend un « oui » explicite. */
    data class LinkConfirmationRequired(
        val account: LinkSignInAccount,
        val intent: LinkSignInIntent = LinkSignInIntent.SIGN_IN,
        val maskedEmail: String? = null,
    ) : LoginOutcome
}
