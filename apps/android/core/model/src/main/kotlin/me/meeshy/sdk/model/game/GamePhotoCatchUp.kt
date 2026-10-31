package me.meeshy.sdk.model.game

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.serializer

/*
 * LA LOI DE LA CHRONIQUE (#9961, #9962, #10155) — miroir de `packages/shared/utils/game/photo-catch-up.ts` et de
 * `GamePhotoCatchUpLaw` (SDK Swift), rejoué sur les lois `photo-catch-up`, `photo-offer` et `photo-standing` de
 * `game.vectors.json`.
 *
 * Les étapes se DÉDUISENT de l'état du jeu, jamais d'un journal : sept pistes ordonnées (départ, rang division par
 * division, palier de niveau, sommet et Prestige, Meesh, trésor, Flamme). Dans une piste, seule la PREMIÈRE étape sans
 * photo est ouverte ; les pistes ne s'attendent pas entre elles.
 */

/** Les sept pistes de la Chronique. */
public enum class PhotoTrack(public val wire: String) {
    Start("start"),
    Rank("rank"),
    Tier("tier"),
    Summit("summit"),
    Meesh("meesh"),
    Treasury("treasury"),
    Flame("flame"),
}

/** Ce que le rattrapage lit de l'état du jeu. `division` : V (5) à I (1), `null` pour le Mythe. */
public data class PhotoCatchUpStanding(
    val rank: GloryRank = GloryRank.Murmure,
    val division: Int? = 5,
    val levelRecord: Int = 1,
    val prestige: Int = 0,
    val minted: Int = 0,
    val treasuryTier: TreasuryTierKey? = null,
    val flameRecord: Int = 0,
    val pastCycleRecords: List<Int>? = null,
) {
    public companion object {
        /** La situation lue dans le bloc `game` servi — miroir de `catchUpStandingOf`. */
        public fun of(game: GameBlock): PhotoCatchUpStanding {
            val shown = game.level.shown
            return PhotoCatchUpStanding(
                rank = game.glory.rank,
                division = if (game.glory.rank == GloryRank.Mythe) null else game.glory.shownDivision,
                levelRecord = shown.record,
                prestige = game.level.prestige,
                minted = maxOf(0, game.mint.number - 1),
                treasuryTier = game.treasury.tier,
                flameRecord = maxOf(shown.steps?.flameRecord ?: 0, game.flame.days),
                pastCycleRecords = shown.pastCycleRecords,
            )
        }
    }
}

/** L'emblème qu'une étape grave — sérialisable : la Chronique le garde avec la photo (#13891). */
@Serializable
public sealed interface PhotoStepEmblem {
    @Serializable @SerialName("start")
    public data object Start : PhotoStepEmblem

    @Serializable @SerialName("rank")
    public data class Rank(val rank: GloryRank, val division: Int?) : PhotoStepEmblem

    /** `prestige` : le cycle où le palier est atteint ; `times` : combien de cycles l'ont atteint, celui-ci compris. */
    @Serializable @SerialName("tier")
    public data class Tier(val tier: LevelTierKey, val level: Int, val prestige: Int, val times: Int) : PhotoStepEmblem

    @Serializable @SerialName("level-100")
    public data object LevelHundred : PhotoStepEmblem

    @Serializable @SerialName("prestige")
    public data class Prestige(val number: Int) : PhotoStepEmblem

    @Serializable @SerialName("meesh")
    public data class Meesh(val number: Int, val edition: MeeshEdition) : PhotoStepEmblem

    @Serializable @SerialName("treasury")
    public data class Treasury(val tier: TreasuryTierKey) : PhotoStepEmblem

    @Serializable @SerialName("flame")
    public data class Flame(val form: FlameFormKey, val days: Int) : PhotoStepEmblem
}

/** Une étape franchie : son identité (celle du moment), sa piste, son emblème. */
public data class PhotoLawStep(val track: PhotoTrack, val id: String, val emblem: PhotoStepEmblem)

