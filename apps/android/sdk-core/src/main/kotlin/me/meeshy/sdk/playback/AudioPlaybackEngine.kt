package me.meeshy.sdk.playback

import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.model.MeeshyMediaConsumption
import me.meeshy.sdk.model.media.PlaybackSpeed
import me.meeshy.sdk.model.playback.AudioPlaybackState
import me.meeshy.sdk.model.playback.PlaybackCommandOrigin

/** Ce que le moteur dit au propriétaire de la file (le coordinateur d'une conversation). */
public sealed interface AudioEngineEvent {
    /**
     * Le vocal [attachmentId] est terminé : [completed] vrai à la fin naturelle, faux sur un échec de
     * chargement ou de lecture (la file doit quand même passer le vocal cassé, pas rester bloquée).
     */
    public data class Finished(val attachmentId: String, val completed: Boolean) : AudioEngineEvent
}

/**
 * **Le moteur de lecture audio** — la surface de contrôle de iOS `AudioPlaybackManager` /
 * `AudioPlaybackEngineDriving`, sans aucun type Media3 : un seul vocal chargé à la fois, un état
 * observable, jamais de plantage sur une source cassée.
 *
 * Toutes les commandes s'appellent depuis le fil principal (le moteur y est confiné) ; le décodage
 * et la préparation, eux, tournent sur les fils du lecteur.
 */
public interface AudioPlaybackEngine {
    public val state: StateFlow<AudioPlaybackState>
    public val events: SharedFlow<AudioEngineEvent>

    /**
     * Joue la piste réseau [url] (cache disque du compte : un second passage hors ligne ne re-télécharge
     * pas, SAUF un vocal [isProtected], qui ne s'écrit jamais sur le disque). [isProtected] n'a pas de
     * défaut : l'appelant dit toujours si le vocal est protégé, un oubli ne compile pas.
     * Rend `false` quand la garde d'appel refuse. Jouer B pendant que A joue arrête A et bascule
     * l'identifiant d'un seul geste.
     */
    public fun play(
        attachmentId: String,
        url: String,
        origin: PlaybackCommandOrigin = PlaybackCommandOrigin.InApp,
        isProtected: Boolean,
    ): Boolean

    /** Joue un fichier local `file://` (vocal optimiste pas encore envoyé). */
    public fun playLocal(attachmentId: String, fileUri: String, origin: PlaybackCommandOrigin = PlaybackCommandOrigin.InApp): Boolean

    public fun togglePlayPause(origin: PlaybackCommandOrigin = PlaybackCommandOrigin.InApp)
    public fun pause()

    /** Reprise après une interruption système : seulement si rien ne l'interdit (appel). */
    public fun resumeFromInterruption()
    public fun stop()
    public fun seek(fraction: Double)
    public fun seekToMs(positionMs: Long)
    public fun skip(seconds: Double)
    public fun setSpeed(speed: PlaybackSpeed)
    public fun cycleSpeed()

    /** Boucle (réels audio) : vaut pour la piste chargée seulement, jamais pour la suivante. */
    public fun setLoop(loop: Boolean)

    /** La consommation SERVIE pour [attachmentId] ; elle voyage avec l'identifiant qu'elle qualifie. */
    public fun setServedConsumption(attachmentId: String, consumption: MeeshyMediaConsumption?)

    /** La langue de la piste ou de la transcription sous les yeux, déclarée par la vue. */
    public fun setConsumedLanguageProvider(provider: (() -> String?)?)

    /**
     * #15969 — le vocal chargé [fromAttachmentId] a été accusé : il s'appelle désormais [toAttachmentId] et se sert depuis
     * [servedUrl]. La lecture continue telle quelle sous ce nom ; si la source qu'il lisait disparaît (copie locale rangée
     * dans le cache à l'accusé), il est reciblé UNE fois, au même point, sur [servedUrl]. Une autre pièce : rien ne change.
     */
    public fun follow(fromAttachmentId: String, toAttachmentId: String, servedUrl: String, isProtected: Boolean) {}
}
