package me.meeshy.sdk.model.game.progression

import java.time.Instant
import me.meeshy.sdk.model.game.ChestStatus
import me.meeshy.sdk.model.game.FlameStatus
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameLeague
import me.meeshy.sdk.model.game.GameMissionClock
import me.meeshy.sdk.model.game.GameMissionLaws
import me.meeshy.sdk.model.game.GameArchiveStatus
import me.meeshy.sdk.model.game.GameSeason
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.GloryLaws
import me.meeshy.sdk.model.game.LeagueAccess
import me.meeshy.sdk.model.game.LeagueKey
import me.meeshy.sdk.model.game.MissionPhase
import me.meeshy.sdk.model.game.SeasonMoment
import me.meeshy.sdk.model.game.ShowcaseVisibility
import me.meeshy.sdk.model.game.TreasuryStanding
import me.meeshy.sdk.model.game.engagement.EngagementProgress
import me.meeshy.sdk.model.game.sparkLedger

/**
 * LA CARTE D'UN CONCEPT sur la première page — trois étages : le NOM en petit (la ressource du concept), la
 * VALEUR en grand, UNE ligne en petit. Une loi PURE : elle lit la progression et le bloc `game` servis et ne
 * calcule ni niveau, ni rang, ni prix — chaque nombre est celui du serveur, mis en mots. Miroir de
 * `ProgressionConceptModel` (iOS) et de `conceptView` (web).
 *
 * [value] et [line] sont des DESCRIPTEURS ([GameText]) : l'écran les habille dans la langue de l'interface.
 * Ce qui demande une action PREND la ligne ([urgent]).
 */
public data class ProgressionConceptCard(
    val concept: ProgressionConcept,
    val value: GameText?,
    /** Le fait que la valeur dit ([ConceptFact]) : deux rendus du même fait sur une carte sont un défaut. */
    val valueFact: ConceptFact,
    /** Ce que l'emblème montre lui-même (l'anneau porte le niveau), et ce qu'un lecteur d'écran en entend. */
    val emblemLevel: GameText?,
    val line: GameText?,
    val urgent: Boolean,
    /** La part parcourue vers l'étape suivante (0..1) ; `null` sans étape suivante. */
    val gauge: Double?,
)

/** L'identité d'un fait rendu : le dédoublonnage compare des identités, jamais des chaînes. */
public enum class ConceptFact {
    Level, Tier, LevelNext, LevelTop, Score,
    SparksPocket, SparksDebt,
    MeeshHeld, TreasuryTier, TreasuryNext, MintPrice, MintMissing, CanMint,
    Rank, Glory,
    Streak, StreakRecord, FlameForm, Freezes, FlameState,
    MissionsDone, MissionsUnlockLevel, Chest, MissionExpiring, PrismDay,
    League, LeaguePlace, LeagueFriendsDoor, LeagueUnlockLevel,
    Season, SeasonWeek, SeasonSteps,
    PrestigeStars, PrestigeDoor,
    Factor, ElanFamilies,
    Trophies, ShowcaseVisibility,
    AtlasStamps, AtlasLeft,
    Earned, Left,
}

private data class Piece(val text: GameText?, val facts: Set<ConceptFact>) {
    constructor(text: GameText?, vararg facts: ConceptFact) : this(text, facts.toSet())
}

private data class Head(
    val value: Piece,
    val line: Piece? = null,
    val urgent: Piece? = null,
    val emblemLevel: GameText? = null,
)

public object ProgressionConceptModel {

    public fun cards(
        progress: EngagementProgress,
        game: GameBlock?,
        nowMillis: Long,
        moment: SeasonMoment,
    ): List<ProgressionConceptCard> =
        ProgressionConcepts.served(progress, game).map { card(it, progress, game, nowMillis, moment) }

