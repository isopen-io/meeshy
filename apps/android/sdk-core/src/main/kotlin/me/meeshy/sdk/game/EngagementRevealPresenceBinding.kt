package me.meeshy.sdk.game

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.socket.RealtimeBinding

/**
 * **Les deux signaux de présence de la célébration** (miroir de `EngagementRevealHost`, iOS) :
 *  - l'onboarding passe d'abord (#7914) : tant que son calque est à l'écran la file SUSPEND, les paliers tombés pendant
 *    le parcours attendent et se jouent une fois le calque parti ; reprendre ne retire rien ;
 *  - la célébration à l'écran se DÉCLARE (#9821) : [GameMomentPresence] dit qu'un événement du jeu recouvre l'écran, car une
 *    fenêtre ne prévient pas l'écran qu'elle recouvre (la story se fige dessous).
 * Détaché (déconnexion), plus rien n'est présenté : le signal retombe et la file reprend.
 */
@Singleton
class EngagementRevealPresenceBinding @Inject constructor(
    private val coordinator: EngagementRevealCoordinator,
    private val onboarding: OnboardingPresence,
    private val moment: GameMomentPresence,
    @IoDispatcher private val io: CoroutineDispatcher,
) : RealtimeBinding {

    private var scope: CoroutineScope? = null

    @Synchronized
    override fun attach() {
        detach()
        val live = CoroutineScope(SupervisorJob() + io).also { scope = it }
        live.launch { onboarding.isPresented.collect(coordinator::suspend) }
        live.launch { coordinator.showing.map { it != null }.distinctUntilChanged().collect(moment::update) }
    }

    @Synchronized
    override fun detach() {
        scope?.coroutineContext?.get(Job)?.cancel()
        scope = null
        moment.update(false)
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class EngagementRevealPresenceModule {
    @Binds
    @IntoSet
    abstract fun bindPresence(binding: EngagementRevealPresenceBinding): RealtimeBinding
}
