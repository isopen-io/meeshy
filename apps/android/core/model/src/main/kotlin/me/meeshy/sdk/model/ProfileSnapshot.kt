package me.meeshy.sdk.model

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
        return server.copy(
            voicePublic = server.voicePublic ?: local.voicePublic,
            profileDecor = server.profileDecor ?: local.profileDecor,
            activation = server.activation ?: local.activation,
        )
    }

    fun resolveServerUserWithOptimistic(server: MeeshyUser, pending: List<UpdateProfileRequest>): MeeshyUser =
        pending.fold(server, ProfileEditApply::apply)
}
