package me.meeshy.sdk.playback

import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.playback.MediaSessionEvent
import timber.log.Timber
import java.lang.ref.WeakReference

/**
 * **Le registre central des lecteurs de Meeshy** (iOS `PlaybackCoordinator`) : un seul son à la fois.
 * Les lecteurs y sont tenus par référence FAIBLE — un lecteur oublié ne fuit pas — et un lecteur qui
 * démarre éteint tous les autres.
 *
 * Confiné au fil principal, comme les lecteurs qu'il pilote.
 */
public class PlaybackCoordinator {

    private val lock = Any()
    private val players = ArrayList<WeakReference<CoordinatedPlayer>>()

    public fun register(player: CoordinatedPlayer) {
        synchronized(lock) {
            prune()
            if (players.none { it.get() === player }) players += WeakReference(player)
        }
    }

    public fun unregister(player: CoordinatedPlayer) {
        synchronized(lock) { players.removeAll { it.get() == null || it.get() === player } }
    }

    /** [player] va jouer : tous les autres s'arrêtent. */
    public fun willStartPlaying(player: CoordinatedPlayer) {
        snapshot().filter { it !== player }.forEach(::stopSafely)
    }

    /** Éteint tout. */
    public fun stopAll() {
        snapshot().forEach(::stopSafely)
    }

    /** Éteint tout sauf la vidéo : un changement de page de réel garde le lecteur vidéo. */
    public fun stopAudioOnly() {
        snapshot().filter { it.kind != CoordinatedPlayerKind.Video }.forEach(::stopSafely)
    }

    public val isAnyPlaying: Boolean
        get() = snapshot().any { it.isPlayingAudibly }

    public val isAnyAudioPlaying: Boolean
        get() = snapshot().any { it.kind == CoordinatedPlayerKind.Audio && it.isPlayingAudibly }

    /** Les volumes propres des lecteurs qui s'entendent, sans doublon : ce que l'enregistrement baisse. */
    public val audibleVolumeTargets: List<PlaybackVolumeTarget>
        get() = snapshot().filter { it.isPlayingAudibly }.mapNotNull { it.volumeTarget }.distinct()

    public val holdsAudiblePlayback: Boolean
        get() = isAnyPlaying

    /**
     * Un appel Meeshy décroché : un lecteur capable de reprendre se met en pause (marqué interrompu),
     * les autres s'arrêtent.
     */
    public fun interruptAllForCall() {
        snapshot().forEach { player ->
            runCatching {
                if (player.respondsToSessionInterruptions) {
                    player.handleSessionEvent(MediaSessionEvent.InterruptionBegan)
                } else {
                    player.stop()
                }
            }.onFailure { Timber.w(it, "Lecteur : interruption d'appel refusée") }
        }
    }

    /** Remet un événement de session aux lecteurs qui le traduisent eux-mêmes. */
    public fun dispatchSessionEvent(event: MediaSessionEvent) {
        snapshot().filter { it.respondsToSessionInterruptions }.forEach { player ->
            runCatching { player.handleSessionEvent(event) }
                .onFailure { Timber.w(it, "Lecteur : événement de session refusé") }
        }
    }

    /** Éteint en fondu les lecteurs « externes » (musique de story, aperçus). */
    public suspend fun fadeOutAllExternal(durationMs: Long) {
        val external = snapshot().filter { it.kind == CoordinatedPlayerKind.External }
        coroutineScope {
            external.forEach { player ->
                launch {
                    runCatching { player.fadeOutAndStop(durationMs) }
                        .onFailure { Timber.w(it, "Lecteur : fondu refusé") }
                }
            }
        }
    }

    private fun snapshot(): List<CoordinatedPlayer> = synchronized(lock) {
        prune()
        players.mapNotNull { it.get() }
    }

    private fun prune() {
        players.removeAll { it.get() == null }
    }

    private fun stopSafely(player: CoordinatedPlayer) {
        runCatching { player.stop() }.onFailure { Timber.w(it, "Lecteur : arrêt refusé") }
    }
}
