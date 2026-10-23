package me.meeshy.sdk.profile

import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.ProfileExpansion
import me.meeshy.sdk.model.PublicProfile
import me.meeshy.sdk.model.UserStats
import me.meeshy.sdk.model.profile.ProfileFailure
import me.meeshy.sdk.model.profile.ProfileLoadEvent
import me.meeshy.sdk.model.profile.ProfileLoadReducer
import me.meeshy.sdk.model.profile.ProfileLoadState
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.user.ProfileStatsCacheRepository
import me.meeshy.sdk.user.UserRepository

/** Le réseau dont la fiche a besoin ; [UserRepository] en est l'implémentation de production. */
interface ProfileRemote {
    suspend fun profile(handle: String): NetworkResult<PublicProfile>
    suspend fun stats(userId: String): NetworkResult<UserStats>
}

class UserRepositoryProfileRemote @Inject constructor(private val users: UserRepository) : ProfileRemote {
    override suspend fun profile(handle: String): NetworkResult<PublicProfile> =
        users.getPublicProfile(handle, setOf(ProfileExpansion.STATS, ProfileExpansion.PRESENCE))

    override suspend fun stats(userId: String): NetworkResult<UserStats> = users.getUserStats(userId)
}

/**
 * Ce que la fiche d'un profil lit, et dans quel ordre (miroir de `ProfileSheetLoader.swift`, #10093) :
 * le cache d'abord (profil + statistiques), puis la synchronisation MÊME quand le cache est frais, en
 * UN aller-retour (`expand=stats`). Chaque émission est l'état réduit par [ProfileLoadReducer] : le
 * squelette n'existe que sur cache vide, un échec ne retire jamais un contenu peint, et un refus
 * (403, 404 sur fiche peinte) purge le profil, ses statistiques et son décor du cache.
 */
class ProfileSheetLoader @Inject constructor(
    private val profiles: ProfileCacheRepository,
    private val stats: ProfileStatsCacheRepository,
    private val remote: ProfileRemote,
    private val effects: ProfileLoadSideEffects,
) {
    /** Ouvre la fiche ; [retry] rejoue le cache puis la synchronisation après un « Réessayer ». */
    fun open(userId: String?, username: String, retry: Boolean = false): Flow<ProfileLoadState> = flow {
        val known = userId?.takeIf { it.isNotEmpty() }
        val key = known ?: username
        if (key.isEmpty()) return@flow
        var state = ProfileLoadState()
        suspend fun apply(event: ProfileLoadEvent) {
            state = ProfileLoadReducer.reduce(state, event)
            emit(state)
        }
        if (retry) apply(ProfileLoadEvent.Retry)
        val cachedProfile = quiet { profiles.cachedProfile(key) }
        val cachedStats = (known ?: cachedProfile?.id)?.let { id -> quiet { stats.cachedStats(id) } }
        apply(ProfileLoadEvent.CacheRead(cachedProfile, cachedStats))
        when (val result = remote.profile(key)) {
            is NetworkResult.Success -> synchronize(result.data, key) { apply(it) }
            is NetworkResult.Failure -> {
                val failure = result.error.toFailure()
                apply(ProfileLoadEvent.ProfileFailed(failure))
                apply(ProfileLoadEvent.StatsFailed)
                if (state.isBlockedByTarget) purge(known, cachedProfile, key)
            }
        }
    }

    private suspend fun synchronize(document: PublicProfile, key: String, apply: suspend (ProfileLoadEvent) -> Unit) {
        val fresh = document.user
        apply(ProfileLoadEvent.ProfileSynced(fresh))
        quiet { profiles.store(fresh, key) }
        quiet { effects.profileLoaded(fresh) }
        val synced = document.stats ?: (remote.stats(fresh.id) as? NetworkResult.Success)?.data
        if (synced == null) {
            apply(ProfileLoadEvent.StatsFailed)
            return
        }
        apply(ProfileLoadEvent.StatsSynced(synced))
        quiet { stats.persistStats(fresh.id, synced) }
    }

    private suspend fun purge(known: String?, cached: MeeshyUser?, key: String) {
        val id = known ?: cached?.id
        quiet { if (cached != null) profiles.purge(cached, key) else profiles.purge(ProfileSheetUser.from(key), key) }
        if (id != null) quiet { stats.purgeStats(id) }
    }

    private fun ApiError.toFailure(): ProfileFailure = when {
        httpStatus != null -> ProfileFailure.Http(httpStatus ?: 0)
        code == FORBIDDEN_CODE -> ProfileFailure.Forbidden
        else -> ProfileFailure.Other
    }

    private suspend fun <T> quiet(block: suspend () -> T?): T? = try {
        block()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        null
    }

    private companion object {
        const val FORBIDDEN_CODE = "FORBIDDEN"
    }
}
