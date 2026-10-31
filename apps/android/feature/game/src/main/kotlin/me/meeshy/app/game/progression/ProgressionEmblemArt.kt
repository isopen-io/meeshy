package me.meeshy.app.game.progression

import me.meeshy.sdk.model.game.ChestStatus
import me.meeshy.sdk.model.game.FlameFormKey
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.LeagueKey
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.ui.component.game.GameBadgeShape
import me.meeshy.ui.component.game.GameMaterial
import me.meeshy.ui.component.game.SignatureStyle

/** Les deux concepts sans objet, dessinés par une marque : Points, Élans (iOS `ConceptEmblemDesign.Kind`). */
internal enum class ConceptMarkKind { Points, Elans }

/**
 * CE QUE l'emblème d'un concept dessine, lu dans l'état servi — miroir de `ProgressionConceptEmblem.drawing` (iOS).
 * Une table, pas du dessin : la vue la parcourt. La Meesh garde son pictogramme tant que la pièce n'est pas portée.
 */
internal sealed interface ProgressionEmblemArt {
    data object Ring : ProgressionEmblemArt
    data object Blason : ProgressionEmblemArt
    data class Signature(val style: SignatureStyle) : ProgressionEmblemArt
    data class Mark(val kind: ConceptMarkKind) : ProgressionEmblemArt
    data class Flame(val form: FlameFormKey) : ProgressionEmblemArt
    data class Chest(val open: Boolean) : ProgressionEmblemArt
    data class Gem(val league: LeagueKey) : ProgressionEmblemArt
    data class Cup(val material: GameMaterial) : ProgressionEmblemArt
    data class Stamp(val code: String, val stamped: Boolean) : ProgressionEmblemArt
    data class Badge(val material: GameMaterial, val shape: GameBadgeShape) : ProgressionEmblemArt
    data object Pictogram : ProgressionEmblemArt

    companion object {
        fun of(concept: ProgressionConcept, game: GameBlock?): ProgressionEmblemArt = when (concept) {
            ProgressionConcept.Level -> if (game != null) Ring else Signature(SignatureStyle.Flat)
            ProgressionConcept.Glory -> if (game != null) Blason else Signature(SignatureStyle.Engraved)
            ProgressionConcept.Points -> Mark(ConceptMarkKind.Points)
            ProgressionConcept.Elans -> Mark(ConceptMarkKind.Elans)
            ProgressionConcept.Meesh -> Pictogram
            ProgressionConcept.Flame -> Flame(game?.flame?.form ?: FlameFormKey.Braise)
            ProgressionConcept.Missions -> Chest(open = game?.chest?.status == ChestStatus.Claimed)
            ProgressionConcept.League -> Gem(game?.league?.current?.league ?: LeagueKey.Quartz)
            ProgressionConcept.Season -> Cup(GameMaterial.PLATINUM)
            ProgressionConcept.Prestige -> Cup(GameMaterial.PRISM)
            ProgressionConcept.Showcase -> Cup(GameMaterial.GOLD)
            ProgressionConcept.Atlas -> stamp(game)
            ProgressionConcept.Badges -> Badge(GameMaterial.GOLD, GameBadgeShape.Accumulation)
            ProgressionConcept.Defis -> Badge(GameMaterial.SILVER, GameBadgeShape.Record)
            ProgressionConcept.Succes -> Badge(GameMaterial.GOLD, GameBadgeShape.Collection(filled = 4, total = 6))
        }

        private fun stamp(game: GameBlock?): Stamp {
            val first = game?.atlas?.stamps?.firstOrNull() ?: return Stamp(code = "", stamped = false)
            return Stamp(code = first.language.uppercase(), stamped = true)
        }
    }
}
