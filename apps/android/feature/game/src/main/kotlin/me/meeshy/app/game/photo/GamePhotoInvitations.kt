package me.meeshy.app.game.photo

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.time.ZoneId
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.getAndUpdate
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import me.meeshy.sdk.game.GamePhotoRegistryServiceProviding
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GamePhotoAlertQueue
import me.meeshy.sdk.model.game.GamePhotoAlerts
import me.meeshy.sdk.model.game.GamePhotoBlock
import me.meeshy.sdk.model.game.GamePhotoCatchUpLaw
import me.meeshy.sdk.model.game.GamePhotoRegistry
import me.meeshy.sdk.model.game.PhotoAlert
import me.meeshy.sdk.model.game.PhotoAlertMemory
import me.meeshy.sdk.model.game.PhotoAlertPace
import me.meeshy.sdk.model.game.PhotoAlertPacing
import me.meeshy.sdk.model.game.PhotoAlertPolicy
import me.meeshy.sdk.model.game.PhotoCatchUpStanding
import me.meeshy.sdk.model.game.photo.GamePhotoMoment
import me.meeshy.sdk.model.game.photo.GamePhotoMoments
import me.meeshy.sdk.model.game.photo.NotebookStatus

/*
 * LA FILE DES INVITATIONS À IMMORTALISER, CÔTÉ APP (#20783, tranche Android de #20643) — iso de `GamePhotoInvitations`
 * (iOS, #20775) et de `createPhotoAlerts` (`apps/web/src/lib/game-photo/alerts.ts`, #10174). La LOI vit dans
 * `:core:model` ([GamePhotoAlertQueue]) ; ce modèle fait ce qu'elle laisse à l'hôte : ranger la mémoire d'un compte, lire
 * la Chronique de l'appareil quand une étape neuve se présente, tenir UNE invitation en attente, et accuser sa
 * présentation (`POST /me/game/photo-moments/presented`). Il ne dessine rien : la bannière et la feuille le lisent.
 */

/** La mémoire appareil des invitations d'un compte. */
interface PhotoAlertMemoryStoring {
    fun memory(userId: String): PhotoAlertMemory

    /** `false` : le disque a refusé ; la mémoire tient alors pour la séance. */
    fun store(memory: PhotoAlertMemory, userId: String): Boolean
}

/** `files/MeeshyGame/<compte>/photo-alerts.json` : la mémoire vit dans le dossier du jeu du compte, à côté de sa Chronique. */
class GamePhotoAlertMemoryFile(private val filesDir: File) : PhotoAlertMemoryStoring {

    fun file(userId: String): File = File(GamePhotoNotebook.folder(filesDir, userId).parentFile, FILE_NAME)

    override fun memory(userId: String): PhotoAlertMemory =
        PhotoAlertMemory.read(runCatching { file(userId).takeIf(File::exists)?.readText() }.getOrNull())

    override fun store(memory: PhotoAlertMemory, userId: String): Boolean = runCatching {
        val target = file(userId)
        target.parentFile?.mkdirs()
        val temp = File(target.parentFile, ".$FILE_NAME.writing")
        temp.writeText(memory.encoded())
        if (!temp.renameTo(target)) {
            temp.delete()
            return@runCatching false
        }
        true
    }.getOrDefault(false)

    companion object {
        const val FILE_NAME = "photo-alerts.json"
    }
}

/**
 * L'invitation qui attend un geste : l'étape ANNONCÉE, l'étape PROPOSÉE (l'ouverte de sa piste), et la décision de la
 * loi, qui dit aussi ce qui s'accuse.
 */
data class PendingPhotoInvitation(
    val userId: String,
    val announce: GamePhotoMoment,
    val propose: GamePhotoMoment,
    val alert: PhotoAlert,
) {
    val id: String get() = "$userId|${alert.announce}|${alert.propose}"
}

