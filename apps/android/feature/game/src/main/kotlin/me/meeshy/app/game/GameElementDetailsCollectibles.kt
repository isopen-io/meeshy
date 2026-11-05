package me.meeshy.app.game

import me.meeshy.app.game.progression.BadgeShelf
import me.meeshy.app.game.progression.BadgeShelfEntry
import me.meeshy.sdk.model.game.AtlasPending
import me.meeshy.sdk.model.game.AtlasStamp
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameLeagueBlock
import me.meeshy.sdk.model.game.GameMaterial
import me.meeshy.sdk.model.game.GamePrestigeBlock
import me.meeshy.sdk.model.game.GameRarityEntry
import me.meeshy.sdk.model.game.GameSeason
import me.meeshy.sdk.model.game.GameSeasonBlock
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.LeagueAccess
import me.meeshy.sdk.model.game.LeagueWeekEntry
import me.meeshy.sdk.model.game.element.GameElementDetail
import me.meeshy.sdk.model.game.element.GameElementEmblem
import me.meeshy.sdk.model.game.element.GameElementKind
import me.meeshy.sdk.model.game.element.GameElementMedalShape
import me.meeshy.sdk.model.game.element.GameElementStatus
import me.meeshy.sdk.model.game.element.GameElementSymbol
import me.meeshy.sdk.model.game.engagement.AchievementEntry
import me.meeshy.sdk.model.game.engagement.BadgeMaterialKey
import me.meeshy.sdk.model.game.engagement.EngagementAchievementProgress
import me.meeshy.sdk.model.game.engagement.EngagementAxisProgress
import me.meeshy.sdk.model.game.engagement.GameBadgeTiers
import me.meeshy.sdk.model.game.progression.PieceDetailFact
import me.meeshy.sdk.model.game.progression.ProgressionConcept

/**
 * LES CONSTRUCTEURS PURS DES COLLECTIONS (miroir de `GameElementDetails`, iOS : badge, succès, défi, trophée, tampon,
 * étape de saison, Sceau, gemme de ligue, étoile de Prestige) : chacun rend un [GameElementDetail] COMPLET depuis ce que
 * la passerelle sert, sans calcul ni donnée inventée. Obtenu, il porte la date SERVIE ; verrouillé, ce qui manque et la
 * jauge quand elle se sait ; la rareté seulement quand elle est mesurée (fail-closed).
 *
 * Les NOMS que seul l'hôte sait écrire (axe d'un badge, défi, trophée, langue) arrivent déjà résolus, en [GameText] :
 * ici aucune ressource, aucune locale — un constructeur se prouve par un test JVM.
 */
internal object GameElementDetailsCollectibles {

    private fun count(value: Int): GameTextArg = GameTextArg.Count(value)

    private fun fact(label: GameTextKey, value: GameText): PieceDetailFact = PieceDetailFact(GameText(label), value)

    private fun share(done: Int, total: Int): Double? = if (total > 0) (done.toDouble() / total).coerceIn(0.0, 1.0) else null

    private fun ratio(done: Int, total: Int): GameText = GameText.of(GameTextKey.Ratio, count(done), count(total))

    private fun material(key: BadgeMaterialKey): GameMaterial = when (key) {
        BadgeMaterialKey.CUIVRE -> GameMaterial.Copper
        BadgeMaterialKey.BRONZE -> GameMaterial.Bronze
        BadgeMaterialKey.ARGENT -> GameMaterial.Silver
        BadgeMaterialKey.OR -> GameMaterial.Gold
        BadgeMaterialKey.PLATINE -> GameMaterial.Platinum
        BadgeMaterialKey.OBSIDIENNE -> GameMaterial.Obsidian
        BadgeMaterialKey.PRISME -> GameMaterial.Prism
    }

    // Badge / médaille

