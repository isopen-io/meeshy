package me.meeshy.sdk.model.game.photo

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.game.FlameFormKey
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameFlameLaw
import me.meeshy.sdk.model.game.GameLevels
import me.meeshy.sdk.model.game.GameMint
import me.meeshy.sdk.model.game.GamePhotoCatchUpLaw
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.LevelTierKey
import me.meeshy.sdk.model.game.PhotoCatchUpStanding
import me.meeshy.sdk.model.game.PhotoLawStep
import me.meeshy.sdk.model.game.PhotoStepEmblem
import me.meeshy.sdk.model.game.guide.GuideCard
import me.meeshy.sdk.model.game.guide.GuideContent
import me.meeshy.sdk.model.game.guide.GuideDestination
import me.meeshy.sdk.model.game.guide.GuideMomentKey

/**
 * UN MOMENT QUI SE PHOTOGRAPHIE (#9382, #13891) — miroir de `PhotoMoment` (iOS) : une identité stable et l'emblème
 * que le cadre grave. Ses deux lignes (« Nouveau rang », « Voix II ») se disent à l'affichage, dans la langue de
 * l'interface : le moment est une DONNÉE, jamais une phrase figée. L'identité est celle de la loi de la Chronique
 * ([GamePhotoCatchUpLaw]) : une photo gardée par la proposition compte pour le rattrapage, et inversement.
 */
@Serializable
public data class GamePhotoMoment(val id: String, val emblem: PhotoStepEmblem)

public object GamePhotoMoments {

    public val flameThresholds: List<Int> = GamePhotoCatchUpLaw.flameThresholds

    public fun start(): GamePhotoMoment = GamePhotoMoment("start", PhotoStepEmblem.Start)

    /** Le moment d'une étape de la loi : son identité est celle de l'étape. */
    public fun of(step: PhotoLawStep): GamePhotoMoment = GamePhotoMoment(step.id, step.emblem)

    /**
     * Le moment que propose une carte de Mee, dans l'état courant du jeu (iOS `GamePhotoMoments.fromCard`) ; `null` si
     * la carte ne se photographie pas.
     */
    public fun fromCard(key: GuideMomentKey, game: GameBlock): GamePhotoMoment? = when (key) {
        GuideMomentKey.NewRank -> rank(game)
        GuideMomentKey.NewTier -> tierReached(game.level.shown.tier, game)
        GuideMomentKey.FirstMint -> meesh(maxOf(1, game.mint.number - 1))
        GuideMomentKey.TreasuryTier -> game.treasury.tier?.let {
            GamePhotoMoment(GamePhotoCatchUpLaw.treasuryStepId(it), PhotoStepEmblem.Treasury(it))
        }
        GuideMomentKey.Level100 -> levelHundred(game.level.prestige)
        else -> null
    }

    /**
     * Le moment d'une carte de Mee (iOS `ProgressionFrontList.cardPhoto` et `act(on:)`) : l'étape « Ton rang ne baisse
     * jamais » (« Prendre ma photo de départ ») ouvre la photo de DÉPART ; une carte de moment photo, le moment qu'elle
     * dit. `null` : la carte ne mène pas à la photo (la vague 2 a son propre moment, hors de ce lot).
     */
    public fun ofCard(card: GuideCard, game: GameBlock): GamePhotoMoment? = when (val content = card.content) {
        is GuideContent.Step -> start().takeIf { card.destination == GuideDestination.Photo }
        is GuideContent.Moment -> fromCard(content.moment.key, game).takeIf { card.photo || card.destination == GuideDestination.Photo }
        is GuideContent.MomentV2 -> null
    }

    /**
     * Les moments qu'une transition CONFIRMÉE vient de produire (iOS `GamePhotoMoments.ofTransition`, vague 1) : ce que
     * Mee propose APRÈS la célébration. Rang ou division gagnés (avec de la gloire en plus), palier, Prestige, première
     * Meesh et chaque dixième, palier du trésor, Flamme qui franchit 7, 30, 100 ou 365 jours.
     */
    public fun ofTransition(before: GameBlock, after: GameBlock): List<GamePhotoMoment> = buildList {
        val divisionRose = after.glory.shownDivision?.let { now -> before.glory.shownDivision?.let { now < it } } ?: false
        if ((after.glory.rank != before.glory.rank || divisionRose) && after.glory.glory > before.glory.glory) add(rank(after))
        if (after.level.shown.tier.ordinal > before.level.shown.tier.ordinal) add(tierReached(after.level.shown.tier, after))
        if (after.level.prestige > before.level.prestige) add(levelHundred(after.level.prestige))
        val minted = before.mint.number
        if (after.mint.number > before.mint.number && (minted == 1 || minted % MEESH_STRIDE == 0)) add(meesh(minted))
        val treasuryAfter = after.treasury.tier
        if (treasuryAfter != null && treasuryAfter.ordinal > (before.treasury.tier?.ordinal ?: -1)) {
            add(GamePhotoMoment(GamePhotoCatchUpLaw.treasuryStepId(treasuryAfter), PhotoStepEmblem.Treasury(treasuryAfter)))
        }
        if (flameThresholds.any { before.flame.days < it && after.flame.days >= it }) flame(after.flame.days)?.let(::add)
    }

    private fun rank(game: GameBlock): GamePhotoMoment {
        val division = if (game.glory.rank == GloryRank.Mythe) null else game.glory.shownDivision
        return GamePhotoMoment(
            GamePhotoCatchUpLaw.rankStepId(game.glory.rank, division),
            PhotoStepEmblem.Rank(game.glory.rank, division),
        )
    }

    /** Le palier atteint, dans SON cycle, et combien de fois il l'a été (#10911). */
    private fun tierReached(tier: LevelTierKey, game: GameBlock): GamePhotoMoment {
        val level = GameLevels.tierStart(tier)
        val times = GamePhotoCatchUpLaw.levelReachCount(PhotoCatchUpStanding.of(game), level)
        return GamePhotoMoment(
            GamePhotoCatchUpLaw.tierStepId(tier, game.level.prestige),
            PhotoStepEmblem.Tier(tier, level, maxOf(0, game.level.prestige), times),
        )
    }

    /** Le sommet : « Niveau 100 » au premier cycle, la Renaissance ensuite — l'identité d'iOS, `level-100:<cycle>`. */
    private fun levelHundred(prestige: Int): GamePhotoMoment {
        val cycle = maxOf(0, prestige)
        val emblem = if (cycle == 0) PhotoStepEmblem.LevelHundred else PhotoStepEmblem.Prestige(cycle)
        return GamePhotoMoment("level-100:$cycle", emblem)
    }

    private fun meesh(number: Int): GamePhotoMoment =
        GamePhotoMoment("meesh:$number", PhotoStepEmblem.Meesh(number, GameMint.edition(number)))

    private fun flame(days: Int): GamePhotoMoment? {
        val threshold = flameThresholds.lastOrNull { days >= it } ?: return null
        val form = GameFlameLaw.form(threshold) ?: FlameFormKey.Braise
        return GamePhotoMoment("flame:$threshold", PhotoStepEmblem.Flame(form, threshold))
    }

    private const val MEESH_STRIDE = 10
}
