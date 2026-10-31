package me.meeshy.sdk.model.game.progression

import me.meeshy.sdk.model.game.ChestStatus
import me.meeshy.sdk.model.game.FlameStatus
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.ShowcaseVisibility
import me.meeshy.sdk.model.game.engagement.EngagementProgress

/**
 * LA PHRASE D'ÉTAT D'UN CONCEPT et les faits qu'elle enchâsse — miroir de `ProgressionConceptModel.stateLine` (iOS) et
 * des clés `game.state.*` du web. La loi choisit la phrase et ses nombres servis ; l'écran l'habille. Les Étincelles
 * n'en ont pas sur la fiche : la poche y est toujours dans la tête, qui l'écarterait. Niveau, Héritage, Ligue, Voyage,
 * Renaissance et Élans attendent leur port (#13909).
 */
public object ProgressionConceptStates {

    public fun stateLine(concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?): FicheStateLine? =
        when (concept) {
            ProgressionConcept.Glory -> gloryState(game)
            ProgressionConcept.Flame -> flameState(progress, game)
            ProgressionConcept.Missions -> missionsState(game)
            ProgressionConcept.Badges -> countedState(concept, progress.badgesEarned, progress.badgesTotal)
            ProgressionConcept.Defis -> countedState(
                concept,
                ProgressionConceptModel.defisDone(progress),
                ProgressionConceptModel.defisTotal(progress),
            )
            ProgressionConcept.Succes -> countedState(concept, progress.unlockedAchievementCount, progress.achievements.size)
            ProgressionConcept.Showcase -> showcaseState(game)
            ProgressionConcept.Atlas -> atlasState(game)
            ProgressionConcept.Points, ProgressionConcept.Meesh, ProgressionConcept.Level, ProgressionConcept.League,
            ProgressionConcept.Season, ProgressionConcept.Prestige, ProgressionConcept.Elans,
            -> null
        }

    /** L'état de la Flamme en mots (iOS `ProgressionConceptModel.flameStatus`) ; allumée, rien à dire. */
    public fun flameStatus(status: FlameStatus): GameText? = when (status) {
        FlameStatus.None -> GameText(GameTextKey.FlameStatusNone)
        FlameStatus.Lit -> null
        FlameStatus.AtRisk -> GameText(GameTextKey.FlameStatusAtRisk)
        FlameStatus.Covered -> GameText(GameTextKey.FlameStatusCovered)
        FlameStatus.Out -> GameText(GameTextKey.FlameStatusOut)
    }

    private fun count(value: Int): GameTextArg = GameTextArg.Count(value)

    private fun nested(text: GameText): GameTextArg = GameTextArg.Nested(text)

    private fun gloryState(game: GameBlock?): FicheStateLine? {
        val glory = game?.glory ?: return null
        val rank = nested(ProgressionConceptModel.rankLabel(glory))
        val held = count(glory.glory)
        val next = glory.next
            ?: return FicheStateLine(GameText.of(GameTextKey.StateGloryTop, rank, held), ConceptFact.Rank, ConceptFact.Glory)
        val missing = glory.gloryMissing ?: (next.minGlory - glory.glory).coerceAtLeast(0)
        return FicheStateLine(
            GameText.of(
                GameTextKey.StateGloryNext,
                rank,
                held,
                count(missing),
                nested(ProgressionConceptModel.rankLabel(next.rank, next.division5 ?: next.division)),
            ),
            ConceptFact.Rank, ConceptFact.Glory, ConceptFact.GloryMissing, ConceptFact.RankNext,
        )
    }

