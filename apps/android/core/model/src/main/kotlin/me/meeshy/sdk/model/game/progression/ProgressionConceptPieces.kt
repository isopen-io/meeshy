package me.meeshy.sdk.model.game.progression

import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.engagement.EngagementProgress

/**
 * LES PIÈCES DE JEU QUI TIENNENT LA TÊTE d'une fiche (miroir de `ProgressionConceptGestures.isHero`, iOS) : quand le
 * concept a la sienne ET qu'elle existe (iOS `exist`), elle REMPLACE le héros générique et la fiche ne redit pas ce
 * qu'elle montre. Le Niveau en a toujours une — l'anneau avec le bloc de jeu, `ProgressionLevelHero` sans lui ; la
 * Meesh dès qu'un bloc de jeu (l'Héritage et sa frappe) OU un portefeuille (`ProgressionMeeshDetail`) est servi.
 */
public object ProgressionConceptPieces {
    public fun isHero(concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?): Boolean = when (concept) {
        ProgressionConcept.Elans, ProgressionConcept.Level -> true
        ProgressionConcept.Meesh -> game != null || progress.meesh != null
        ProgressionConcept.League -> ProgressionLeaguePiece.of(game?.league) != null
        else -> false
    }
}
