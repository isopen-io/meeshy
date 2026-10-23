package me.meeshy.sdk.profile

import java.util.EnumMap
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.model.ProfileDecorSide
import me.meeshy.sdk.model.ProfileDecorWrite
import me.meeshy.sdk.model.ServedProfileDecor
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.profile.ProfileDecorState
import me.meeshy.sdk.model.profile.ProfileDecorUpdatedEvent
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.UserApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.session.SessionRepository

/** Pourquoi un choix n'a pas pu être enregistré ; l'écran le dit (clé `profile.decor.error`). */
enum class ProfileDecorError { SAVE_FAILED }

/** Issue d'un choix de décor. */
sealed interface ProfileDecorOutcome {
    /** Le serveur a répondu : sa réponse fait foi. */
    data class Confirmed(val decor: ServedProfileDecor) : ProfileDecorOutcome

    /** Un choix plus récent du même côté a pris la main : cette réponse ne touche plus rien. */
    data object Superseded : ProfileDecorOutcome

    /** Refus ou panne : le côté touché est rétabli. */
    data class Failed(val error: ProfileDecorError) : ProfileDecorOutcome
}

/**
 * Équiper / retirer un côté du décor de MON profil — miroir de `ProfileDecorService` + `ProfileDecorState`
 * (iOS). Optimiste : le choix est publié sur la session dès le toucher, le serveur confirme ou le côté
 * est rétabli. Un numéro de choix PAR CÔTÉ empêche une réponse ancienne d'écraser ou de rétablir un
 * choix plus récent ; un rollback ne touche que son côté.
 */
@Singleton
class ProfileDecorRepository @Inject constructor(
    private val api: UserApi,
    private val session: SessionRepository,
) {
    private val lock = Any()
    private val latestChoice = EnumMap<ProfileDecorSide, Int>(ProfileDecorSide::class.java)
    private val inFlight = EnumMap<ProfileDecorSide, Int>(ProfileDecorSide::class.java)

    suspend fun equip(item: ServedProfileDecorItem?, side: ProfileDecorSide): ProfileDecorOutcome {
        val mine = session.currentUser.value ?: return ProfileDecorOutcome.Failed(ProfileDecorError.SAVE_FAILED)
        val (choice, previous) = synchronized(lock) {
            val equipped = ProfileDecorState(mine.servedDecor).equip(item, side)
            session.applyProfileDecor(equipped.state.decor)
            val number = (latestChoice[side] ?: 0) + 1
            latestChoice[side] = number
            inFlight[side] = (inFlight[side] ?: 0) + 1
            number to equipped.previous
        }
        val result = try {
            apiCall { api.updateProfileDecor(ProfileDecorWrite.side(side, item?.ref)) }
        } catch (cancelled: CancellationException) {
            synchronized(lock) { inFlight[side] = (inFlight[side] ?: 1) - 1 }
            throw cancelled
        }
        return settle(side, choice, previous, result)
    }

    private fun settle(
        side: ProfileDecorSide,
        choice: Int,
        previous: ServedProfileDecorItem?,
        result: NetworkResult<ServedProfileDecor>,
    ): ProfileDecorOutcome = synchronized(lock) {
        inFlight[side] = (inFlight[side] ?: 1) - 1
        val current = latestChoice[side] == choice
        val state = ProfileDecorState(session.currentUser.value?.servedDecor ?: ServedProfileDecor.EMPTY)
        when {
            !current -> ProfileDecorOutcome.Superseded
            result is NetworkResult.Success -> {
                val served = result.data
                val next = if (inFlight.values.all { it == 0 }) state.confirm(served)
                else state.confirm(state.decor.with(side, served[side]))
                session.applyProfileDecor(next.decor)
                ProfileDecorOutcome.Confirmed(served)
            }
            else -> {
                session.applyProfileDecor(state.rollback(side, previous).decor)
                ProfileDecorOutcome.Failed(ProfileDecorError.SAVE_FAILED)
            }
        }
    }

    /**
     * `profile:decor-updated` : mes autres appareils. L'événement d'un autre compte est ignoré ; un côté
     * dont un choix est en vol garde son choix optimiste (la réponse du serveur le tranchera).
     */
    fun onEvent(event: ProfileDecorUpdatedEvent) {
        val myId = session.currentUserId ?: return
        synchronized(lock) {
            val before = ProfileDecorState(session.currentUser.value?.servedDecor ?: ServedProfileDecor.EMPTY)
            val applied = before.apply(event, myId).decor
            val merged = ProfileDecorSide.entries.fold(applied) { decor, side ->
                if ((inFlight[side] ?: 0) > 0) decor.with(side, before.decor[side]) else decor
            }
            if (merged != before.decor) session.applyProfileDecor(merged)
        }
    }
}