    /** La médaille de l'étagère : son plus haut palier gravé, gagnée à sa date ou éteinte avec ce qu'il manque pour la rallumer. */
    fun badge(entry: BadgeShelfEntry, name: GameText): GameElementDetail = GameElementDetail(
        kind = GameElementKind.Badge,
        key = "${entry.axis.wire}:${entry.threshold}",
        emblem = GameElementEmblem.Badge(entry.axis, material(entry.material), entry.lit, entry.progress),
        name = name,
        status = if (entry.lit) {
            GameElementStatus.Obtained(entry.reachedAt)
        } else {
            GameElementStatus.Locked(GameText.of(GameTextKey.BadgeImprintMissing, count(entry.missing)), entry.progress)
        },
        facts = badgeFacts(entry.guide.reached?.material, entry.guide.stars, entry.guide.rungs.size),
        concept = ProgressionConcept.Badges,
    )

    /**
     * La médaille d'un AXE : celle de l'étagère quand l'axe a un palier gravé ; sinon la première à décrocher,
     * verrouillée, avec ce qu'il manque pour la première étoile et sa jauge.
     */
    fun badge(axis: EngagementAxisProgress, name: GameText): GameElementDetail {
        BadgeShelf.entryOf(axis)?.let { return badge(it, name) }
        val scale = axis.scale
        val target = scale.nextThreshold ?: scale.tiers.firstOrNull()?.threshold ?: 0
        val next = GameBadgeTiers.materialOfThreshold(target) ?: BadgeMaterialKey.PRISME
        return GameElementDetail(
            kind = GameElementKind.Badge,
            key = "${axis.axis.wire}:next",
            emblem = GameElementEmblem.Badge(axis.axis, material(next), lit = false, progress = scale.progress),
            name = name,
            status = GameElementStatus.Locked(
                scale.remainingToNext?.let { GameText.of(GameTextKey.DetailBadgeMissing, count(it)) },
                scale.progress,
            ),
            facts = badgeFacts(null, 0, GameBadgeTiers.materials.size),
            concept = ProgressionConcept.Badges,
        )
    }

    private fun badgeFacts(reached: BadgeMaterialKey?, stars: Int, max: Int): List<PieceDetailFact> = listOfNotNull(
        reached?.let { fact(GameTextKey.BadgeMaterialLabel, GameCopyLaws.materialName(material(it))) },
        fact(GameTextKey.BadgeStarsLabel, ratio(stars, max)),
    )

    // Succès

    /** Un haut fait nommé : accompli à sa date, ou à faire avec sa condition. La rareté n'est dite que si elle est MESURÉE. */
    fun achievement(
        achievement: EngagementAchievementProgress,
        name: GameText,
        condition: GameText?,
        rarity: GameRarityEntry? = null,
    ): GameElementDetail = GameElementDetail(
        kind = GameElementKind.Achievement,
        key = achievement.key.wire,
        emblem = GameElementEmblem.Medal(
            GameElementMedalShape.Collection(filled = if (achievement.unlocked) 1 else 0, total = 1),
            GameMaterial.Gold,
            achievement.unlocked,
        ),
        name = name,
        status = if (achievement.unlocked) GameElementStatus.Obtained(achievement.reachedAt) else GameElementStatus.Locked(condition, null),
        rarity = rarity?.takeIf { it.visibleRarity != null },
        concept = ProgressionConcept.Succes,
    )

    // Défi

    /** Un palier de défi. `null` quand la famille est hors catalogue ([name] absent) : on ne montre pas une clé technique. */
    fun challenge(entry: AchievementEntry, name: GameText?, section: GameText?): GameElementDetail? {
        name ?: return null
        return GameElementDetail(
            kind = GameElementKind.Challenge,
            key = entry.key,
            emblem = GameElementEmblem.Medal(GameElementMedalShape.Record, GameMaterial.Silver, entry.unlocked),
            name = name,
            status = if (entry.unlocked) GameElementStatus.Obtained(entry.reachedAt) else GameElementStatus.Locked(null, null),
            facts = listOfNotNull(section?.let { PieceDetailFact(GameText(GameTextKey.ConceptNameDefis), it) }),
            concept = ProgressionConcept.Defis,
        )
    }

