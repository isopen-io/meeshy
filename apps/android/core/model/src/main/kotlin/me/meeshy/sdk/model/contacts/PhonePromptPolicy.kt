package me.meeshy.sdk.model.contacts

import me.meeshy.sdk.model.MeeshyUser

/**
 * Faut-il proposer d'ajouter son numéro avant de chercher ses contacts (#8843) ? Miroir de
 * `PhonePromptPolicy.swift`.
 *
 * Oui, et seulement, quand le compte connecté n'en a pas : le rapprochement du carnet marche dans
 * les DEUX sens, et un compte sans numéro ne peut pas être retrouvé par ceux qui l'ont au leur.
 * Un compte qui en a déjà un ne voit JAMAIS la proposition (vérifié ou non). Ni un visiteur
 * anonyme, ni une session absente : ils n'ont pas de profil à compléter.
 */
object PhonePromptPolicy {
    fun shouldOffer(user: MeeshyUser?): Boolean {
        if (user == null || user.isAnonymous == true) return false
        return user.phoneNumber.orEmpty().isBlank()
    }
}
