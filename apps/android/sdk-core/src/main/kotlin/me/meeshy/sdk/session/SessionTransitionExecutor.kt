package me.meeshy.sdk.session

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.model.auth.SessionClosingStep
import me.meeshy.sdk.model.auth.SessionOpeningStep
import me.meeshy.sdk.model.auth.SessionTransitionContext
import me.meeshy.sdk.model.auth.SessionTransitionPlan
import me.meeshy.sdk.model.auth.SessionTransitionStep
import timber.log.Timber

/** Ce que chaque etape du plan fait reellement ; vit dans :app, qui possede les surfaces systeme. */
interface SessionStepRunner {
    /** L'etat observable qui parametre le plan (utilisateur, amities deja hydratees, appel actif). */
    suspend fun context(): SessionTransitionContext

    suspend fun run(step: SessionOpeningStep)

    suspend fun run(step: SessionClosingStep)
}

/** La fermeture de session, vue de ceux qui la declenchent (la deconnexion de [me.meeshy.sdk.auth.AuthRepository]). */
fun interface SessionClosing {
    suspend fun closeSession()
}

/**
 * Applique, pour chaque transition d'etat d'authentification, UN plan ([SessionTransitionPlan]) UNE fois :
 * deconnexion, expiration ou changement de compte passent tous ici. Une etape qui echoue est journalisee (type
 * d'erreur seulement, jamais de donnee personnelle) et n'empeche pas les suivantes. Rejouer l'etat courant ne fait rien.
 */
@Singleton
class SessionTransitionExecutor internal constructor(
    private val runner: SessionStepRunner,
    private val scope: CoroutineScope,
) : SessionClosing {
    @Inject
    constructor(runner: SessionStepRunner, @IoDispatcher dispatcher: CoroutineDispatcher) :
        this(runner, CoroutineScope(SupervisorJob() + dispatcher))

    private val lock = Mutex()
    private var authenticated = false
    private val queue = Channel<Boolean>(Channel.UNLIMITED)

    init {
        scope.launch {
            for (target in queue) {
                try {
                    transition(target)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    Timber.e("Transition de session en echec : %s", failure.javaClass.simpleName)
                }
            }
        }
    }

    /** Point d'entree non suspendant : les transitions sont rejouees dans l'ordre d'arrivee. */
    fun onAuthenticatedChanged(isAuthenticated: Boolean) {
        queue.trySend(isAuthenticated)
    }

    /** Ferme la session et rend la main une fois la fermeture TERMINEE ; sans effet si elle est deja fermee. */
    override suspend fun closeSession() {
        transition(false)
    }

    private suspend fun transition(target: Boolean) = lock.withLock {
        val was = authenticated
        if (was == target) return@withLock
        authenticated = target
        val plan = SessionTransitionPlan.forTransition(was, target, safeContext())
        plan.forEach { step -> runIsolated(step) }
    }

    private suspend fun safeContext(): SessionTransitionContext = try {
        runner.context()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (failure: Exception) {
        Timber.e("Contexte de session illisible : %s", failure.javaClass.simpleName)
        SessionTransitionContext(userId = null, friendshipsHydrated = false, hasActiveCall = true)
    }

    private suspend fun runIsolated(step: SessionTransitionStep) {
        try {
            when (step) {
                is SessionTransitionStep.Opening -> runner.run(step.step)
                is SessionTransitionStep.Closing -> runner.run(step.step)
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Timber.e("Etape de session %s en echec : %s", (if (step is SessionTransitionStep.Opening) step.step else (step as SessionTransitionStep.Closing).step).javaClass.simpleName, failure.javaClass.simpleName)
        }
    }
}