    // Trophée de la vitrine

    /** Un trophée du propriétaire : sa date SERVIE. `null` quand sa clé ne se lit pas ([title] absent) : un trophée inconnu ne s'invente pas. */
    fun trophy(key: String, awardedAt: String, title: GameText?, material: GameMaterial): GameElementDetail? =
        trophyOf(key, GameElementStatus.Obtained(awardedAt), title, material)

    /** Un trophée vu par un VISITEUR : le seul MOIS d'obtention, jamais le jour ni la semaine. */
    fun visitorTrophy(key: String, awardedMonth: String, title: GameText?, material: GameMaterial): GameElementDetail? =
        trophyOf(
            key,
            GameElementStatus.Obtained(null, GameText.of(GameTextKey.DetailEarnedOn, GameTextArg.Month(awardedMonth.take(MONTH_LENGTH)))),
            title,
            material,
        )

    private fun trophyOf(key: String, status: GameElementStatus, title: GameText?, material: GameMaterial): GameElementDetail? {
        title ?: return null
        return GameElementDetail(
            kind = GameElementKind.Trophy,
            key = key,
            emblem = GameElementEmblem.Trophy(material),
            name = title,
            status = status,
            facts = listOf(fact(GameTextKey.FactTier, GameCopyLaws.materialName(material))),
            concept = ProgressionConcept.Showcase,
        )
    }

    // Tampon de l'Atlas

    fun stamp(stamp: AtlasStamp, name: GameText): GameElementDetail = GameElementDetail(
        kind = GameElementKind.Stamp,
        key = stamp.language,
        emblem = GameElementEmblem.Stamp(stamp.language.uppercase(), stamped = true),
        name = name,
        status = GameElementStatus.Obtained(null, GameText.of(GameTextKey.AtlasStampedOn, GameTextArg.Day(stamp.stampedOn.take(DAY_LENGTH)))),
        concept = ProgressionConcept.Atlas,
    )

    /** Un échange à moitié fait : le tampon attend le message qui manque. */
    fun pendingStamp(pending: AtlasPending, name: GameText): GameElementDetail = GameElementDetail(
        kind = GameElementKind.Stamp,
        key = "pending.${pending.language}",
        emblem = GameElementEmblem.Stamp(pending.language.uppercase(), stamped = false),
        name = name,
        status = GameElementStatus.Locked(
            GameText(if (pending.sent) GameTextKey.AtlasPendingSent else GameTextKey.AtlasPendingReceived),
            HALF,
        ),
        concept = ProgressionConcept.Atlas,
    )

    // Saison

    fun seasonStep(step: Int, season: GameSeasonBlock): GameElementDetail {
        val needed = step * GameSeason.STARS_PER_STEP
        val status = when {
            step in season.claimedSteps -> GameElementStatus.Obtained(null)
            step <= season.steps -> GameElementStatus.Value(GameText(GameTextKey.SeasonStepReady), null)
            else -> GameElementStatus.Locked(
                GameText.of(
                    GameTextKey.SpendMissingUnlock,
                    GameTextArg.Nested(GameText.of(GameTextKey.SeasonStars, count((needed - season.stars).coerceAtLeast(0)))),
                ),
                share(season.stars, needed),
            )
        }
        return GameElementDetail(
            kind = GameElementKind.SeasonStep,
            key = "${season.number}.$step",
            emblem = GameElementEmblem.Trophy(GameMaterial.Platinum),
            name = GameText.of(GameTextKey.SeasonStep, count(step)),
            status = status,
            facts = listOf(
                fact(GameTextKey.ConceptNameSeason, GameText.counted(season.number)),
                fact(GameTextKey.FactStrides, GameText.counted(season.stars)),
            ),
            concept = ProgressionConcept.Season,
        )
    }

