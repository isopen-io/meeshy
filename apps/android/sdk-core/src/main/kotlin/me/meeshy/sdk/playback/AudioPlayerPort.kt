package me.meeshy.sdk.playback

/**
 * D'où vient le son. Un vocal [Remote.isProtected] (éphémère, vue unique, flouté, chiffré) ne touche
 * jamais le disque : la source qui le lit ne le met pas en cache. La protection n'a pas de défaut :
 * chaque source réseau DIT si elle est protégée, un oubli ne compile pas.
 */
internal sealed interface AudioSource {
    data class Remote(val url: String, val isProtected: Boolean) : AudioSource
    data class Local(val fileUri: String) : AudioSource
}

/**
 * Le lecteur matériel derrière le moteur : la couture qui garde Media3 hors de la logique (échange
 * atomique, garde d'appel, rapports, reprise) pour qu'elle se prouve sans décodeur.
 *
 * Chaque chargement porte une génération ; tout rappel d'une génération périmée est ignoré par le
 * moteur (un vocal remplacé ne parle plus au nom du suivant).
 */
internal interface AudioPlayerPort {

    interface Listener {
        /** Source prête, en pause ; [durationMs] vaut 0 quand elle est inconnue. */
        fun onPrepared(generation: Int, durationMs: Long)
        fun onEnded(generation: Int)
        fun onError(generation: Int, cause: Throwable)

        /** Le lecteur a changé son intention de jouer (focus perdu ou rendu, casque débranché…). */
        fun onPlayWhenReadyChanged(generation: Int, playWhenReady: Boolean)
    }

    fun setListener(listener: Listener?)

    /** Prépare [source] SANS la jouer, à la vitesse [speed] (hauteur préservée). */
    fun load(source: AudioSource, generation: Int, speed: Float)

    fun play()
    fun pause()
    fun seekTo(positionMs: Long)
    fun setSpeed(speed: Float)
    fun positionMs(): Long

    /** Décharge la source ; le lecteur reste prêt à en recevoir une autre. */
    fun stop()
    fun release()
}

internal fun interface AudioPlayerPortFactory {
    fun create(): AudioPlayerPort
}
