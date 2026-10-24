package me.meeshy.app.navigation

import me.meeshy.sdk.model.profile.ProfileSelfRule

/**
 * La regle UNIQUE de navigation vers un profil. Une cible qui designe la session — par
 * son id OU par son pseudo ([ProfileSelfRule]) — mene a [OWN], ma page editable (parite
 * iOS `ProfileView`, alimentee par la seule session) ; toute autre cible mene a la page
 * d'un tiers, `profile/{userId}`. Avant cette regle, `Routes.profile(monId)` chargeait
 * MA fiche comme celle d'un inconnu : pas de crayon, et le drapeau Signaler visible.
 *
 * Les points d'entree qui VISENT soi (avatar flottant, action d'accessibilite, ligne
 * profil des reglages) passent par [own] ; ceux qui recoivent un id quelconque (une
 * notification, un lien profond `meeshy://profile/{id}` ou `/u/{pseudo}`) atterrissent
 * sur `profile/{userId}`, dont la destination tranche par [profileFor] : un seul
 * endroit decide « est-ce moi ? ».
 *
 * Limite assumee : un tiers dont le pseudo serait litteralement `me` partagerait le
 * chemin de [OWN] ; la passerelle reserve ce pseudo.
 */
object ProfileRoutes {
    const val OWN: String = "profile/me"

    /** La route du profil de [userId] vue par la session ([selfId], [selfUsername]) ; `null` pour un id vide. */
    fun profileFor(userId: String, selfId: String?, selfUsername: String? = null): String? {
        val handle = userId.trim()
        if (handle.isEmpty()) return null
        val isSelf = ProfileSelfRule.isSelf(
            sessionUserId = selfId,
            sessionUsername = selfUsername,
            userId = handle,
            username = handle,
        )
        return if (isSelf) OWN else Routes.profile(handle)
    }

    /** Ma page, des qu'une session existe ; `null` sans session (rien a ouvrir). */
    fun own(selfId: String?): String? =
        selfId?.takeIf { it.isNotBlank() }?.let { profileFor(it, it) }
}
