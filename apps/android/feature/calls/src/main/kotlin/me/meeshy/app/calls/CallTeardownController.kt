package me.meeshy.app.calls

import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.Multibinds
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallFailureReason
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/** Une ressource d'appel à libérer au démontage (verrou, capteur, fenêtre flottante…), contribuée en `@IntoSet`. */
fun interface CallTeardownStep {
    fun release()
}

/**
 * Le démontage ATOMIQUE d'un appel (iOS `endCallInternal` / `cancelCallScopedWork`) : toutes les tâches de la session
 * sont annulées, le média (micro, caméra, route audio, verrou de proximité) est libéré, puis chaque
 * [CallTeardownStep] contribuée. Une étape qui échoue n'empêche pas les suivantes. Idempotent : rejouable sans effet.
 */
@Singleton
class CallTeardownController @Inject constructor(
    private val steps: Set<@JvmSuppressWildcards CallTeardownStep>,
) {
    fun teardown(host: CallSessionHost) {
        guarded("tâches") { host.cancelSessionJobs() }
        guarded("média") { host.endMedia() }
        steps.forEach { step -> guarded(step.javaClass.simpleName) { step.release() } }
    }

    /** L'appel échoue pour [reason] : l'écran de fin le dit précisément (`Ended(Failed)`), le démontage suit l'arête. */
    fun failCall(host: CallSessionHost, reason: CallFailureReason) {
        if (!host.callState.isActive) return
        host.dispatch(CallEvent.ConnectionFailed(reason.token))
    }

    private inline fun guarded(what: String, block: () -> Unit) {
        try {
            block()
        } catch (failure: Exception) {
            Timber.w(failure, "Démontage de l'appel : %s en échec", what)
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface CallTeardownModule {
    @Multibinds
    fun teardownSteps(): Set<@JvmSuppressWildcards CallTeardownStep>
}
