package me.meeshy.sdk.model.game.progression

import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameLeague
import me.meeshy.sdk.model.game.GameLeagueBlock
import me.meeshy.sdk.model.game.GameLevelStep
import me.meeshy.sdk.model.game.GameLevelSteps
import me.meeshy.sdk.model.game.GameSeason
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.GloryLaws
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.LeagueAccess
import me.meeshy.sdk.model.game.LeagueCurrent
import me.meeshy.sdk.model.game.LeagueZone
import me.meeshy.sdk.model.game.LevelStepKind
import me.meeshy.sdk.model.game.engagement.EngagementProgress
import me.meeshy.sdk.model.game.sparkLedger

/** Deux phrases d'état mises bout à bout, leurs faits réunis sans doublon (iOS `ProgressionFactText.then`). */
internal fun FicheStateLine.then(next: FicheStateLine): FicheStateLine = FicheStateLine(
    GameText.joined(listOf(text, next.text)),
    facts + next.facts.filter { it !in facts },
)

/**
 * Les phrases d'état du Niveau, des Étincelles, de l'Héritage, de la Joute, du Voyage, de la Renaissance et des Élans
 * (#13909) — miroir de `levelState` … `elansState` dans `ProgressionConceptModel` (iOS). Chaque nombre est celui du
 * serveur, mis en mots.
 */
internal object ProgressionConceptStatesMore {

    private fun count(value: Int): GameTextArg = GameTextArg.Count(value)

    private fun count(value: Long): GameTextArg = GameTextArg.Count(value.coerceIn(0L, Int.MAX_VALUE.toLong()).toInt())

    private fun nested(text: GameText): GameTextArg = GameTextArg.Nested(text)

    private fun points(value: Long): GameText = GameCopyLaws.points(value.coerceIn(0L, Int.MAX_VALUE.toLong()).toInt())

    private fun line(key: GameTextKey, vararg facts: ConceptFact, args: List<GameTextArg> = emptyList()): FicheStateLine =
        FicheStateLine(GameText(key, args), facts.toList())

    fun levelState(progress: EngagementProgress, game: GameBlock?): FicheStateLine {
        val block = game?.level
        if (block == null) {
            val scale = progress.level.scale
            val next = scale.nextThreshold ?: return FicheStateLine(levelTop(null), ConceptFact.LevelTop)
            return line(
                GameTextKey.StateLevelSimple, ConceptFact.Level, ConceptFact.LevelNext,
                args = listOf(
                    count(progress.level.level),
                    nested(points((next - scale.value).toLong())),
                    count(progress.level.level + 1),
                ),
            )
        }
        val level = block.shown
        val step = level.step
        if (level.held && step != null) return FicheStateLine(levelHeld(step), ConceptFact.LevelStep)
        val next = level.nextThreshold ?: return FicheStateLine(levelTop(level.cap), ConceptFact.Level, ConceptFact.LevelTop)
        return line(
            GameTextKey.StateLevelProgress, ConceptFact.Level, ConceptFact.LevelProgress, ConceptFact.LevelNext,
            args = listOf(
                count(level.level),
                nested(points(block.score - level.floorScore)),
                count(next - level.floorScore),
                count(level.pointsToNext),
                count(level.level + 1),
            ),
        )
    }

    /** Le rang qui ouvre la suite au-delà du plafond [cap] ; `null` sans plafond ou sans rang plus haut. */
    private fun rankOpening(cap: Int?): GloryRank? = cap?.let { limit ->
        GloryLaws.earnedRanks.firstOrNull { rank -> GloryLaws.levelCap(rank)?.let { it > limit } ?: true }
    }

    /** Le niveau qui ne monte plus (iOS `GameCopy.levelTop`) : au plafond de son rang, il nomme le rang qui ouvre la suite. */
    fun levelTop(cap: Int?): GameText {
        val rank = rankOpening(cap) ?: return GameText(GameTextKey.LevelTop)
        return GameText.of(GameTextKey.LevelCapReached, count(cap ?: 0), nested(GameCopyLaws.rankName(rank)))
    }

    /** Pourquoi le niveau attend (iOS `GameCopy.levelHeld`) : les points sont là, l'épreuve manque. */
    fun levelHeld(step: GameLevelStep): GameText =
        GameText.of(GameTextKey.LevelHeld, nested(levelStepGoal(step)), count(step.level))