class GamePhotoInvitations(
    private val memories: PhotoAlertMemoryStoring,
    private val notebook: (String) -> GamePhotoNotebooking,
    private val acknowledge: (List<String>) -> Unit,
    private val now: () -> Long = System::currentTimeMillis,
    private val sessionStartedAt: Long? = System.currentTimeMillis(),
    private val zone: () -> ZoneId = ZoneId::systemDefault,
) {

    /** Ce qu'une lecture du jeu a fait de la file. */
    enum class Outcome {
        /** Première lecture du compte sur l'appareil : la situation se pose, sans invitation. */
        Baseline,
        None,

        /** Le délai de grâce de la séance court : l'étape attendra la lecture suivante. */
        Wait,

        /** Une invitation attend déjà un geste : la suivante attend, la situation n'avance pas. */
        Busy,
        Alert,
    }

    private val waiting = MutableStateFlow<PendingPhotoInvitation?>(null)
    private val notice = MutableStateFlow(false)

    /** La séance tient même si le disque refuse : la dernière mémoire écrite reste lisible ici. */
    private val session = ConcurrentHashMap<String, PhotoAlertMemory>()
    private val acknowledged = ConcurrentHashMap.newKeySet<String>()
    private val deciding = Mutex()

    val pending: StateFlow<PendingPhotoInvitation?> = waiting.asStateFlow()

    /** La pastille de la Chronique, pour le compte lu en dernier. */
    val hasNotice: StateFlow<Boolean> = notice.asStateFlow()

    // Les lectures du jeu

    suspend fun observe(userId: String, game: GameBlock): Outcome = observe(userId, PhotoCatchUpStanding.of(game), game.photo)

    suspend fun observe(userId: String, standing: PhotoCatchUpStanding, photo: GamePhotoBlock?): Outcome {
        val memory = read(userId)
        return when (val observed = GamePhotoAlertQueue.observe(memory, standing, photo)) {
            is GamePhotoAlertQueue.Observation.Baseline -> {
                write(observed.memory, userId)
                Outcome.Baseline
            }
            is GamePhotoAlertQueue.Observation.Unchanged -> {
                val moved = observed.memory
                if (moved != null) write(moved, userId) else notice.value = memory.hasNotice
                Outcome.None
            }
            is GamePhotoAlertQueue.Observation.Reached -> {
                if (waiting.value != null || !deciding.tryLock()) return Outcome.Busy
                try {
                    decide(userId, observed.stepIds, standing, photo)
                } finally {
                    deciding.unlock()
                }
            }
        }
    }

    private suspend fun decide(userId: String, reached: List<String>, standing: PhotoCatchUpStanding, photo: GamePhotoBlock?): Outcome {
        val paced = pacing(read(userId))
        if (GamePhotoAlerts.pacing(paced, photo?.policy ?: PhotoAlertPolicy.Standard) == PhotoAlertPace.Wait) return Outcome.Wait
        val entries = notebook(userId).list()
        val decision = GamePhotoAlertQueue.decide(
            memory = read(userId),
            reached = reached,
            standing = standing,
            photo = photo,
            notebookKept = entries.filter { it.status == NotebookStatus.Kept }.map { it.momentId },
            notebookKnown = entries.map { it.momentId },
            pacing = paced,
        )
        decision.memory?.let { write(it, userId) }
        return when (decision) {
            is GamePhotoAlertQueue.Decision.Wait -> Outcome.Wait
            is GamePhotoAlertQueue.Decision.None -> Outcome.None
            is GamePhotoAlertQueue.Decision.Alert -> {
                val announce = moment(decision.alert.announce, standing) ?: return Outcome.None
                val propose = moment(decision.alert.propose, standing) ?: return Outcome.None
                waiting.value = PendingPhotoInvitation(userId, announce, propose, decision.alert)
                Outcome.Alert
            }
        }
    }

    // Les gestes

    /** L'invitation est à l'écran : rythme, pastille, et accusé — une fois par invitation. */
    fun displayed(invitation: PendingPhotoInvitation) {
        if (waiting.value != invitation || !acknowledged.add(invitation.id)) return
        val at = now()
        val result = GamePhotoAlertQueue.displayed(read(invitation.userId), invitation.alert, at, GamePhotoAlertQueue.dayKey(at, zone()))
        write(result.memory, invitation.userId)
        acknowledge(result.acknowledge)
    }

    /** « Immortaliser » : rend l'invitation et libère la file. */
    fun consume(): PendingPhotoInvitation? = waiting.getAndUpdate { null }

    /** « Plus tard » : libère la file ; le moment proposé attend dans la Chronique. `false` : rien n'attendait. */
    suspend fun later(): Boolean {
        val invitation = waiting.getAndUpdate { null } ?: return false
        notebook(invitation.userId).postpone(invitation.propose)
        return true
    }

    /** La visite de la Chronique éteint la pastille. */
    fun carnetVisited(userId: String) {
        write(GamePhotoAlertQueue.carnetVisited(read(userId)), userId)
    }

    // La mémoire

    private fun read(userId: String): PhotoAlertMemory = session[userId] ?: memories.memory(userId)

    private fun write(memory: PhotoAlertMemory, userId: String) {
        session[userId] = memory
        notice.value = memory.hasNotice
        memories.store(memory, userId)
    }

    private fun pacing(memory: PhotoAlertMemory): PhotoAlertPacing {
        val at = now()
        return PhotoAlertPacing(
            now = at,
            dayKey = GamePhotoAlertQueue.dayKey(at, zone()),
            sessionStartedAt = sessionStartedAt,
            surface = PhotoAlertPacing.Surface.Passive,
            shown = memory.shown,
        )
    }

    companion object {
        /** Le moment complet d'une étape franchie ; `null` : la situation ne la porte pas. */
        fun moment(stepId: String, standing: PhotoCatchUpStanding): GamePhotoMoment? =
            GamePhotoCatchUpLaw.stepsReached(standing).firstOrNull { it.id == stepId }?.let(GamePhotoMoments::of)
    }
}

/** La file de l'application : une par processus, comme la séance qui rythme la grâce. */
@Singleton
class GamePhotoInvitationsHost @Inject constructor(
    @ApplicationContext context: Context,
    registry: GamePhotoRegistryServiceProviding,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    val invitations: GamePhotoInvitations = GamePhotoInvitations(
        memories = GamePhotoAlertMemoryFile(context.filesDir),
        notebook = { userId -> GamePhotoNotebook(GamePhotoNotebook.folder(context.filesDir, userId)) },
        acknowledge = { stepIds ->
            GamePhotoRegistry.presentedBatches(stepIds).forEach { batch ->
                val requestId = UUID.randomUUID().toString()
                scope.launch { registry.acknowledgePhotoMomentsPresented(batch, requestId) }
            }
        },
    )
}