    public fun card(
        concept: ProgressionConcept,
        progress: EngagementProgress,
        game: GameBlock?,
        nowMillis: Long,
        moment: SeasonMoment,
    ): ProgressionConceptCard {
        val head = head(concept, progress, game, nowMillis, moment)
        val valueFact = head.value.facts.firstOrNull() ?: ConceptFact.Level
        val line = (head.urgent ?: head.line)?.takeUnless { valueFact in it.facts }
        return ProgressionConceptCard(
            concept = concept,
            value = head.value.text,
            valueFact = valueFact,
            emblemLevel = head.emblemLevel,
            line = line?.text,
            urgent = head.urgent != null && line === head.urgent,
            gauge = gauge(concept, progress, game),
        )
    }

    private fun count(value: Int): GameTextArg = GameTextArg.Count(value)

    private fun count(value: Long): GameTextArg = GameTextArg.Count(value.coerceIn(0L, Int.MAX_VALUE.toLong()).toInt())

    private fun ratio(done: Int, total: Int): GameText = GameText.of(GameTextKey.Ratio, count(done), count(total))

    private fun share(done: Int, total: Int): Double? =
        if (total > 0) (done.toDouble() / total).coerceIn(0.0, 1.0) else null

    private fun head(
        concept: ProgressionConcept,
        progress: EngagementProgress,
        game: GameBlock?,
        nowMillis: Long,
        moment: SeasonMoment,
    ): Head = when (concept) {
        ProgressionConcept.Level -> level(progress, game)
        ProgressionConcept.Points -> points(progress, game)
        ProgressionConcept.Meesh -> meesh(progress, game)
        ProgressionConcept.Glory -> glory(game)
        ProgressionConcept.Flame -> flame(progress, game)
        ProgressionConcept.Missions -> missions(game, nowMillis)
        ProgressionConcept.League -> league(game)
        ProgressionConcept.Season -> season(game, moment)
        ProgressionConcept.Prestige -> prestige(game)
        ProgressionConcept.Elans -> elans(progress)
        ProgressionConcept.Badges -> counted(progress.badgesEarned, progress.badgesTotal)
        ProgressionConcept.Defis -> counted(defisDone(progress), defisTotal(progress))
        ProgressionConcept.Succes -> counted(progress.unlockedAchievementCount, progress.achievements.size)
        ProgressionConcept.Showcase -> showcase(game)
        ProgressionConcept.Atlas -> atlas(game)
    }

    public fun defisDone(progress: EngagementProgress): Int = progress.achievementSections.sumOf { it.unlockedCount }

    public fun defisTotal(progress: EngagementProgress): Int = progress.achievementSections.sumOf { it.attainableCount }

    /** La LUMIÈRE : l'anneau porte le niveau, la valeur nomme l'état de la lumière. */
    private fun level(progress: EngagementProgress, game: GameBlock?): Head {
        val shown = game?.level?.shown
        if (shown == null) {
            val scale = progress.level.scale
            val level = progress.level.level
            return Head(
                value = Piece(GameText.of(GameTextKey.BannerLevel, count(level)), ConceptFact.Level),
                line = scale.remainingToNext?.let {
                    Piece(
                        GameText.of(
                            GameTextKey.ChipToLevel,
                            GameTextArg.Count(level + 1),
                            GameTextArg.Nested(GameCopyLaws.points(it)),
                        ),
                        ConceptFact.LevelNext,
                    )
                } ?: Piece(GameCopyLaws.points(scale.value), ConceptFact.Score),
            )
        }
        val toNext = if (shown.nextThreshold == null) {
            Piece(levelTopShort(shown.cap), ConceptFact.LevelTop)
        } else {
            Piece(
                GameText.of(
                    GameTextKey.ChipToLevel,
                    GameTextArg.Count(shown.level + 1),
                    GameTextArg.Nested(GameCopyLaws.points(shown.pointsToNext.toInt())),
                ),
                ConceptFact.LevelNext,
            )
        }
        return Head(
            value = Piece(GameCopyLaws.tierName(shown.tier), ConceptFact.Tier),
            line = toNext,
            emblemLevel = GameText.of(GameTextKey.BannerLevel, count(shown.level)),
        )
    }