    private fun levelStepGoal(step: GameLevelStep): GameText = when (step.kind) {
        LevelStepKind.Mint ->
            if (step.target == 1L) GameText(GameTextKey.LevelStepMintFirst) else GameText.of(GameTextKey.LevelStepMintMany, count(step.target))
        LevelStepKind.Missions ->
            if (step.target == 1L) {
                GameText(GameTextKey.LevelStepMissionsFirst)
            } else {
                GameText.of(GameTextKey.LevelStepMissionsMany, count(step.target))
            }
        LevelStepKind.Flame -> GameText.of(GameTextKey.LevelStepFlame, count(step.target))
        LevelStepKind.Rank -> {
            val ruled = GameLevelSteps.rules.firstOrNull { it.level == step.level }?.rank
            GameText.of(GameTextKey.LevelStepRank, nested(GameCopyLaws.rankName(step.rank ?: ruled ?: GloryRank.Echo)))
        }
    }

    /** Les étincelles : UN solde, la poche, toute convertible ; d'un serveur antérieur, le score et la part convertible. */
    fun pointsState(progress: EngagementProgress, game: GameBlock?): FicheStateLine? {
        val block = game ?: return null
        val mint = block.mint
        val number = count(mint.number)
        val price = nested(GameCopyLaws.points(mint.price))
        val facts = if (mint.canMint) {
            listOf(ConceptFact.SparksPocket, ConceptFact.MintNext, ConceptFact.MintPrice)
        } else {
            listOf(ConceptFact.SparksPocket, ConceptFact.MintNext, ConceptFact.MintPrice, ConceptFact.MintMissing)
        }
        val ledger = block.level.sparkLedger
        if (ledger != null) {
            val pocket = nested(points(ledger.pocket))
            val text = if (mint.canMint) {
                GameText.of(GameTextKey.StatePointsReadyPlain, pocket, number, price)
            } else {
                GameText.of(GameTextKey.StatePointsMissingPlain, pocket, number, price, nested(points(mint.missingPoints)))
            }
            return FicheStateLine(text, facts)
        }
        val held = nested(points(block.level.score))
        val convertible = convertiblePoints(progress, block)
            ?: return FicheStateLine(GameText.of(GameTextKey.StatePointsReadyPlain, held, number, price), facts)
        val toConvert = nested(GameCopyLaws.convertiblePoints(convertible))
        if (mint.canMint) return FicheStateLine(GameText.of(GameTextKey.StatePointsReady, held, toConvert, number, price), facts)
        val missing = nested(GameCopyLaws.convertiblePoints(mint.missingPoints.coerceIn(0L, Int.MAX_VALUE.toLong()).toInt()))
        return FicheStateLine(GameText.of(GameTextKey.StatePointsMissing, held, toConvert, number, price, missing), facts)
    }

    /** Les points que la frappe peut reprendre (iOS `convertiblePoints`) : servis, ou lus sur le prix quand il manque. */
    private fun convertiblePoints(progress: EngagementProgress, game: GameBlock): Int? {
        progress.meesh?.let { return it.debitablePoints }
        val mint = game.mint
        if (mint.canMint) return null
        return (mint.price - mint.missingPoints).coerceIn(0L, Int.MAX_VALUE.toLong()).toInt()
    }

    fun meeshState(progress: EngagementProgress, game: GameBlock?): FicheStateLine? {
        val block = game ?: return null
        val mint = block.mint
        val balance = progress.meesh?.balance ?: block.treasury.held
        val minted = count(progress.meesh?.mintedLifetime ?: (mint.number - 1).coerceAtLeast(0))
        val kept = if (balance <= 0) {
            line(GameTextKey.StateMeeshKeptNone, ConceptFact.MeeshHeld, ConceptFact.Minted, args = listOf(minted))
        } else {
            line(
                GameTextKey.StateMeeshKept, ConceptFact.MeeshHeld, ConceptFact.Minted,
                args = listOf(nested(GameCopyLaws.meeshes(balance)), minted),
            )
        }
        val number = count(mint.number)
        val price = nested(GameCopyLaws.points(mint.price))
        val next = if (mint.canMint) {
            line(GameTextKey.StateMeeshNextReady, ConceptFact.MintNext, ConceptFact.MintPrice, args = listOf(number, price))
        } else {
            line(
                GameTextKey.StateMeeshNextMissing, ConceptFact.MintNext, ConceptFact.MintPrice, ConceptFact.MintMissing,
                args = listOf(number, price, nested(GameCopyLaws.convertiblePoints(mint.missingPoints.coerceIn(0L, Int.MAX_VALUE.toLong()).toInt()))),
            )
        }
        return kept.then(next)
    }

