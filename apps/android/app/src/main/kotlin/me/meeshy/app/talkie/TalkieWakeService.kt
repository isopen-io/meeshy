package me.meeshy.app.talkie

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.ServiceCompat
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.onSubscription
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.model.playback.PlaybackCommandOrigin
import me.meeshy.sdk.model.relation.TalkieWakeContract
import me.meeshy.sdk.model.relation.TalkieWakeProgress
import me.meeshy.sdk.model.relation.TalkieWakePush
import me.meeshy.sdk.playback.AudioEngineEvent
import me.meeshy.sdk.playback.AudioPlaybackEngine
import me.meeshy.sdk.socket.RelationSocketEventsManager
import me.meeshy.sdk.socket.SocketManager
import org.json.JSONObject
import timber.log.Timber

/**
 * LE RÉVEIL DU TALKIE SUR ANDROID (#17141, #17144) — un Proche parle pendant que Meeshy dort. Le push `talkie_incoming`
 * démarre ce service au premier plan (`mediaPlayback`, type DÉJÀ déclaré : aucune nouvelle déclaration Play) : il pose
 * « X vous parle », connecte la socket, émet `talkie:join { talkieId }`, et la passerelle rejoue la prise de parole dans
 * l'ordre. La voix sort par le chemin du talkie reçu ([TalkieCenter] → [TalkieVoicePlayer]), d'elle-même, sans ouvrir
 * l'app. « Lire » sur la notification joue l'audio porté par le push (`audioUrl`) avec le lecteur des vocaux EXISTANT
 * ([AudioPlaybackEngine]) — aucun nouveau lecteur — et, sans audio servi, redemande le rattrapage. Le service s'arrête à la fin servie
 * (`talkie:ended`, laissée finir de sonner), à « Couper », ou si aucune annonce n'arrive dans le temps imparti.
 */
@AndroidEntryPoint
class TalkieWakeService : Service() {

    @Inject
    lateinit var state: TalkieWakeState

    @Inject
    lateinit var center: TalkieCenter

    @Inject
    lateinit var sockets: SocketManager

    @Inject
    lateinit var relations: RelationSocketEventsManager

    @Inject
    lateinit var engine: AudioPlaybackEngine

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var following: String? = null
    private var watch: Job? = null
    private var lastStartId: Int = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        state.current.onEach { current -> if (following != null && current?.talkieId != following) follow(current) }.launchIn(scope)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        lastStartId = startId
        val replay = intent?.action == TalkieWakeNotification.ACTION_PLAY
        if (replay && state.current.value == null) state.last?.let(state::wake)
        val push = state.current.value
        if (push == null) {
            state.last?.let { stale -> runCatching { promoteOnly(stale) } }
            finish()
            return START_NOT_STICKY
        }
        if (replay && push.audioUrl != null) {
            runCatching { promoteOnly(push) }
            playServed(push, push.audioUrl)
            return START_NOT_STICKY
        }
        if (replay) {
            center.forget(push.talkieId)
            following = null
        }
        promote(push)
        return START_NOT_STICKY
    }

    /** « Lire » avec l'audio du push : le lecteur des vocaux le joue ; le service tient jusqu'à sa fin (bornée). */
    private fun playServed(push: TalkieWakePush, url: String) {
        val attachmentId = PLAYED_PREFIX + push.talkieId
        following = push.talkieId
        watch?.cancel()
        watch = scope.launch {
            if (engine.play(attachmentId, url, PlaybackCommandOrigin.LockScreen, isProtected = true)) {
                withTimeoutOrNull(TalkieWakeProgress.JOIN_TIMEOUT_MS) {
                    engine.events.first { it is AudioEngineEvent.Finished && it.attachmentId == attachmentId }
                }
            }
            if (!state.finish(push.talkieId) && state.current.value == null) finish()
        }
    }

    private fun follow(current: TalkieWakePush?) {
        if (current == null) finish() else promote(current)
    }

    private fun promoteOnly(push: TalkieWakePush) {
        ServiceCompat.startForeground(this, TalkieWakeNotification.NOTIFICATION_ID, TalkieWakeNotification.build(this, push), foregroundType())
    }

    private fun promote(push: TalkieWakePush) {
        runCatching { promoteOnly(push) }.onFailure { Timber.w("Talkie wake foreground refused: %s", it.javaClass.simpleName) }
        if (following == push.talkieId) return
        following = push.talkieId
        watch?.cancel()
        watch = scope.launch { listen(push.talkieId) }
    }

    private suspend fun listen(talkieId: String) {
        sockets.connect()
        relations.attach()
        val joining = scope.launch {
            sockets.connected
                .onSubscription { if (sockets.isConnected) emit(Unit) }
                .collect { if (progress(talkieId) == TalkieWakeProgress.WAITING) join(talkieId) }
        }
        try {
            val opened = withTimeoutOrNull(TalkieWakeProgress.JOIN_TIMEOUT_MS) {
                center.floor.map { TalkieWakeProgress.of(it, talkieId) }.first { it != TalkieWakeProgress.WAITING }
            }
            if (opened != null) {
                center.floor.map { TalkieWakeProgress.of(it, talkieId) }.first { it == TalkieWakeProgress.DONE }
                delay(TalkieWakeProgress.DRAIN_GRACE_MS)
            }
        } finally {
            joining.cancel()
        }
        if (!state.finish(talkieId) && state.current.value == null) finish()
    }

    private fun progress(talkieId: String): TalkieWakeProgress = TalkieWakeProgress.of(center.floor.value, talkieId)

    private fun join(talkieId: String) {
        sockets.emit(TalkieWakeContract.JOIN_EVENT, JSONObject().put("talkieId", talkieId))
    }

    private fun foregroundType(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0

    private fun finish() {
        following = null
        watch?.cancel()
        watch = null
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        // Le DERNIER démarrage seulement : un second réveil arrivé pendant l'arrêt a déjà demandé un démarrage au premier
        // plan ; `stopSelf()` le tuerait avant sa promotion.
        stopSelfResult(lastStartId)
    }

    private companion object {
        const val PLAYED_PREFIX = "talkie:"
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}
