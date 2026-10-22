package me.meeshy.sdk.model.profile

import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UserStats

/** Pourquoi la synchronisation du profil a échoué. */
sealed class ProfileFailure {
    /** Réponse HTTP d'état [code] (403, 404, ...). */
    data class Http(val code: Int) : ProfileFailure()

    /** Refus typé : réessayer ne changerait rien. */
    data object Forbidden : ProfileFailure()

    /** Panne (réseau, décodage). */
    data object Other : ProfileFailure()
}

sealed class ProfileLoadEvent {
    /** Ce que le cache garde, peint sans attendre le réseau. */
    data class CacheRead(val profile: MeeshyUser?, val stats: UserStats?) : ProfileLoadEvent()
    data class ProfileSynced(val fresh: MeeshyUser) : ProfileLoadEvent()
    data class ProfileFailed(val failure: ProfileFailure) : ProfileLoadEvent()
    data class StatsSynced(val fresh: UserStats) : ProfileLoadEvent()
    data object StatsFailed : ProfileLoadEvent()
    data object Retry : ProfileLoadEvent()
    data class Repainted(val user: MeeshyUser) : ProfileLoadEvent()
}

/**
 * L'état de chargement d'une fiche (miroir de `ProfileSheetLoader.swift`, #10093) : le squelette
 * n'existe que sur cache vide, un échec ne retire jamais un contenu peint.
 */
data class ProfileLoadState(
    val profile: MeeshyUser? = null,
    val stats: UserStats? = null,
    val isLoadingProfile: Boolean = false,
    val isLoadingStats: Boolean = false,
    val isBlockedByTarget: Boolean = false,
    val profileLoadFailed: Boolean = false,
)

object ProfileLoadReducer {
    private const val FORBIDDEN = 403
    private const val NOT_FOUND = 404

    fun reduce(state: ProfileLoadState, event: ProfileLoadEvent): ProfileLoadState = when (event) {
        is ProfileLoadEvent.CacheRead -> {
            val profile = event.profile ?: state.profile
            val stats = event.stats ?: state.stats
            state.copy(
                profile = profile,
                stats = stats,
                isLoadingProfile = profile == null,
                isLoadingStats = stats == null,
            )
        }
        is ProfileLoadEvent.ProfileSynced ->
            state.copy(profile = event.fresh, profileLoadFailed = false, isLoadingProfile = false)
        is ProfileLoadEvent.ProfileFailed -> failed(state, event.failure)
        is ProfileLoadEvent.StatsSynced ->
            if (state.isBlockedByTarget) state.copy(isLoadingStats = false)
            else state.copy(stats = event.fresh, isLoadingStats = false)
        ProfileLoadEvent.StatsFailed -> state.copy(isLoadingStats = false)
        ProfileLoadEvent.Retry -> state.copy(profileLoadFailed = false)
        is ProfileLoadEvent.Repainted -> state.copy(profile = event.user)
    }

    private fun failed(state: ProfileLoadState, failure: ProfileFailure): ProfileLoadState {
        val done = state.copy(isLoadingProfile = false)
        return when {
            failure is ProfileFailure.Http && failure.code == FORBIDDEN -> blocked(done)
            failure is ProfileFailure.Http && failure.code == NOT_FOUND && state.profile != null -> blocked(done)
            failure == ProfileFailure.Forbidden -> done
            else -> done.copy(profileLoadFailed = state.profile == null)
        }
    }

    private fun blocked(state: ProfileLoadState): ProfileLoadState =
        state.copy(isBlockedByTarget = true, profile = null, stats = null)
}