    /** Le rang qui ouvre la suite quand le niveau butte sur son plafond ; sans plafond connu, « au sommet ». */
    public fun levelTopShort(cap: Int?): GameText {
        val opening = cap?.let { limit ->
            GloryLaws.earnedRanks.firstOrNull { rank -> GloryLaws.levelCap(rank)?.let { it > limit } ?: true }
        } ?: return GameText(GameTextKey.BannerTop)
        return GameText.of(GameTextKey.LevelCapShort, GameTextArg.Nested(GameCopyLaws.rankName(opening)))
    }

    /** TA LUMIÈRE, lue par son nom (la poche) ; en petit, l'Ombre qui ferme la frappe. */
    private fun points(progress: EngagementProgress, game: GameBlock?): Head {
        if (game == null) return Head(Piece(GameCopyLaws.points(progress.level.scale.value), ConceptFact.SparksPocket))
        val level = game.level
        val pocket = level.sparkLedger?.pocket ?: level.score
        val debt = level.sparksDebt ?: 0L
        return Head(
            value = Piece(GameCopyLaws.points(pocket.coerceIn(0L, Int.MAX_VALUE.toLong()).toInt()), ConceptFact.SparksPocket),
            line = if (debt > 0) Piece(GameText.of(GameTextKey.SparksDebt, count(debt)), ConceptFact.SparksDebt) else null,
        )
    }

    private fun meesh(progress: EngagementProgress, game: GameBlock?): Head {
        val wallet = progress.meesh
        val canMint = game?.mint?.canMint ?: wallet?.canMint ?: false
        val urgent = if (canMint) Piece(GameText(GameTextKey.ChipMintReady), ConceptFact.CanMint) else null
        if (game == null) {
            if (wallet == null) return Head(Piece(GameCopyLaws.meeshes(0), ConceptFact.MeeshHeld))
            val line = if (wallet.canMint) {
                Piece(
                    GameText.of(GameTextKey.ChipNextPrice, GameTextArg.Nested(GameCopyLaws.points(wallet.mintCost))),
                    ConceptFact.MintPrice,
                )
            } else {
                Piece(
                    GameText.of(GameTextKey.ChipToMeesh, count(wallet.mintedLifetime + 1), count(wallet.missingPoints)),
                    ConceptFact.MintMissing, ConceptFact.TreasuryNext,
                )
            }
            return Head(Piece(GameCopyLaws.meeshes(wallet.balance), ConceptFact.MeeshHeld), line, urgent)
        }
        return Head(
            value = Piece(GameCopyLaws.meeshes(wallet?.balance ?: game.treasury.held), ConceptFact.MeeshHeld),
            line = container(game.treasury),
            urgent = urgent,
        )
    }

    /** « Coffret · le Coffre s'ouvre à 100 » : le contenant qu'on possède, puis le suivant — deux faits, une ligne. */
    private fun container(treasury: TreasuryStanding): Piece? {
        val opens = treasury.next?.let { GameCopyLaws.treasuryOpens(it.key, it.minHeld) }
        val tier = treasury.tier?.let(GameCopyLaws::treasuryName)
        return when {
            tier == null && opens == null -> null
            tier == null -> Piece(opens, ConceptFact.TreasuryNext)
            opens == null -> Piece(tier, ConceptFact.TreasuryTier)
            else -> Piece(
                GameText(
                    GameTextKey.JoinedBySpace,
                    listOf(GameTextArg.Nested(tier), GameTextArg.Verbatim("·"), GameTextArg.Nested(opens)),
                ),
                ConceptFact.TreasuryTier, ConceptFact.TreasuryNext,
            )
        }
    }

    /** Le rang et sa division V–I ; le Mythe dit sa PLACE quand le serveur la sert. */
    public fun rankLabel(glory: me.meeshy.sdk.model.game.GameGlory): GameText {
        glory.mythicSeat?.let { return GameCopyLaws.mythicSeat(it.number) }
        val name = GameCopyLaws.rankName(glory.rank)
        val division = glory.shownDivision?.let(::roman) ?: return name
        return GameText(GameTextKey.JoinedBySpace, listOf(GameTextArg.Nested(name), GameTextArg.Verbatim(division)))
    }

