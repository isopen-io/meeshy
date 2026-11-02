package me.meeshy.sdk.e2ee.libsignal

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.serialization.SerializationException
import me.meeshy.core.e2ee.wire.E2eeJson
import me.meeshy.core.e2ee.wire.E2eeServedEnvelope
import me.meeshy.sdk.model.socket.SocketEventNames
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.RealtimeBinding
import me.meeshy.sdk.socket.SocketEventRouter
import me.meeshy.sdk.socket.SocketInboundRoute
import me.meeshy.sdk.socket.SocketManager
import timber.log.Timber

/**
 * Ce que la session ouverte branche sur l'E2EE libsignal (#14591, miroir de `EndToEndSessionBridge`, iOS) : à
 * l'ouverture, l'installation s'enrôle (une fois par compte et par identité) et relit ses enveloppes en attente ; chaque
 * enveloppe poussée par `e2ee:envelope` (la room de la génération de CET appareil, que la passerelle fait rejoindre à la
 * socket de la session) s'ouvre ; chaque reconnexion relance le rattrapage — une émission perdue ne perd rien,
 * l'enveloppe attend au serveur 30 jours.
 *
 * Une seule file de travail, dans l'ordre : préparation, réceptions et rattrapages ne se doublent pas.
 */
@Singleton
internal class EndToEndEnvelopeBinding @Inject constructor(
    private val router: SocketEventRouter,
    private val socket: SocketManager,
    private val session: SessionRepository,
    private val runtime: EndToEndMessagingRuntime,
) : RealtimeBinding {
    private val installed = AtomicBoolean(false)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var jobs: List<Job> = emptyList()
    /** La file de la session ATTACHÉE : une nouvelle à chaque ouverture, pour qu'aucun travail d'un compte précédent ne survive. */
    @Volatile private var work: Channel<suspend () -> Unit>? = null

    override fun attach() {
        if (installed.compareAndSet(false, true)) router.install(listOf(route()))
        stop()
        val userId = session.currentUserId ?: return
        val queue = Channel<suspend () -> Unit>(Channel.UNLIMITED).also { work = it }
        jobs = listOf(
            scope.launch { for (task in queue) runGuarded(task) },
            scope.launch { socket.connected.collect { enqueue { runtime.catchUp(userId) } } },
        )
        enqueue { runtime.prepare(userId) }
        enqueue { runtime.catchUp(userId) }
    }

    override fun detach() {
        stop()
        runtime.forget()
    }

    private fun stop() {
        work?.close()
        work = null
        jobs.forEach { it.cancel() }
        jobs = emptyList()
    }

    private fun route(): SocketInboundRoute = SocketInboundRoute.raw(SocketEventNames.E2EE_ENVELOPE) { raw ->
        val envelope = try {
            E2eeJson.decodeFromString(E2eeServedEnvelope.serializer(), raw.toString())
        } catch (_: SerializationException) {
            Timber.w("e2ee:envelope undecodable")
            return@raw
        } catch (_: IllegalArgumentException) {
            Timber.w("e2ee:envelope undecodable")
            return@raw
        }
        val userId = session.currentUserId ?: return@raw
        enqueue { if (session.currentUserId == userId) runtime.receive(userId, envelope) }
    }

    private fun enqueue(task: suspend () -> Unit) {
        work?.trySend(task)
    }

    private suspend fun runGuarded(task: suspend () -> Unit) {
        try {
            task()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Timber.w("e2ee session work failed: %s", failure.javaClass.simpleName)
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface EndToEndEnvelopeModule {
    @Binds
    @IntoSet
    fun bindRealtime(binding: EndToEndEnvelopeBinding): RealtimeBinding
}
