package me.meeshy.app.calls

import android.util.Log
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import me.meeshy.core.common.MainDispatcher
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.TelecomRequestPolicy
import me.meeshy.sdk.model.call.TelecomSystemRequest
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Le retour de l'interface téléphonique du système vers l'appel : décrocher et raccrocher depuis
 * un casque, une montre ou l'écran verrouillé, mise en attente, micro. La décision est celle de
 * [TelecomRequestPolicy] ; ce pont ne fait que la lire contre l'état de l'appel et l'exécuter par
 * les commandes de l'appel en cours. Raccrocher depuis le système passe par le même chemin que le
 * bouton de l'écran d'appel : c'est lui qui émet `call:end`. Une connexion détruite par le système
 * n'arrive jamais ici (aucune demande n'est émise) : l'appel continue, la grâce serveur décide.
 */
@Singleton
class TelecomCallBridge @Inject constructor(
    reporter: TelecomCallReporter,
    private val holder: ActiveCallSnapshotHolder,
    @MainDispatcher dispatcher: CoroutineDispatcher,
) : CallFeatureController {

    @Volatile
    private var state: CallState = CallState.Idle
    private var mutedByHold = false

    init {
        CoroutineScope(SupervisorJob() + dispatcher).launch {
            reporter.requests.collect { request ->
                try {
                    handle(request)
                } catch (failure: Exception) {
                    Log.w(TAG, "telecom request ignored", failure)
                }
            }
        }
    }

    override fun onTransition(previous: CallState, next: CallState, session: CallSessionInfo) {
        state = next
        if (!next.isActive) mutedByHold = false
    }

    private fun handle(request: TelecomSystemRequest) {
        val muted = holder.snapshot.value?.isMuted == true
        when (val action = TelecomRequestPolicy.actionFor(request, state, muted, mutedByHold)) {
            TelecomRequestPolicy.Action.None -> Unit
            TelecomRequestPolicy.Action.Answer -> holder.answer()
            TelecomRequestPolicy.Action.Decline -> holder.decline()
            TelecomRequestPolicy.Action.HangUp -> holder.hangUp()
            is TelecomRequestPolicy.Action.SetMuted -> {
                mutedByHold = action.byHold
                if (action.muted != muted) holder.toggleMute()
            }
        }
    }

    private companion object {
        const val TAG = "CallTelecom"
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface TelecomCallBridgeModule {
    @Binds
    @IntoSet
    fun bindTelecomCallBridge(impl: TelecomCallBridge): CallFeatureController
}
