package me.meeshy.sdk.model.game.progression

import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.engagement.EngagementProgress

/**
 * LES PIÈCES DE JEU QUI TIENNENT LA TÊTE d'une fiche (miroir de `ProgressionConceptGestures.isHero`, iOS) : quand le
 * concept a la sienne ET qu'elle existe (iOS `exist`), elle REMPLACE le héros générique et la fiche ne redit pas ce
 * qu'elle montre. Seules les pièces MONTÉES sur Android y figurent — un concept dont la pièce n'existe pas encore garde
 * son héros générique plutôt que de perdre ses faits. L'anneau du niveau ne se monte qu'avec le bloc de jeu : sans lui,
 * la tête générique dit déjà le niveau et sa jauge (iOS `ProgressionLevelHero`, à porter).
 */
public object ProgressionConceptPieces {
    public fun isHero(concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?): Boolean = when (concept) {
        ProgressionConcept.Elans -> true
        ProgressionConcept.Level -> game != null
        ProgressionConcept.League -> ProgressionLeaguePiece.of(game?.league) != null
        else -> false
    }
}