    private fun flameState(progress: EngagementProgress, game: GameBlock?): FicheStateLine? {
        val flame = game?.flame
        if (flame == null) {
            val streak = progress.streak
            if (streak.currentDays <= 0) return FicheStateLine(GameText(GameTextKey.StateFlameNone))
            return FicheStateLine(
                GameText.of(
                    GameTextKey.StateFlameStreak,
                    nested(GameCopyLaws.days(streak.currentDays)),
                    nested(GameCopyLaws.days(streak.longestDays)),
                ),
                ConceptFact.Streak, ConceptFact.StreakRecord,
            )
        }
        val days = nested(GameCopyLaws.days(flame.days))
        return when (flame.status) {
            FlameStatus.None -> FicheStateLine(GameText(GameTextKey.StateFlameNone))
            FlameStatus.Out -> FicheStateLine(GameText(GameTextKey.StateFlameOut), ConceptFact.FlameState)
            FlameStatus.AtRisk -> FicheStateLine(GameText.of(GameTextKey.StateFlameAtRisk, days), ConceptFact.Streak, ConceptFact.FlameState)
            FlameStatus.Covered -> FicheStateLine(GameText.of(GameTextKey.StateFlameCovered, days), ConceptFact.Streak, ConceptFact.FlameState)
            FlameStatus.Lit -> FicheStateLine(
                GameText.of(
                    GameTextKey.StateFlameLit,
                    days,
                    count(flame.bonusPercent.coerceIn(0, 100)),
                    nested(GameText.of(GameTextKey.Ratio, count(flame.freezes), count(flame.maxFreezes))),
                ),
                ConceptFact.Streak, ConceptFact.FlameForm, ConceptFact.Freezes,
            )
        }
    }

    private fun missionsState(game: GameBlock?): FicheStateLine? {
        val block = game ?: return null
        val missions = block.missions
        if (!missions.unlocked) {
            return FicheStateLine(
                GameCopyLaws.missionsLocked(block.level.shown.level),
                ConceptFact.MissionsUnlockLevel, ConceptFact.Level,
            )
        }
        val total = missions.items.size
        val done = missions.items.count { it.isCompleted }
        return when (block.chest.status) {
            ChestStatus.Claimed -> FicheStateLine(
                GameText.of(GameTextKey.StateMissionsClaimed, count(done), count(total)),
                ConceptFact.MissionsDone, ConceptFact.Chest,
            )
            ChestStatus.Ready -> FicheStateLine(
                GameText.of(GameTextKey.StateMissionsReady, count(done), count(total)),
                ConceptFact.MissionsDone, ConceptFact.Chest,
            )
            ChestStatus.Locked -> FicheStateLine(
                GameText.of(GameTextKey.StateMissionsProgress, count(done), count(total), count((total - done).coerceAtLeast(0))),
                ConceptFact.MissionsDone,
            )
        }
    }

    private fun countedState(concept: ProgressionConcept, done: Int, total: Int): FicheStateLine? {
        if (total <= 0) return null
        if (done >= total) {
            return FicheStateLine(GameText.of(GameTextKey.StateCountComplete, count(done), count(total)), ConceptFact.Earned)
        }
        val key = when (concept) {
            ProgressionConcept.Defis -> GameTextKey.StateCountDefis
            ProgressionConcept.Succes -> GameTextKey.StateCountSucces
            else -> GameTextKey.StateCountBadges
        }
        return FicheStateLine(GameText.of(key, count(done), count(total), count(total - done)), ConceptFact.Earned, ConceptFact.Left)
    }

    private fun showcaseState(game: GameBlock?): FicheStateLine? {
        val trophies = game?.trophies ?: return null
        if (trophies.items.isEmpty()) return FicheStateLine(GameText(GameTextKey.ShowcaseEmpty), ConceptFact.Trophies)
        val who = game.visibility?.showcase ?: ShowcaseVisibility.Friends
        return FicheStateLine(
            GameText.of(
                GameTextKey.StateShowcaseCount,
                nested(GameText.of(GameTextKey.DoorShowcaseCount, count(trophies.items.size))),
                nested(ProgressionConceptModel.visibilityLabel(who)),
            ),
            ConceptFact.Trophies, ConceptFact.ShowcaseVisibility,
        )
    }

    private fun atlasState(game: GameBlock?): FicheStateLine? {
        val atlas = game?.atlas ?: return null
        if (atlas.stamped <= 0 && atlas.pending.isEmpty()) return FicheStateLine(GameText(GameTextKey.AtlasEmpty), ConceptFact.AtlasStamps)
        return FicheStateLine(
            GameText.of(GameTextKey.StateAtlasProgress, count(atlas.stamped), count(atlas.total), count(atlas.pending.size)),
            ConceptFact.AtlasStamps, ConceptFact.AtlasPending,
        )
    }
}
