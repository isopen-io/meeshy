package me.meeshy.sdk.location

import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch
import me.meeshy.core.common.DefaultDispatcher
import me.meeshy.sdk.model.LiveLocationDuration
import me.meeshy.sdk.model.LiveLocationEmission
import me.meeshy.sdk.model.LiveLocationFix
import me.meeshy.sdk.model.LiveLocationSharingState
import me.meeshy.sdk.model.LiveLocationStartFailure
import javax.inject.Inject
import javax.inject.Singleton

/** Les trois verbes émis vers la passerelle ; `false` = rien n'est parti (hors connexion). */
interface LiveLocationSink {
    fun start(conversationId: String, fix: LiveLocationFix, duration: LiveLocationDuration): Boolean
    fun update(conversationId: String, fix: LiveLocationFix): Boolean
    fun stop(conversationId: String): Boolean
}

/** La source de positions de l'appareil (`LocationManager`, sans Play Services). */
interface LiveLocationFixSource {
    suspend fun currentFix(): LiveLocationFix?
    fun updates(intervalMillis: Long): Flow<LiveLocationFix>
}

fun interface LocationPermissionGate {
    fun isGranted(): Boolean
}

fun interface LiveLocationClock {
    fun nowMillis(): Long
}

/** Le service de premier plan qui tient le partage actif écran éteint. */
interface LiveLocationServiceHost {
    fun onSharingStarted(conversationId: String, expiresAtMillis: Long)
    fun onSharingStopped()
}

/**
 * Pilote le partage de MA position : permission vérifiée au moment du partage, émission
 * start / update / stop, arrêt manuel ou à l'échéance. Un seul partage à la fois ; en démarrer
 * un autre arrête le précédent.
 */
@Singleton
class LiveLocationSharingController @Inject constructor(
    private val sink: LiveLocationSink,
    private val fixes: LiveLocationFixSource,
    private val permission: LocationPermissionGate,
    private val host: LiveLocationServiceHost,
    private val clock: LiveLocationClock,
    @DefaultDispatcher dispatcher: CoroutineDispatcher,
) {
    private val scope = CoroutineScope(SupervisorJob() + dispatcher)
    private val _state = MutableStateFlow<LiveLocationSharingState>(LiveLocationSharingState.Idle)
    val state: StateFlow<LiveLocationSharingState> = _state.asStateFlow()

    private var updatesJob: Job? = null
    private var expiryJob: Job? = null
    private var startJob: Job? = null

    fun start(conversationId: String, duration: LiveLocationDuration) {
        stopInternal(emitStop = true)
        _state.value = LiveLocationSharingState.Starting
        startJob = scope.launch {
            if (!permission.isGranted()) return@launch fail(LiveLocationStartFailure.PERMISSION_DENIED)
            val fix = fixes.currentFix() ?: return@launch fail(LiveLocationStartFailure.NO_FIX)
            if (!sink.start(conversationId, fix, duration)) return@launch fail(LiveLocationStartFailure.OFFLINE)
            val expiresAt = clock.nowMillis() + duration.durationMillis
            _state.value = LiveLocationSharingState.Sharing(conversationId, expiresAt)
            host.onSharingStarted(conversationId, expiresAt)
            beginUpdates(conversationId)
            scheduleExpiry(conversationId, expiresAt)
        }
    }

    fun stop() = stopInternal(emitStop = true)

    /** Recale l'échéance sur l'heure serveur (`expiresAt` de `location:live-started`). */
    fun adoptServerDeadline(expiresAtMillis: Long) {
        val sharing = _state.value as? LiveLocationSharingState.Sharing ?: return
        _state.value = sharing.copy(expiresAtMillis = expiresAtMillis)
        host.onSharingStarted(sharing.conversationId, expiresAtMillis)
        scheduleExpiry(sharing.conversationId, expiresAtMillis)
    }

    private fun fail(reason: LiveLocationStartFailure) {
        _state.value = LiveLocationSharingState.Failed(reason)
    }

    private fun beginUpdates(conversationId: String) {
        updatesJob = scope.launch {
            fixes.updates(LiveLocationEmission.UPDATE_INTERVAL_MILLIS)
                .catch { }
                .collect { sink.update(conversationId, it) }
        }
    }

    private fun scheduleExpiry(conversationId: String, expiresAtMillis: Long) {
        expiryJob?.cancel()
        expiryJob = scope.launch {
            delay((expiresAtMillis - clock.nowMillis()).coerceAtLeast(0L))
            if ((_state.value as? LiveLocationSharingState.Sharing)?.conversationId == conversationId) {
                stopInternal(emitStop = true)
            }
        }
    }

    private fun stopInternal(emitStop: Boolean) {
        val sharing = _state.value as? LiveLocationSharingState.Sharing
        startJob?.cancel()
        updatesJob?.cancel()
        expiryJob?.cancel()
        startJob = null
        updatesJob = null
        expiryJob = null
        _state.value = LiveLocationSharingState.Idle
        if (sharing != null) {
            if (emitStop) sink.stop(sharing.conversationId)
            host.onSharingStopped()
        }
    }
}
