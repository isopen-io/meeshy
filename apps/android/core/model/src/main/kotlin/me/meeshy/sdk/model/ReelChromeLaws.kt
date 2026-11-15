package me.meeshy.sdk.model

import me.meeshy.sdk.model.accessibility.ReadingDirection
import kotlin.math.max

/**
 * Le mode immersif du lecteur de réels (iOS `chromeHidden`) : un appui long efface tout le chrome,
 * le toucher suivant le RENDRE sans basculer la lecture, et un autre réel repart avec son chrome.
 * Immuable : chaque geste rend l'état suivant.
 */
public data class ReelChromeState(val immersive: Boolean = false) {
    /** Le résultat d'un toucher sur le média : l'état suivant et ce que la page doit en faire. */
    public data class TapResult(val state: ReelChromeState, val outcome: ReelContentTap.Outcome)

    public fun enterImmersive(): ReelChromeState = copy(immersive = true)

    public fun restore(): ReelChromeState = copy(immersive = false)

    /** Changer de réel ne porte jamais un chrome masqué sur le suivant. */
    public fun onPageChanged(): ReelChromeState = ReelChromeState()

    public fun onContentTap(hasPlayableMedia: Boolean): TapResult {
        val outcome = ReelContentTap.outcome(chromeHidden = immersive, hasPlayableMedia = hasPlayableMedia)
        val next = if (outcome == ReelContentTap.Outcome.RESTORE_CHROME) restore() else this
        return TapResult(next, outcome)
    }

    public companion object {
        /** Durée d'appui qui entre en mode immersif (secondes ; haptique moyenne à ce seuil). */
        public const val LONG_PRESS_SECONDS: Float = 0.3f
        public const val FADE_MILLIS: Int = 250
    }
}

/**
 * Fermeture du lecteur par glissement depuis le bord de DÉBUT de lecture (iOS « retour angle gauche ») :
 * une bande de 18 dp qui ne dispute jamais le pager, un seuil de 70 dp, le contenu qui suit le doigt.
 * Les distances sont exprimées dans le sens de la LECTURE : en RTL la bande est à droite et on pousse
 * vers la gauche.
 */
public object ReelEdgeSwipeBack {
    public const val ZONE_DP: Float = 18f
    public const val THRESHOLD_DP: Float = 70f
    public const val MINIMUM_DISTANCE_DP: Float = 12f

    /** [distanceFromStartEdge] : distance du doigt au bord de début de lecture. */
    public fun isInZone(distanceFromStartEdge: Float): Boolean = distanceFromStartEdge in 0f..ZONE_DP

    /** Le décalage que prend le contenu : jamais négatif dans le sens de la lecture. */
    public fun follow(translationX: Float, isRtl: Boolean): Float =
        max(0f, ReadingDirection.readingDelta(translationX, isRtl))

    public fun shouldClose(translationX: Float, isRtl: Boolean): Boolean =
        ReadingDirection.readingDelta(translationX, isRtl) > THRESHOLD_DP
}

/** Géométrie de la barre de lecture : la zone utile fait 44 dp, bien plus que la piste dessinée. */
public object ReelScrubGeometry {
    public const val HIT_HEIGHT_DP: Float = 44f
    public const val TRACK_HEIGHT_DP: Float = 4f

    /** Position du doigt -> instant de recherche ; `null` tant que la durée est inconnue. */
    public fun seekMs(x: Float, width: Float, durationMs: Long): Long? =
        ReelScrub.seekMs(ReelScrub.fraction(x, width), durationMs)
}

/**
 * La porte d'autostart d'une page de réel, avec ses quatre raisons de se taire : page non élue ou
 * révélation inachevée, appel en cours, pause demandée par l'utilisateur, focus audio perdu.
 * Un appel qui finit ou un focus qui revient la rouvre : la lecture reprend d'elle-même.
 */
public data class ReelAutostartGate(
    val isActive: Boolean,
    val revealCompleted: Boolean,
    val isCallActive: Boolean = false,
    val userPaused: Boolean = false,
    val audioFocusLost: Boolean = false,
) {
    public val shouldPlay: Boolean
        get() = ReelMediaAutostart.shouldStart(isActive, revealCompleted, isCallActive) && !userPaused && !audioFocusLost

    public fun withCall(active: Boolean): ReelAutostartGate = copy(isCallActive = active)

    public fun withFocusLost(lost: Boolean): ReelAutostartGate = copy(audioFocusLost = lost)

    public fun withUserPaused(paused: Boolean): ReelAutostartGate = copy(userPaused = paused)
}

/** Ce que la page vidéo montre : le shimmer, le poster, puis la vidéo dès son premier plan. */
public enum class ReelPosterPhase {
    SHIMMER,
    POSTER,
    VIDEO,
    ;

    public companion object {
        public fun of(hasPoster: Boolean, posterLoaded: Boolean, firstFrameShown: Boolean): ReelPosterPhase = when {
            firstFrameShown -> VIDEO
            hasPoster && posterLoaded -> POSTER
            else -> SHIMMER
        }
    }
}
