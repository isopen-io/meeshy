package me.meeshy.sdk.model.game.progression

import kotlin.math.roundToInt
import me.meeshy.sdk.model.game.engagement.EngagementAxisFamily
import me.meeshy.sdk.model.game.engagement.EngagementElanProgress

/** La phrase sous les familles de la pièce des Élans (iOS `ProgressionElansHero.explication`). */
public sealed interface ElansLine {
    /** Aucune famille active : ce qui en allume une. */
    public data object Empty : ElansLine

    /** Des familles, pas encore d'accélération : en tenir une de plus. */
    public data object Hint : ElansLine

    /** L'élan court : son facteur, ce qui le porte (familles, fenêtre, assise) et son effet. */
    public data class Explained(val factor: Int, val families: Int, val windowDays: Int, val standing: Boolean) : ElansLine
}

/**
 * LA PIÈCE DES ÉLANS (miroir de `ProgressionElansHero`, iOS #5842) — ce sur quoi on est en train de tenir. Les familles
 * sont celles de la FENÊTRE servie (#5927), jamais un balayage des compteurs : la phrase et les pastilles disent la
 * même chose. [factor] (entier, comme iOS l'affiche) n'est là que quand l'élan accélère.
 */
public data class ProgressionElansPiece(
    val factor: Int?,
    val families: List<EngagementAxisFamily>,
    val line: ElansLine,
) {
    public companion object {
        public fun of(elan: EngagementElanProgress?): ProgressionElansPiece {
            val families = elan?.activeFamilies.orEmpty()
            val factor = elan?.takeIf { it.isAccelerated }?.factor?.roundToInt()
            val line = when {
                families.isEmpty() -> ElansLine.Empty
                elan == null || factor == null -> ElansLine.Hint
                else -> ElansLine.Explained(factor, elan.activeFamilyCount, elan.windowDays, elan.hasStanding)
            }
            return ProgressionElansPiece(factor, families, line)
        }
    }
}

/**
 * LES PIÈCES DE JEU QUI TIENNENT LA TÊTE d'une fiche (miroir de `ProgressionConceptGestures.isHero`, iOS) : quand le
 * concept a la sienne, elle REMPLACE le héros générique et la fiche ne redit pas ce qu'elle montre. Seules les pièces
 * MONTÉES sur Android y figurent — un concept dont la pièce n'existe pas encore garde son héros générique plutôt que de
 * perdre ses faits.
 */
public object ProgressionConceptPieces {
    public fun isHero(concept: ProgressionConcept): Boolean = when (concept) {
        ProgressionConcept.Elans -> true
        else -> false
    }
}
