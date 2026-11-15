package me.meeshy.sdk.model.fullscreen

import kotlin.time.Duration

/** Ce qu'un visualiseur plein écran peut monter AU-DESSUS de la scène pour qu'on lui parle. */
public sealed interface FullscreenOverlay {

    /** La rangée d'émojis ouverte par « Réagir ». */
    public data object Reactions : FullscreenOverlay

    /** La barre de saisie ouverte par « Répondre ». */
    public data object Reply : FullscreenOverlay

    /** Un panneau propre à la surface (commentaires, traductions, vues…), nommé par l'hôte. */
    public data class Panel(val id: String) : FullscreenOverlay
}

/**
 * Ce que le chrome plein écran PEINT — une loi, pour tous les visualiseurs (miroir de
 * `FullscreenChromeState.swift`, #8878).
 *
 * Deux façons de n'avoir aucun contrôle à l'écran, et elles ne se confondent pas :
 * l'IMMERSION (un tap sur le média, ou l'effacement d'une vidéo en lecture) rend l'image
 * entière ; une OUVERTURE (réagir, répondre, un panneau) voile le reste du chrome pour
 * qu'on parle au média en silence.
 *
 * Valeur immuable : chaque geste rend l'état suivant, jouable sans vue.
 */
public class FullscreenChromeState private constructor(
    public val isImmersive: Boolean,
    public val overlay: FullscreenOverlay?,
) {

    /** La barre haute, le rail d'actions, la légende et la progression. */
    public val showsChrome: Boolean get() = !isImmersive && overlay == null

    /** Le voile de lisibilité existe pour détacher le chrome : il part et revient avec lui. */
    public val showsScrims: Boolean get() = showsChrome

    public fun isOpen(candidate: FullscreenOverlay): Boolean = overlay == candidate

    /** Un tap sur le média referme d'abord ce qui est ouvert ; sinon il bascule l'immersion. */
    public fun tappingMedia(): FullscreenChromeState =
        if (overlay != null) Initial else of(isImmersive = !isImmersive)

    /**
     * Ouvrir une surface congédie l'autre : la rangée d'émojis ne flotte jamais au-dessus
     * d'un champ de saisie.
     */
    public fun opening(candidate: FullscreenOverlay): FullscreenChromeState = of(overlay = candidate)

    /** Le même bouton ouvre et referme sa surface. */
    public fun toggling(candidate: FullscreenOverlay): FullscreenChromeState =
        if (isOpen(candidate)) closingOverlay() else opening(candidate)

    public fun closingOverlay(): FullscreenChromeState = of(isImmersive = isImmersive)

    /** Ce qui ramène le chrome sans rien fermer (un toucher sur la barre, une pause). */
    public fun revealing(): FullscreenChromeState = of(isImmersive = false, overlay = overlay)

    /** Changer de page retire ce qui visait la pièce précédente ; l'immersion reste. */
    public fun turningPage(): FullscreenChromeState = of(isImmersive = isImmersive)

    /**
     * Le délai d'effacement automatique : seulement pendant une LECTURE, seulement quand le
     * chrome est à l'écran et que rien n'est ouvert. Une image ne s'efface jamais d'elle-même.
     */
    public fun autoHideDelay(isPlaying: Boolean): Duration? =
        if (isPlaying && showsChrome) FullscreenChromeMetrics.AUTO_HIDE_DELAY else null

    /** L'état au terme de ce délai. Une ouverture survenue entre-temps gagne. */
    public fun autoHiding(): FullscreenChromeState =
        if (overlay == null) of(isImmersive = true) else this

    override fun equals(other: Any?): Boolean =
        other is FullscreenChromeState && other.isImmersive == isImmersive && other.overlay == overlay

    override fun hashCode(): Int = 31 * isImmersive.hashCode() + (overlay?.hashCode() ?: 0)

    override fun toString(): String = "FullscreenChromeState(isImmersive=$isImmersive, overlay=$overlay)"

    public companion object {

        public val Initial: FullscreenChromeState = FullscreenChromeState(isImmersive = false, overlay = null)

        /**
         * Une ouverture n'existe jamais en immersion : elle vient d'un bouton du chrome,
         * donc d'un chrome visible.
         */
        public fun of(isImmersive: Boolean = false, overlay: FullscreenOverlay? = null): FullscreenChromeState =
            FullscreenChromeState(isImmersive = overlay == null && isImmersive, overlay = overlay)
    }
}
