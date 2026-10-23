package me.meeshy.sdk.profile

import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.mention.UserDisplayNameCache
import me.meeshy.sdk.model.MeeshyUser

/**
 * Ce qu'une fiche chargée laisse derrière elle sans que l'écran l'attende : le nom d'affichage
 * mémorisé pour résoudre `@pseudo`, et tout autre index local branché ici. BEST-EFFORT : l'échec
 * d'un effet est avalé, il ne retire jamais une fiche peinte ni n'empêche les effets suivants.
 */
class ProfileLoadSideEffects(private val effects: List<suspend (MeeshyUser) -> Unit>) {

    @Inject
    constructor(displayNames: UserDisplayNameCache) : this(
        listOf { user -> displayNames.track(user.username, user.effectiveDisplayName) },
    )

    suspend fun profileLoaded(user: MeeshyUser) {
        effects.forEach { effect ->
            try {
                effect(user)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                // best-effort
            }
        }
    }
}
