package me.meeshy.sdk.model

import kotlin.math.abs
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Ce qu'une surface du fil porte — miroir de `ReelMediaKind` (iOS `ReelFeedLayout.swift`). Une scène (post composé, story
 * republiée) concourt à l'élection comme une vidéo : le fil n'a qu'une loi de lecture, pas trois politiques.
 */
public enum class FeedReelKind { VIDEO, AUDIO, IMAGE_ONLY, SCENE }

/** Le cadre d'une surface candidate, en pixels de fenêtre : son milieu et sa hauteur (miroir de `ReelFrame`). */
public data class FeedReelFrame(
    val id: String,
    val midY: Float,
    val height: Float,
    val kind: FeedReelKind,
)

/**
 * Les lois d'autoplay du fil (iOS `mostCenteredReel`, `ReelPrewarmWindow`, `ReelEngineOwnershipPolicy`,
 * `ReelFeedSoundButtonPolicy`). Pures : l'écran n'en est que la projection.
 */
public object FeedReelAutoplay {

    /** La fraction de la surface qui doit être à l'écran pour concourir (la moitié). */
    public const val MIN_VISIBLE_FRACTION: Float = 0.5f

    /**
     * L'id de la surface dont le centre est le plus proche du centre du viewport, parmi celles assez visibles ; `null` si
     * aucune ne franchit le seuil. À égalité de distance, la première de la liste (l'ordre du fil) garde la main. La visibilité
     * se mesure sur la plus petite de la surface et du viewport : une scène plus haute que l'écran ne peut jamais être
     * « à moitié visible » et resterait sinon muette.
     */
    public fun mostCentered(
        frames: List<FeedReelFrame>,
        viewportMin: Float,
        viewportMax: Float,
        minVisibleFraction: Float = MIN_VISIBLE_FRACTION,
    ): String? {
        val viewportHeight = viewportMax - viewportMin
        if (viewportHeight <= 0f) return null
        val viewportMid = (viewportMin + viewportMax) / 2f
        var best: FeedReelFrame? = null
        var bestDistance = Float.MAX_VALUE
        for (frame in frames) {
            if (frame.height <= 0f) continue
            val top = frame.midY - frame.height / 2f
            val bottom = frame.midY + frame.height / 2f
            val visible = (min(bottom, viewportMax) - maxOf(top, viewportMin)).coerceAtLeast(0f)
            if (visible / min(frame.height, viewportHeight) < minVisibleFraction) continue
            val distance = abs(frame.midY - viewportMid)
            if (distance < bestDistance) {
                best = frame
                bestDistance = distance
            }
        }
        return best?.id
    }

    /**
     * La surface à PRÉCHAUFFER : celle qui suit l'active dans le sens du fil (la plus proche en dessous). Sans active, ou
     * si l'active a quitté la liste, personne.
     */
    public fun prewarmAfter(activeId: String?, frames: List<FeedReelFrame>): String? {
        val active = frames.firstOrNull { it.id == activeId } ?: return null
        return frames.filter { it.midY > active.midY }.minByOrNull { it.midY }?.id
    }

    /**
     * La garde UNIQUE de libération du moteur : une carte qui le possède et le montre le rend quand elle perd l'élection,
     * sort de l'écran ou rencontre un appel. Une carte qui ne le possède pas n'y touche jamais — une carte de repost
     * inactive qui pointe la même vidéo que l'active figerait sinon la lecture de cette dernière.
     */
    public fun shouldRelinquish(ownsEngine: Boolean, isShowingThis: Boolean): Boolean = ownsEngine && isShowingThis

    /** Le moteur appartient-il bien à cette carte : elle l'a pris, il a un lecteur, et il joue SON média. */
    public fun isEngineOwned(owns: Boolean, hasPlayer: Boolean, activeUrl: String?, expectedUrl: String): Boolean =
        owns && hasPlayer && activeUrl == expectedUrl

    /** Une carte peut-elle lire maintenant : élue, prête, et aucun appel ne tient la session audio. */
    public fun mayPlay(isActive: Boolean, isReady: Boolean, isCallActive: Boolean): Boolean =
        isActive && isReady && !isCallActive

    /** Le bouton son (haut-gauche) : carte active, moteur à elle, et une piste audio à couper. */
    public fun showsSoundButton(isActive: Boolean, isEngineOwned: Boolean, hasAudioTrack: Boolean): Boolean =
        isActive && isEngineOwned && hasAudioTrack

    /** Le muet imposé par le fil : tout ce qui n'a pas demandé le son est muet. */
    public fun isForceMuted(soundOn: Boolean): Boolean = !soundOn
}

/**
 * Le pas de publication des cadres (iOS `FeedScrollPublication.reportedMidY`) : un cadre n'est republié que lorsqu'il franchit
 * un multiple de 8 dp, pour que le défilement ne ré-élise pas à chaque pixel.
 */
public object FeedReelVisibility {
    public const val FRAME_STEP_DP: Float = 8f

    /** [px] arrondi au pas de 8 dp le plus proche, à la densité [density] (pixels par dp). */
    public fun quantizedPx(px: Float, density: Float): Float {
        val step = FRAME_STEP_DP * density.coerceAtLeast(MIN_DENSITY)
        return (px / step).roundToInt() * step
    }

    /** Le cadre publié d'une surface mesurée de [topPx] à [bottomPx] : milieu au pas, hauteur exacte. */
    public fun reported(id: String, kind: FeedReelKind, topPx: Float, bottomPx: Float, density: Float): FeedReelFrame =
        FeedReelFrame(
            id = id,
            midY = quantizedPx((topPx + bottomPx) / 2f, density),
            height = bottomPx - topPx,
            kind = kind,
        )

    private const val MIN_DENSITY = 0.1f
}

/** Qu'une valeur relayée ne soit ré-écrite que si elle change (l'offset d'en-tête du fil, iOS `relayFeedOffset`). */
public class FeedChangeRelay<T>(initial: T) {
    public var value: T = initial
        private set

    /** `true` quand [next] diffère de la valeur courante et vient de la remplacer. */
    public fun relay(next: T): Boolean {
        if (next == value) return false
        value = next
        return true
    }
}
