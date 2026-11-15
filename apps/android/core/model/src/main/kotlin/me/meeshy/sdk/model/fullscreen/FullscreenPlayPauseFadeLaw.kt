package me.meeshy.sdk.model.fullscreen

import kotlin.time.Duration

/**
 * Le bouton pause d'une vidéo plein écran s'efface vite, et revient au doigt (miroir de
 * `FullscreenPlayPauseFade.swift`, #9577, directive porteur 2026-10-07).
 *
 * Un bouton posé au centre de l'image cache ce qu'on regarde. Il part donc une seconde
 * après le début de la lecture ([FullscreenChromeMetrics.PLAY_PAUSE_FADE_DELAY], distinct
 * des trois secondes du reste du chrome), un toucher sur le média le ramène et réarme la
 * seconde, et un toucher sur le bouton VISIBLE met en pause. En pause il reste : c'est la
 * seule façon de reprendre.
 *
 * Le toucher qui ramène le bouton garde aussi l'effet que l'hôte lui donne (basculer le
 * plein cadre ou le chrome) : la loi ne rend aucun verdict « ce toucher s'arrête au bouton ».
 *
 * Valeur immuable : chaque événement rend l'état suivant, jouable sans vue. [arming]
 * change à chaque réarmement — une tâche clée sur l'état repart donc d'elle-même, sans
 * minuteur à invalider.
 */
public data class FullscreenPlayPauseFadeLaw(
    val isPlaying: Boolean = false,
    val isRevealed: Boolean = true,
    val arming: Int = 0,
) {

    /** Affiché en permanence en pause ; en lecture, seulement tant qu'il est révélé. */
    public val isVisible: Boolean get() = !isPlaying || isRevealed

    /** Le délai avant effacement, ou `null` s'il n'y a rien à effacer. */
    public val fadeDelay: Duration?
        get() = if (isPlaying && isRevealed) FullscreenChromeMetrics.PLAY_PAUSE_FADE_DELAY else null

    /**
     * Le moteur change d'état de lecture. Démarrer montre le bouton et arme la seconde ;
     * mettre en pause le ramène pour de bon. Une valeur IDENTIQUE n'est pas un changement :
     * le moteur republie.
     */
    public fun playback(isPlaying: Boolean): FullscreenPlayPauseFadeLaw =
        if (isPlaying == this.isPlaying) {
            this
        } else {
            FullscreenPlayPauseFadeLaw(isPlaying = isPlaying, isRevealed = true, arming = arming + 1)
        }

    /** Un toucher sur le média pendant la lecture : le bouton est là, et la seconde repart. */
    public fun tappingMedia(): FullscreenPlayPauseFadeLaw =
        if (!isPlaying) this else FullscreenPlayPauseFadeLaw(isPlaying = true, isRevealed = true, arming = arming + 1)

    /** L'état au terme du délai. Une pause survenue entre-temps gagne. */
    public fun fading(): FullscreenPlayPauseFadeLaw =
        if (!isPlaying || !isRevealed) this else copy(isRevealed = false)
}