    /** Le Sceau du voyage : un objet à collectionner, obtenu ou à prendre avec ses Meeshes. */
    fun seal(season: GameSeasonBlock): GameElementDetail = GameElementDetail(
        kind = GameElementKind.Seal,
        key = "${season.number}",
        emblem = GameElementEmblem.Symbol(GameElementSymbol.Seal),
        name = GameText(GameTextKey.SeasonSealTitle),
        status = if (season.sealOwned) {
            GameElementStatus.Obtained(null)
        } else {
            GameElementStatus.Locked(GameCopyLaws.meeshes(season.sealPrice), null)
        },
        facts = listOf(fact(GameTextKey.ConceptNameSeason, GameText.counted(season.number))),
        concept = ProgressionConcept.Season,
    )

    // Ligue

    /** La gemme de la ligue où l'on joue : rien de plus que ce que la page de la ligue affiche — jamais de présence. */
    fun leagueGem(league: GameLeagueBlock): GameElementDetail? {
        val current = league.takeIf { it.access == LeagueAccess.Open }?.current ?: return null
        return GameElementDetail(
            kind = GameElementKind.LeagueGem,
            key = current.league.name.lowercase(),
            emblem = GameElementEmblem.League(current.league),
            name = GameCopyLaws.leagueName(current.league),
            status = GameElementStatus.Value(
                GameText.of(GameTextKey.LeagueRankLine, count(current.rank), count(current.groupSize)),
                null,
            ),
            facts = listOfNotNull(
                fact(GameTextKey.FactWeekPoints, GameCopyLaws.points(current.weekPoints)),
                fact(GameTextKey.FactZone, GameCopyLaws.leagueZoneName(current.zone)),
                current.pointsToPromotion?.takeIf { it > 0 }?.let { fact(GameTextKey.FactMissingForPromotion, GameCopyLaws.points(it)) },
            ),
            concept = ProgressionConcept.League,
        )
    }

    /** Une ligne du CLASSEMENT : le pseudonyme, la place, la zone et les points de la semaine. Jamais une présence, jamais un identifiant. */
    fun player(entry: LeagueWeekEntry): GameElementDetail = GameElementDetail(
        kind = GameElementKind.Player,
        key = "${entry.rank}",
        emblem = GameElementEmblem.Concept(ProgressionConcept.League),
        name = GameText.verbatim(entry.displayName),
        status = GameElementStatus.Value(GameCopyLaws.points(entry.weekPoints), null),
        facts = listOf(
            fact(GameTextKey.FactRank, GameText.counted(entry.rank)),
            fact(GameTextKey.FactZone, GameCopyLaws.leagueZoneName(entry.zone)),
        ),
        concept = ProgressionConcept.League,
    )

    // Prestige

    /** La n-ième étoile de Prestige : obtenue si on l'a, verrouillée sinon. */
    fun prestigeStar(index: Int, prestige: GamePrestigeBlock): GameElementDetail {
        val ready = index == prestige.stars + 1 && prestige.canPrestige
        return GameElementDetail(
            kind = GameElementKind.PrestigeStar,
            key = "$index",
            emblem = GameElementEmblem.Trophy(GameMaterial.Prism),
            name = GameText.of(GameTextKey.TrophyPrestige, count(index)),
            status = if (index <= prestige.stars) {
                GameElementStatus.Obtained(null)
            } else {
                GameElementStatus.Locked(GameText(if (ready) GameTextKey.DoorPrestigeReady else GameTextKey.DoorPrestigeLocked), null)
            },
            facts = listOf(
                fact(GameTextKey.FactRebirths, ratio(prestige.stars, prestige.max)),
                fact(GameTextKey.FactGloryOnPass, GameText.counted(prestige.gloryOnPass)),
            ),
            concept = ProgressionConcept.Prestige,
        )
    }

    private const val HALF = 0.5
    private const val MONTH_LENGTH = 7
    private const val DAY_LENGTH = 10
}