/** Une étape franchie SANS photo gardée : ouverte, ou en attente d'une étape plus ancienne de sa piste. */
public data class PhotoLawEntry(val step: PhotoLawStep, val isOpen: Boolean, val blockedBy: String?) {
    val id: String get() = step.id
    val track: PhotoTrack get() = step.track
}

public object GamePhotoCatchUpLaw {

    /** L'ordre de préséance d'une proposition : un rang passe avant un palier, une Meesh en dernier. */
    public val offerPriority: List<PhotoTrack> = listOf(
        PhotoTrack.Start, PhotoTrack.Rank, PhotoTrack.Tier, PhotoTrack.Summit,
        PhotoTrack.Treasury, PhotoTrack.Flame, PhotoTrack.Meesh,
    )

    public val flameThresholds: List<Int> = listOf(7, 30, 100, 365)

    private const val MEESH_STRIDE = 10
    private val divisions = listOf(5, 4, 3, 2, 1)

    private fun count(value: Int): Int = maxOf(0, value)

    /** Toutes les étapes franchies, piste après piste, chacune dans son ordre. */
    public fun stepsReached(standing: PhotoCatchUpStanding): List<PhotoLawStep> =
        listOf(PhotoLawStep(PhotoTrack.Start, "start", PhotoStepEmblem.Start)) +
            rankSteps(standing) + tierSteps(standing) + summitSteps(standing) +
            meeshSteps(standing) + treasurySteps(standing) + flameSteps(standing)

    /** Les étapes franchies sans photo gardée : la première de chaque piste est ouverte, les suivantes l'attendent. */
    public fun catchUp(standing: PhotoCatchUpStanding, kept: Set<String>): List<PhotoLawEntry> {
        val missing = stepsReached(standing).filterNot { it.id in kept }
        val firstOfTrack = missing.groupBy { it.track }.mapValues { (_, steps) -> steps.first().id }
        return missing.map { step ->
            val first = firstOfTrack.getValue(step.track)
            if (first == step.id) PhotoLawEntry(step, isOpen = true, blockedBy = null)
            else PhotoLawEntry(step, isOpen = false, blockedBy = first)
        }
    }

    /** La piste d'une identité de moment ; `null` hors des sept pistes (succès, trophée, ligue, saison). */
    public fun track(momentId: String): PhotoTrack? = when (momentId.substringBefore(':')) {
        "start" -> PhotoTrack.Start
        "rank" -> PhotoTrack.Rank
        "tier" -> PhotoTrack.Tier
        "meesh" -> PhotoTrack.Meesh
        "treasury" -> PhotoTrack.Treasury
        "flame" -> PhotoTrack.Flame
        "level-100", "prestige" -> PhotoTrack.Summit
        else -> null
    }

    /**
     * LA proposition d'une transition : chaque moment d'une piste est remplacé par l'étape OUVERTE de sa piste (aucune
     * si la piste est à jour), puis le plus marquant l'emporte. `null` : rien à proposer.
     */
    public fun offer(ids: List<String>, standing: PhotoCatchUpStanding, kept: Set<String>): String? {
        val open = catchUp(standing, kept).filter { it.isOpen }
        val candidates = ids.mapNotNull { id ->
            val lane = track(id) ?: return@mapNotNull id
            open.firstOrNull { it.track == lane }?.id
        }.distinct()
        return candidates.withIndex().minWithOrNull(compareBy({ priority(it.value) }, { it.index }))?.value
    }

    /** Le rang de préséance d'une identité : sa piste dans [offerPriority], une identité hors piste en dernier. */
    public fun priority(momentId: String): Int {
        val lane = track(momentId) ?: return offerPriority.size
        return offerPriority.indexOf(lane).takeIf { it >= 0 } ?: offerPriority.size
    }

    /** L'identité d'une étape de PALIER (#10911) : celle d'hier au premier cycle, une par cycle ensuite. */
    public fun tierStepId(tier: LevelTierKey, prestige: Int): String =
        if (count(prestige) == 0) "tier:${wire(tier)}" else "tier:${wire(tier)}:${count(prestige)}"

