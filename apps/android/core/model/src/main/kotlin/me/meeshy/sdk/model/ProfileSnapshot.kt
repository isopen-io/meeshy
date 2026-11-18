package me.meeshy.sdk.model

import me.meeshy.sdk.model.profile.OwnProfileSync

/**
 * How a server answer about MY profile lands on the local identity (iOS
 * `ProfileView.mergingServerUser`, `AuthManager.currentUser`).
 *
 * Two laws, one file, so the confirmation path and the restart path can never drift:
 * - [mergingServerUser]: a self-profile route (`PATCH /users/me`, avatar, banner) does not
 *   serve every field — `voicePublic` lives on a relation `formatUserResponse()` never joins,
 *   the decor and the activation come from other routes. Assigning the answer verbatim would
 *   blank them; the merge keeps the local value only where the server is silent.
 * - [resolveServerUserWithOptimistic]: a re-read confirms the server state but must NOT erase an
 *   edit still waiting in the outbox — those edits are re-applied on top, oldest first.
 */
object ProfileSnapshot {

    fun mergingServerUser(server: MeeshyUser, local: MeeshyUser?): MeeshyUser {
        if (local == null || local.id != server.id) return server
        val arbitrated = keepingHeldIdentity(server, local)
        return arbitrated.copy(
            voicePublic = server.voicePublic ?: local.voicePublic,
            profileDecor = server.profileDecor ?: local.profileDecor,
            activation = server.activation ?: local.activation,
        )
    }

    /**
     * #19281 — une relecture (`GET /me`, réponse d'un `PATCH`) PROUVÉE plus ancienne que le profil tenu (le dernier
     * `profile:updated` appliqué) garde les champs et l'instant tenus ; le reste du serveur (compte actif, vérifications)
     * passe. Sans instant lisible d'un côté ou de l'autre, rien n'est prouvé : le serveur s'applique.
     */
    private fun keepingHeldIdentity(server: MeeshyUser, local: MeeshyUser): MeeshyUser {
        val incoming = server.updatedAt ?: return server
        if (!OwnProfileSync.isStale(local.updatedAt, incoming)) return server
        return server.copy(
            systemLanguage = local.systemLanguage,
            regionalLanguage = local.regionalLanguage,
            customDestinationLanguage = local.customDestinationLanguage,
            displayName = local.displayName,
            firstName = local.firstName,
            lastName = local.lastName,
            username = local.username,
            avatar = local.avatar,
            banner = local.banner,
            updatedAt = local.updatedAt,
        )
    }

    fun resolveServerUserWithOptimistic(server: MeeshyUser, pending: List<UpdateProfileRequest>): MeeshyUser =
        ProfileGuard.fold(server, pending)
}
