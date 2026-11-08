package me.meeshy.sdk.playback

import me.meeshy.sdk.model.playback.VideoMuteState

/**
 * L'état PUBLIÉ du lecteur vidéo partagé. Les vues ne s'abonnent jamais à la tête de lecture à haute
 * fréquence : [positionMs] est miroité à faible fréquence (quelques fois par seconde) et la barre de
 * lecture interroge [SharedVideoPlayerManager.liveProgress] quand elle dessine.
 */
public data class VideoPlaybackState(
    /** L'identité du média actif (URL ou identifiant de pièce) ; vide : rien n'est chargé. */
    val activeMedia: String = "",
    val attachmentId: String? = null,
    val isPlaying: Boolean = false,
    val positionMs: Long = 0L,
    val durationMs: Long = 0L,
    val speed: Float = 1f,
    val isLooping: Boolean = false,
    val isPipActive: Boolean = false,
    /** Le premier plan est lu : la surface peut retirer son poster. */
    val hasRenderedFirstFrame: Boolean = false,
    val mute: VideoMuteState = VideoMuteState(),
) {
    val effectiveMuted: Boolean get() = mute.effectiveMuted
}

/** Un média à charger : son identité, sa source distante et, si présent, son fichier local. */
public data class VideoMedia(
    val url: String,
    val attachmentId: String? = null,
    /** Le fichier du disque quand il existe : il prime toujours sur le flux. */
    val localFileUri: String? = null,
) {
    /** L'identité comparée à celle des surfaces : la pièce quand elle existe, sinon l'URL. */
    val identity: String get() = url
}

/** Ce que le lecteur rapporte à l'observateur de visionnage ; `complete` ne part qu'UNE fois par fin de flux. */
public data class VideoWatchEvent(
    val media: String,
    val attachmentId: String?,
    val positionMs: Long,
    val durationMs: Long,
    val complete: Boolean,
)

/** D'où le lecteur lit. */
public data class VideoSource(val uri: String, val isLocalFile: Boolean)

/**
 * Le lecteur matériel derrière le moteur : la couture qui garde Media3 hors de la logique (exclusivité,
 * fin unique, boucle, mute) pour qu'elle se prouve sans décodeur. Chaque chargement porte une
 * génération ; tout rappel d'une génération périmée est ignoré.
 */
public interface VideoPlayerPort {

    public interface Listener {
        public fun onPrepared(generation: Int, durationMs: Long)
        public fun onFirstFrame(generation: Int)
        public fun onIsPlayingChanged(generation: Int, isPlaying: Boolean)

        /** Le flux est fini ET aucun successeur n'a enchaîné. */
        public fun onEnded(generation: Int)

        /** La file a enchaîné d'elle-même sur le successeur de boucle. */
        public fun onLoopTurn(generation: Int)
        public fun onError(generation: Int, cause: Throwable)
    }

    /** `true` quand le lecteur déjà chargé lit le fichier local (et non le flux). */
    public val playsLocalFile: Boolean
    public val isReady: Boolean

    public fun setListener(listener: Listener?)
    public fun load(source: VideoSource, generation: Int, speed: Float)
    public fun play()
    public fun pause()
    public fun seekTo(positionMs: Long)
    public fun setSpeed(speed: Float)
    public fun setMuted(muted: Boolean)

    /**
     * Rallume ou éteint les PISTES audio du lecteur (`setTrackTypeDisabled`) : couper la sortie ne coupe pas
     * le décodage. Sans effet par défaut (lecteurs de test).
     */
    public fun setAudioTracksEnabled(enabled: Boolean) {}
    public fun setLooping(looping: Boolean)

    /** Met en file UN successeur du même média ; `false` si la file n'en accepte pas. */
    public fun queueLoopSuccessor(): Boolean
    public fun dropLoopSuccessors()
    public fun positionMs(): Long
    public fun stop()
    public fun release()
}

/** Un lecteur préparé en avance (voisin de réel) que le moteur peut adopter. */
public class PreparedVideo(public val port: VideoPlayerPort, public val durationMs: Long = 0L)

public fun interface VideoPlayerPortFactory {
    public fun create(): VideoPlayerPort
}