    private fun roman(division: Int): String? = listOf("I", "II", "III", "IV", "V").getOrNull(division - 1)

    private fun glory(game: GameBlock?): Head {
        val glory = game?.glory ?: return Head(Piece(null, ConceptFact.Rank))
        return Head(
            value = Piece(rankLabel(glory), ConceptFact.Rank),
            line = Piece(GameCopyLaws.gloryAmount(count(glory.glory)), ConceptFact.Glory),
        )
    }

    private fun flameDays(days: Int): GameText =
        if (days <= 0) GameText(GameTextKey.FlameNoStreak) else GameCopyLaws.days(days)

    private fun flame(progress: EngagementProgress, game: GameBlock?): Head {
        val flame = game?.flame
        if (flame == null) {
            return Head(
                value = Piece(flameDays(progress.streak.currentDays), ConceptFact.Streak),
                line = Piece(
                    GameText.of(GameTextKey.StreakRecord, count(progress.streak.longestDays)),
                    ConceptFact.StreakRecord,
                ),
            )
        }
        val form = flame.form
        val line = if (form != null) {
            Piece(
                GameText.of(
                    GameTextKey.FlameFormLine,
                    GameTextArg.Nested(GameCopyLaws.flameFormName(form)),
                    count(flame.bonusPercent.coerceIn(0, 100)),
                ),
                ConceptFact.FlameForm,
            )
        } else {
            Piece(
                GameText.of(GameTextKey.ChipFreezesOf, count(flame.freezes), count(flame.maxFreezes)),
                ConceptFact.Freezes,
            )
        }
        val atRisk = if (flame.status == FlameStatus.AtRisk) {
            Piece(GameText(GameTextKey.FlameStatusAtRisk), ConceptFact.FlameState)
        } else {
            null
        }
        return Head(Piece(flameDays(flame.days), ConceptFact.Streak), line, atRisk)
    }

    private fun chestLabel(status: ChestStatus): GameText = GameText(
        when (status) {
            ChestStatus.Ready -> GameTextKey.ChipChestReady
            ChestStatus.Locked -> GameTextKey.ChipChestLocked
            ChestStatus.Claimed -> GameTextKey.ChipChestClaimed
        },
    )

    private fun missions(game: GameBlock?, nowMillis: Long): Head {
        val block = game ?: return Head(Piece(null, ConceptFact.MissionsDone))
        val missions = block.missions
        if (!missions.unlocked) {
            return Head(
                Piece(
                    GameText.of(GameTextKey.DoorLeagueLocked, count(GameMissionLaws.MISSIONS_MIN_LEVEL)),
                    ConceptFact.MissionsUnlockLevel,
                ),
            )
        }
        val chest = Piece(chestLabel(block.chest.status), ConceptFact.Chest)
        val done = missions.items.count { it.isCompleted }
        val urgent = if (block.chest.status == ChestStatus.Ready) chest else expiring(missions.personal, nowMillis)
        return Head(
            value = Piece(ratio(done, missions.items.size), ConceptFact.MissionsDone),
            line = if (missions.prismDay) Piece(GameText(GameTextKey.ChipPrismDay), ConceptFact.PrismDay) else chest,
            urgent = urgent,
        )
    }

    /** L'acte personnel qui expire prend la ligne tant que sa plage court. */
    private fun expiring(personal: me.meeshy.sdk.model.game.GamePersonalMission?, nowMillis: Long): Piece? {
        val mission = personal ?: return null
        val end = parseMillis(mission.endsAt) ?: return null
        val phase = GameMissionClock.phase(parseMillis(mission.startsAt), end, mission.completedAt != null, nowMillis)
        val running = phase as? MissionPhase.Running ?: return null
        return Piece(GameCopyLaws.missionRemaining(running.remainingMillis / MILLIS), ConceptFact.MissionExpiring)
    }

    private fun parseMillis(iso: String): Long? = runCatching { Instant.parse(iso).toEpochMilli() }.getOrNull()