    /** Combien de cycles ont atteint ce niveau, le cycle en cours compris (#10911). */
    public fun levelReachCount(standing: PhotoCatchUpStanding, level: Int): Int {
        val prestige = count(standing.prestige)
        val kept = (standing.pastCycleRecords ?: emptyList()).take(prestige).map(::count)
        val closed = kept + List(prestige - kept.size) { GameLevels.PRESTIGE_LEVEL }
        return closed.count { it >= level } + if (count(standing.levelRecord) >= level) 1 else 0
    }

    /** L'identité d'une étape de RANG : `rank:<rang>:<division>`, `0` pour le Mythe. */
    public fun rankStepId(rank: GloryRank, division: Int?): String = "rank:${wire(rank)}:${division ?: 0}"

    /** L'identité d'une étape du TRÉSOR. */
    public fun treasuryStepId(tier: TreasuryTierKey): String = "treasury:${wire(tier)}"

    private fun rankSteps(standing: PhotoCatchUpStanding): List<PhotoLawStep> {
        val ladder = GloryLaws.earnedRanks.flatMap { rank -> divisions.map { rank to it } } + (GloryRank.Mythe to null)
        val steps = ladder.map { (rank, division) ->
            PhotoLawStep(PhotoTrack.Rank, rankStepId(rank, division), PhotoStepEmblem.Rank(rank, division))
        }
        val reached = steps.indexOfFirst { it.id == rankStepId(standing.rank, standing.division) }
        return if (reached >= 1) steps.subList(1, reached + 1) else emptyList()
    }

    private fun tierSteps(standing: PhotoCatchUpStanding): List<PhotoLawStep> {
        val index = GameLevels.tierIndex(count(standing.levelRecord))
        return LevelTierKey.entries.take(index + 1).drop(1).map { tier ->
            val level = GameLevels.tierStart(tier)
            PhotoLawStep(
                PhotoTrack.Tier,
                tierStepId(tier, standing.prestige),
                PhotoStepEmblem.Tier(tier, level, count(standing.prestige), levelReachCount(standing, level)),
            )
        }
    }

    private fun summitSteps(standing: PhotoCatchUpStanding): List<PhotoLawStep> {
        val prestige = count(standing.prestige)
        if (count(standing.levelRecord) < GameLevels.PRESTIGE_LEVEL && prestige == 0) return emptyList()
        val laps = (1..prestige).map { PhotoLawStep(PhotoTrack.Summit, "prestige:$it", PhotoStepEmblem.Prestige(it)) }
        return listOf(PhotoLawStep(PhotoTrack.Summit, "level-100:0", PhotoStepEmblem.LevelHundred)) + laps
    }

    private fun meeshSteps(standing: PhotoCatchUpStanding): List<PhotoLawStep> {
        val minted = count(standing.minted)
        if (minted == 0) return emptyList()
        val numbers = listOf(1) + (1..minted / MEESH_STRIDE).map { it * MEESH_STRIDE }
        return numbers.map { PhotoLawStep(PhotoTrack.Meesh, "meesh:$it", PhotoStepEmblem.Meesh(it, GameMint.edition(it))) }
    }

    private fun treasurySteps(standing: PhotoCatchUpStanding): List<PhotoLawStep> {
        val held = standing.treasuryTier?.ordinal ?: return emptyList()
        return TreasuryTierKey.entries.take(held + 1).map {
            PhotoLawStep(PhotoTrack.Treasury, treasuryStepId(it), PhotoStepEmblem.Treasury(it))
        }
    }

    private fun flameSteps(standing: PhotoCatchUpStanding): List<PhotoLawStep> =
        flameThresholds.filter { count(standing.flameRecord) >= it }.map { days ->
            PhotoLawStep(
                PhotoTrack.Flame,
                "flame:$days",
                PhotoStepEmblem.Flame(GameFlameLaw.form(days) ?: FlameFormKey.Braise, days),
            )
        }

    /** Le nom d'une clé sur le fil : son `@SerialName`, l'unique source. */
    @OptIn(ExperimentalSerializationApi::class)
    private inline fun <reified E : Enum<E>> wire(value: E): String =
        serializer<E>().descriptor.getElementName(value.ordinal)
}
