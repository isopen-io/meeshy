package me.meeshy.sdk.model.auth

import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UserActivation

/**
 * « Adresse connue non prouvée » (#8365) : se lit sur l'utilisateur COURANT, sans aller-retour. Miroir de
 * `EmailVerificationGateController.emailKnownUnproven` (iOS) :
 *
 * - le compte a une adresse (non blanche) et `emailVerifiedAt` est nul ;
 * - `activation.missing` contient l'adresse — ou l'activation est absente (passerelle antérieure à #8238) ;
 * - une adresse que cet appareil vient de prouver pour CE compte ne se redemande pas ([provenUserId]).
 */
object EmailProofRules {

    fun address(user: MeeshyUser?): String? = user?.email?.trim()?.takeIf { it.isNotEmpty() }

    fun knownUnproven(user: MeeshyUser?, provenUserId: String?): Boolean {
        if (user == null || user.id == provenUserId || address(user) == null || user.emailVerifiedAt != null) return false
        return user.activation?.let { UserActivation.Channel.EMAIL in it.missing } ?: true
    }
}