    private fun leagueName(league: LeagueKey): GameText = GameText(
        when (league) {
            LeagueKey.Quartz -> GameTextKey.LeagueNameQuartz
            LeagueKey.Ambre -> GameTextKey.LeagueNameAmbre
            LeagueKey.Jade -> GameTextKey.LeagueNameJade
            LeagueKey.Saphir -> GameTextKey.LeagueNameSaphir
            LeagueKey.Rubis -> GameTextKey.LeagueNameRubis
            LeagueKey.Amethyste -> GameTextKey.LeagueNameAmethyste
            LeagueKey.Diamant -> GameTextKey.LeagueNameDiamant
            LeagueKey.Prisme -> GameTextKey.LeagueNamePrisme
        },
    )

    private fun league(game: GameBlock?): Head {
        val block = game?.league ?: return Head(Piece(null, ConceptFact.League))
        if (block.access == LeagueAccess.Locked) {
            return Head(
                Piece(
                    GameText.of(GameTextKey.DoorLeagueLocked, count(GameLeague.MIN_LEVEL)),
                    ConceptFact.LeagueUnlockLevel,
                ),
            )
        }
        val current = block.current ?: return Head(
            value = Piece(GameText(GameTextKey.DoorLeagueOpen), ConceptFact.League),
            line = Piece(GameText(GameTextKey.LeagueFriendsTitle), ConceptFact.LeagueFriendsDoor),
        )
        return Head(
            value = Piece(leagueName(current.league), ConceptFact.League),
            line = Piece(
                GameText.of(GameTextKey.LeagueRankLine, count(current.rank), count(current.groupSize)),
                ConceptFact.LeaguePlace,
            ),
        )
    }

    /** LE VOYAGE : les haltes, la semaine en petit ; avant le premier, la date d'ouverture, jamais un vide. */
    private fun season(game: GameBlock?, moment: SeasonMoment): Head {
        val season = game?.season
        if (season == null) {
            val upcoming = game?.seasonUpcoming ?: return Head(Piece(GameText(GameTextKey.DoorSeasonNone), ConceptFact.Season))
            val tense = GameSeason.liveTense(GameArchiveStatus.Upcoming, upcoming.startDay, upcoming.endDay, moment)
            val value = if (tense == GameArchiveStatus.Upcoming) {
                GameText.of(GameTextKey.DoorSeasonUpcoming, GameTextArg.Day(upcoming.startDay))
            } else {
                GameText.of(GameTextKey.DoorSeason, count(upcoming.number))
            }
            return Head(Piece(value, ConceptFact.Season))
        }
        return Head(
            value = Piece(
                GameText.of(GameTextKey.DoorSeasonSteps, count(season.steps), count(season.stepsTotal)),
                ConceptFact.SeasonSteps,
            ),
            line = Piece(GameText.of(GameTextKey.ChipWeekOf, count(season.week), count(GameSeason.WEEKS)), ConceptFact.SeasonWeek),
        )
    }

    private fun prestige(game: GameBlock?): Head {
        val prestige = game?.prestige ?: return Head(Piece(null, ConceptFact.PrestigeStars))
        val door = GameText(if (prestige.stars >= prestige.max) GameTextKey.BannerTop else GameTextKey.DoorPrestigeLocked)
        return Head(
            value = Piece(ratio(prestige.stars, prestige.max), ConceptFact.PrestigeStars),
            line = Piece(door, ConceptFact.PrestigeDoor),
            urgent = if (prestige.canPrestige) {
                Piece(GameText(GameTextKey.DoorPrestigeReady), ConceptFact.PrestigeDoor)
            } else {
                null
            },
        )
    }

    private fun families(active: Int): GameText = GameText.of(GameTextKey.ChipFamilies, count(active))

