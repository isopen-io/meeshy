package me.meeshy.sdk.game

import android.content.Context
import android.content.SharedPreferences
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.game.engagement.EngagementReveal
import me.meeshy.sdk.model.game.engagement.EngagementRevealQueue
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.RealtimeBinding
import timber.log.Timber

/**
 * Les paliers DÉJÀ célébrés tout seuls sur cet appareil, par compte — la mémoire qui empêche une redistribution du
 * même événement (reconnexion, relance) de refêter un fait déjà fêté. Elle ne fait foi de RIEN d'autre : un palier
 * n'est jamais calculé ni anticipé ici, la passerelle l'a servi (ou ne l'a pas servi).
 */
interface EngagementRevealMemory {
    fun hasCelebrated(userId: String, revealId: String): Boolean

    fun markCelebrated(userId: String, revealId: String)
}

/** Mémoire volatile — tests et aperçus. */
class InMemoryEngagementRevealMemory : EngagementRevealMemory {
    private val shown = mutableSetOf<String>()
    override fun hasCelebrated(userId: String, revealId: String): Boolean = "$userId/$revealId" in shown
    override fun markCelebrated(userId: String, revealId: String) {
        shown += "$userId/$revealId"
    }
}

@Singleton
class SharedPreferencesEngagementRevealMemory @Inject constructor(
    @ApplicationContext context: Context,
) : EngagementRevealMemory {
    private val file: SharedPreferences = context.applicationContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    @Synchronized
    override fun hasCelebrated(userId: String, revealId: String): Boolean = revealId in read(userId)

    @Synchronized
    override fun markCelebrated(userId: String, revealId: String) {
        val next = (read(userId).filterNot { it == revealId } + revealId).takeLast(CAPACITY)
        file.edit().putString(userId, next.joinToString(SEPARATOR)).apply()
    }

    private fun read(userId: String): List<String> =
        file.getString(userId, null)?.split(SEPARATOR)?.filter(String::isNotEmpty).orEmpty()

    private companion object {
        const val FILE_NAME = "meeshy.game.reveals"
        const val SEPARATOR = "\n"
        const val CAPACITY = 64
    }
}

/**
 * LA CÉLÉBRATION D'UN PALIER (miroir de `EngagementRevealHost`, iOS) — deux portes, une seule file.
 *
 * 1. Le TOUCHER d'une notification de palier ([onTapped]) : quelqu'un qui touche la notification d'une série a demandé à
 *    la voir, les cinq formes passent.
 * 2. L'ÉVÉNEMENT servi en direct ([onLive], socket `notification:new`) : seul un SUCCÈS se célèbre tout seul, au moment
 *    où l'utilisateur vient d'agir ; un badge, une série, un niveau tombent au fil de l'usage et ne coupent pas le geste.
 *
 * Rien n'est calculé ici : le palier vient de la charge servie par la passerelle ([EngagementReveal.from] rend `null`
 * dès qu'elle ne dit pas QUOI célébrer). « Jeu masqué » le retire des deux portes — le jeu disparaît des écrans de
 * l'appareil. Un palier célébré tout seul s'inscrit dans la mémoire du compte : une redistribution du même événement
 * ne le rejoue pas. La passerelle ne garde aucun « déjà vu » (elle grave le palier UNE fois et l'annonce UNE fois) ;
 * une relecture de la liste des notifications ne célèbre jamais rien — seuls l'événement direct et le toucher le font.
 */
@Singleton
class EngagementRevealCoordinator @Inject constructor(
    private val prefs: GameDevicePrefsStore,
    private val session: SessionRepository,
    private val memory: EngagementRevealMemory,
) {
    private val mutableQueue = MutableStateFlow(EngagementRevealQueue())
    val queue: StateFlow<EngagementRevealQueue> = mutableQueue.asStateFlow()

    fun onTapped(notification: ApiNotification) {
        val reveal = revealOf(notification) ?: return
        val userId = session.currentUserId ?: return
        if (prefs.current().hidden) return
        if (enqueue(reveal)) memory.markCelebrated(userId, reveal.id)
    }

    fun onLive(notification: ApiNotification) {
        val reveal = revealOf(notification)?.takeIf { it.celebratesUnprompted } ?: return
        val userId = session.currentUserId ?: return
        if (prefs.current().hidden || memory.hasCelebrated(userId, reveal.id)) return
        if (enqueue(reveal)) memory.markCelebrated(userId, reveal.id)
    }

    /** La célébration courante est refermée : la suivante prend sa place. */
    fun finish() = mutableQueue.update { it.finish() }

    /** Un calque (onboarding) recouvre l'écran : les paliers attendent, rien n'est perdu. */
    fun suspend(suspended: Boolean) = mutableQueue.update { it.suspend(suspended) }

    private fun revealOf(notification: ApiNotification): EngagementReveal? =
        EngagementReveal.from(notification.notificationType, notification.metadata)

    private fun enqueue(reveal: EngagementReveal): Boolean {
        var accepted = false
        mutableQueue.update { before ->
            val after = before.enqueue(reveal)
            accepted = after != before
            after
        }
        return accepted
    }
}

/** Branche les notifications directes du socket sur la célébration. */
@Singleton
class EngagementRevealSocketBinding @Inject constructor(
    private val messages: MessageSocketManager,
    private val coordinator: EngagementRevealCoordinator,
    @IoDispatcher private val io: CoroutineDispatcher,
) : RealtimeBinding {

    private var scope: CoroutineScope? = null

    override fun attach() {
        detach()
        val live = CoroutineScope(SupervisorJob() + io).also { scope = it }
        live.launch {
            messages.notificationReceived.collect { notification ->
                try {
                    coordinator.onLive(notification)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Timber.e(e, "Célébration d'un palier en échec")
                }
            }
        }
    }

    override fun detach() {
        scope?.coroutineContext?.get(Job)?.cancel()
        scope = null
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class EngagementRevealModule {
    @Binds
    abstract fun bindMemory(memory: SharedPreferencesEngagementRevealMemory): EngagementRevealMemory

    @Binds
    @IntoSet
    abstract fun bindRealtime(binding: EngagementRevealSocketBinding): RealtimeBinding
}
