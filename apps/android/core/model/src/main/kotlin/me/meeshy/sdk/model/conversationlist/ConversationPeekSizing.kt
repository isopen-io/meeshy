package me.meeshy.sdk.model.conversationlist

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** Les deux crans du menu d'appui long : la rangée de tête seule, ou toutes les actions. */
enum class PeekMenuDetent(val progress: Float) {
    Compact(0f),
    Expanded(1f),
}

/** Les deux hauteurs que la progression pilote ; leur somme, écart et voile compris, reste celle de l'écran. */
data class PeekHeights(val card: Float, val menu: Float)

/**
 * La géométrie de l'aperçu d'appui long (#17244) : une carte de conversation au-dessus d'un menu
 * qu'on tire vers le haut. Une seule valeur, la progression 0 → 1, décide des deux hauteurs ; le
 * geste ne fait que la déplacer, image par image. Toutes les longueurs sont dans la même unité
 * (pixels côté Compose).
 *
 * Au repos, la carte ne prend que [ConversationPeekSizing.CARD_SHARE] de la place que le menu
 * compact lui laisse (#17274) : le reste est un [veil] constant au-dessus d'elle, où la liste
 * reste visible et qu'on touche pour fermer (#17258). Le voile ne bouge pas pendant le tirage :
 * la carte perd exactement ce que le menu gagne.
 *
 * @param available hauteur que se partagent la carte, l'écart et le menu.
 * @param minCard hauteur sous laquelle la carte ne descend jamais (son en-tête reste lisible).
 * @param compactMenu hauteur du menu compact : poignée + rangée de tête.
 * @param naturalMenu hauteur que le menu prendrait pour montrer toutes ses actions.
 */
data class ConversationPeekGeometry(
    val available: Float,
    val gap: Float,
    val minCard: Float,
    val compactMenu: Float,
    val naturalMenu: Float,
) {
    private val room: Float get() = max(0f, available - gap)

    private val compact: Float get() = min(max(0f, compactMenu), room)

    /** La carte au repos, la plus haute qu'elle sera jamais : on la mesure une fois à cette taille. */
    val restingCard: Float get() = (room - compact) * ConversationPeekSizing.CARD_SHARE

    /** La bande laissée au-dessus de la carte, la même à tous les crans. */
    val veil: Float get() = room - compact - restingCard

    private val stack: Float get() = room - veil

    /** La plus haute que le menu puisse être sans réduire la carte sous [minCard]. */
    val menuCeiling: Float get() = max(compact, stack - minCard)

    /** Le menu étendu : tout son contenu, sans jamais réduire la carte sous [minCard]. */
    val expandedMenu: Float get() = min(max(compact, naturalMenu), menuCeiling)

    /** La course du geste : ce que le menu gagne entre ses deux crans. */
    val travel: Float get() = expandedMenu - compact

    fun heightsAt(progress: Float): PeekHeights {
        val menu = compact + travel * progress.coerceIn(0f, 1f)
        return PeekHeights(card = max(0f, stack - menu), menu = menu)
    }

    /** [upwardDelta] positif quand le doigt monte ; la progression reste entre les deux crans. */
    fun progressAfterDrag(progress: Float, upwardDelta: Float): Float {
        if (travel <= 0f) return progress.coerceIn(0f, 1f)
        return (progress + upwardDelta / travel).coerceIn(0f, 1f)
    }

    /**
     * Le cran conclu au relâcher : un lancer franc décide par son sens, sinon le cran le plus
     * proche (seuil à mi-course). Sans course, le menu montre déjà tout : il est étendu.
     */
    fun settle(progress: Float, upwardVelocity: Float): PeekMenuDetent {
        if (travel <= 0f) return PeekMenuDetent.Expanded
        val flingThreshold = travel * ConversationPeekSizing.FLING_TRAVELS_PER_SECOND
        if (abs(upwardVelocity) >= flingThreshold) {
            return if (upwardVelocity > 0f) PeekMenuDetent.Expanded else PeekMenuDetent.Compact
        }
        return if (progress >= ConversationPeekSizing.SETTLE_THRESHOLD) PeekMenuDetent.Expanded else PeekMenuDetent.Compact
    }
}

object ConversationPeekSizing {
    /** La carte et le menu sont 20 % plus petits que la place offerte (#17274). */
    const val CARD_SHARE: Float = 0.8f

    /** Le panneau (carte et menu) : 80 % de la largeur entre les marges. */
    fun panelWidth(available: Float, margin: Float): Float =
        max(0f, available - 2 * margin) * CARD_SHARE

    /** Le décalage qui centre le panneau dans la largeur offerte. */
    fun panelOffset(available: Float, panelWidth: Float): Float = max(0f, (available - panelWidth) / 2)

    /** Relâché lentement, le menu passe étendu à partir de la moitié de la course. */
    const val SETTLE_THRESHOLD: Float = 0.5f

    /** Un lancer d'au moins 1,2 course par seconde décide par son sens, quelle que soit la position. */
    const val FLING_TRAVELS_PER_SECOND: Float = 1.2f

    /**
     * Avec un lecteur d'écran ou les animations réduites, le menu s'ouvre étendu : toutes les
     * actions sont atteignables sans le geste.
     */
    fun initialDetent(screenReader: Boolean, reduceMotion: Boolean): PeekMenuDetent =
        if (screenReader || reduceMotion) PeekMenuDetent.Expanded else PeekMenuDetent.Compact
}

/** Ce que conclut le relâcher d'un glissé vers le bas sur la carte. */
enum class PeekPullDownRelease { Restore, Dismiss }

/**
 * Glisser la carte vers le BAS ferme l'aperçu (#17258), comme sur iOS : la carte suit le doigt,
 * remonter avant de relâcher la ramène, et le relâcher ferme au-delà de [DISMISS_FRACTION] de la
 * course, position projetée (la vitesse comprise) ; en deçà, elle revient en place.
 */
object ConversationPeekPullDown {
    const val DISMISS_FRACTION: Float = 0.79f

    /** Le temps sur lequel la vitesse au relâcher prolonge la position. */
    const val PROJECTION_SECONDS: Float = 0.1f

    fun offsetAfterDrag(offset: Float, downwardDelta: Float): Float = max(0f, offset + downwardDelta)

    fun progress(offset: Float, distance: Float): Float =
        if (distance <= 0f) 0f else (offset / distance).coerceIn(0f, 1f)

    fun release(offset: Float, downwardVelocity: Float, distance: Float): PeekPullDownRelease {
        val projected = offset + downwardVelocity * PROJECTION_SECONDS
        return if (projected >= distance * DISMISS_FRACTION) PeekPullDownRelease.Dismiss else PeekPullDownRelease.Restore
    }
}