    private fun elans(progress: EngagementProgress): Head {
        val elan = progress.elan ?: return Head(
            value = Piece(GameText(GameTextKey.ValueNoElan), ConceptFact.Factor),
            line = Piece(families(0), ConceptFact.ElanFamilies),
        )
        val value = if (elan.isAccelerated) {
            GameText.of(GameTextKey.ValueFactor, GameTextArg.Decimal(elan.factor))
        } else {
            GameText(GameTextKey.ValueNoElan)
        }
        return Head(Piece(value, ConceptFact.Factor), Piece(families(elan.activeFamilyCount), ConceptFact.ElanFamilies))
    }

    private fun counted(done: Int, total: Int): Head = Head(
        value = Piece(ratio(done, total), ConceptFact.Earned),
        line = Piece(
            if (total > done) GameText.of(GameTextKey.ChipToUnlock, count(total - done)) else GameText(GameTextKey.ChipAllDone),
            ConceptFact.Left,
        ),
    )

    private fun visibilityLabel(level: ShowcaseVisibility): GameText = GameText(
        when (level) {
            ShowcaseVisibility.Everyone -> GameTextKey.VisibilityEveryone
            ShowcaseVisibility.Friends -> GameTextKey.VisibilityFriends
            ShowcaseVisibility.Me -> GameTextKey.VisibilityMe
        },
    )

    private fun showcase(game: GameBlock?): Head {
        val trophies = game?.trophies
        if (trophies == null || trophies.items.isEmpty()) {
            return Head(Piece(GameText(GameTextKey.DoorShowcaseEmpty), ConceptFact.Trophies))
        }
        return Head(
            value = Piece(GameText.of(GameTextKey.DoorShowcaseCount, count(trophies.items.size)), ConceptFact.Trophies),
            line = game.visibility?.let {
                Piece(
                    GameText.of(GameTextKey.ChipVisible, GameTextArg.Nested(visibilityLabel(it.showcase))),
                    ConceptFact.ShowcaseVisibility,
                )
            },
        )
    }

    private fun atlas(game: GameBlock?): Head {
        val atlas = game?.atlas ?: return Head(Piece(null, ConceptFact.AtlasStamps))
        return Head(
            value = Piece(ratio(atlas.stamped, atlas.total), ConceptFact.AtlasStamps),
            line = Piece(
                GameText.of(GameTextKey.AtlasRemaining, count((atlas.total - atlas.stamped).coerceAtLeast(0))),
                ConceptFact.AtlasLeft,
            ),
        )
    }

    /** La jauge vers l'étape suivante — celle du héros de la fiche ; `null` quand le concept n'en a pas. */
    public fun gauge(concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?): Double? = when (concept) {
        ProgressionConcept.Level -> game?.level?.shown?.let { if (it.nextThreshold == null) null else it.progress }
            ?: progress.level.scale.let { if (it.nextThreshold == null) null else it.progress }
        ProgressionConcept.Points, ProgressionConcept.Elans, ProgressionConcept.Showcase,
        ProgressionConcept.Prestige, ProgressionConcept.League,
        -> null
        ProgressionConcept.Meesh -> game?.mint?.takeIf { it.price > 0 }
            ?.let { share((it.price - it.missingPoints).coerceAtLeast(0L).toInt(), it.price) }
            ?: progress.meesh?.progress
        ProgressionConcept.Glory -> game?.glory?.takeIf { it.next != null }?.progress
        ProgressionConcept.Flame -> progress.streak.scale.let { if (it.nextThreshold == null) null else it.progress }
        ProgressionConcept.Missions -> game?.missions?.takeIf { it.unlocked }
            ?.let { share(it.items.count { mission -> mission.isCompleted }, it.items.size) }
        ProgressionConcept.Season -> game?.season?.takeUnless { it.completed }?.progress
        ProgressionConcept.Badges -> share(progress.badgesEarned, progress.badgesTotal)
        ProgressionConcept.Defis -> share(defisDone(progress), defisTotal(progress))
        ProgressionConcept.Succes -> share(progress.unlockedAchievementCount, progress.achievements.size)
        ProgressionConcept.Atlas -> game?.atlas?.let { share(it.stamped, it.total) }
    }

    private const val MILLIS: Double = 1000.0
}