    /** La place du joueur dans la joute publique, seulement quand elle lui est ouverte (iOS `GameLeagueDetail.current`). */
    fun current(league: GameLeagueBlock?): LeagueCurrent? = league?.takeIf { it.access == LeagueAccess.Open }?.current

    fun leagueState(game: GameBlock?): FicheStateLine? {
        val block = game ?: return null
        val league = block.league ?: return null
        if (league.access == LeagueAccess.Locked) {
            return line(
                GameTextKey.LeagueLocked, ConceptFact.LeagueUnlockLevel, ConceptFact.Level,
                args = listOf(count(GameLeague.MIN_LEVEL), count(block.level.shown.level)),
            )
        }
        val current = current(league) ?: return line(GameTextKey.StateLeagueUnplaced, ConceptFact.League)
        val place = line(
            GameTextKey.StateLeaguePlace, ConceptFact.League, ConceptFact.LeaguePlace, ConceptFact.WeekPoints,
            args = listOf(
                nested(ProgressionConceptModel.leagueName(current.league)),
                count(current.rank),
                count(current.groupSize),
                nested(GameCopyLaws.points(current.weekPoints)),
            ),
        )
        return leagueZoneState(current)?.let(place::then) ?: place
    }

    /** La zone, avec ce qu'il manque pour la zone de MONTÉE — la cible est dans la phrase. */
    private fun leagueZoneState(current: LeagueCurrent): FicheStateLine? {
        if (current.zone == LeagueZone.Promotion) return line(GameTextKey.StateLeagueZonePromotion, ConceptFact.LeagueZone)
        val missing = current.pointsToPromotion?.takeIf { it > 0 } ?: return null
        val key = if (current.zone == LeagueZone.Safe) GameTextKey.StateLeagueZoneSafe else GameTextKey.StateLeagueZoneRelegation
        return line(key, ConceptFact.LeagueZone, ConceptFact.LeagueMissing, args = listOf(nested(GameCopyLaws.points(missing))))
    }

    fun seasonState(game: GameBlock?): FicheStateLine? {
        val block = game ?: return null
        val season = block.season ?: return line(GameTextKey.SeasonNone, ConceptFact.Season)
        val head = listOf(count(season.number), count(season.week), count(GameSeason.WEEKS))
        if (season.steps >= season.stepsTotal) {
            return line(
                GameTextKey.StateSeasonDone, ConceptFact.Season, ConceptFact.SeasonWeek, ConceptFact.SeasonSteps,
                args = head + count(season.stepsTotal),
            )
        }
        return line(
            GameTextKey.StateSeasonProgress,
            ConceptFact.Season, ConceptFact.SeasonWeek, ConceptFact.SeasonSteps, ConceptFact.SeasonNext,
            args = head + listOf(
                count(season.steps),
                count(season.stepsTotal),
                nested(GameText.of(GameTextKey.SeasonStars, count(season.starsToNext))),
            ),
        )
    }

    fun prestigeState(game: GameBlock?): FicheStateLine? {
        val block = game ?: return null
        val prestige = block.prestige ?: return null
        if (prestige.canPrestige) return line(GameTextKey.PrestigeMee, ConceptFact.PrestigeDoor, ConceptFact.Level)
        if (prestige.stars >= prestige.max) return line(GameTextKey.PrestigeMax, ConceptFact.PrestigeDoor)
        return line(
            GameTextKey.PrestigeLocked, ConceptFact.PrestigeDoor, ConceptFact.Level,
            args = listOf(count(block.level.shown.level)),
        )
    }

    fun elansState(progress: EngagementProgress): FicheStateLine? {
        val elan = progress.elan ?: return null
        val families = nested(GameText.of(GameTextKey.ChipFamilies, count(elan.activeFamilyCount)))
        return if (elan.isAccelerated) {
            line(GameTextKey.StateElansActive, ConceptFact.Factor, ConceptFact.ElanFamilies, args = listOf(GameTextArg.Decimal(elan.factor), families))
        } else {
            line(GameTextKey.StateElansIdle, ConceptFact.ElanFamilies, args = listOf(families))
        }
    }
}
