@file:OptIn(ExperimentalSerializationApi::class)

package me.meeshy.sdk.model.game

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable

/**
 * Le bloc `game` de `GET /me/engagement` (#9378) : niveau et échelle, Gloire et
 * rang, trésor, frappe, missions du jour et personnelle, coffre, Flamme, boosts.
 *
 * MIROIR de `gameBlockSchema` (`packages/shared/types/game.ts`) et de
 * `GameBlock` (iOS, `GameBlockModels.swift`). Le bloc s'AJOUTE à côté des champs
 * actuels de la charge : un ancien serveur ne le sert pas, un ancien client
 * l'ignore.
 *
 * **Jamais à moitié lu** — [GameBlockParser.parse] rend `null` pour un bloc
 * absent, `null` ou partiel (jamais une exception, jamais un zéro inventé).
 * Chaque extension optionnelle (mission personnelle, contenu du jour, fragments
 * d'étoile, échelle des étapes…) tombe SEULE quand elle est illisible.
 *
 * Les extensions de la vague 2 (ligue, duo, saison, trophées, Atlas, Prestige,
 * visibilité) ne sont pas lues ici : un champ inconnu est ignoré, les lots de ces
 * surfaces les ajoutent à côté de ce bloc.
 *
 * Les clés optionnelles s'encodent en `null` : la copie de cache relue hors
 * ligne est la réponse serveur clé pour clé.
 */
@Serializable
public data class GameBlock(
    val level: GameLevel,
    val glory: GameGlory,
    val treasury: TreasuryStanding,
    val mint: GameMintPreview,
    val missions: GameMissions,
    val chest: GameChest,
    val flame: GameFlame,
    val boosts: GameBoosts,
    /** Clés de guide déjà vues (moments et étapes d'intégration). */
    val guideSeen: List<String>,
    /** Les fragments d'étoile collectés (#10011) — `null` d'un serveur antérieur ou si illisible. */
    @EncodeDefault val starFragments: StarFragmentsTotal? = null,
)

/** Une étape des niveaux (#9706) : ce qu'elle demande, où en est le compte, et si elle est faite. */
@Serializable
public data class GameLevelStep(
    val level: Int,
    val kind: LevelStepKind,
    /** Meeshes, missions, jours de Flamme — ou, pour un rang, la Gloire où il commence. */
    val target: Long,
    /** Où en est le compte, dans la même unité que [target]. */
    val current: Long,
    val met: Boolean,
    /** Le rang demandé, `null` hors des étapes de rang. */
    @EncodeDefault val rank: GloryRank? = null,
)

/** Les compteurs que jugent les étapes, pour que l'optimiste rejoue la loi. */
@Serializable
public data class GameLevelStepCounts(val minted: Int, val missionsDone: Int, val flameRecord: Int)

/**
 * Le niveau ouvert par le rang (#9688) : la vérité que le serveur à jour sert à
 * côté des champs d'hier (niveau borné à 100, dix paliers).
 */
@Serializable
public data class GameLevelLadder(
    val level: Int,
    val tier: LevelTierKey,
    val floorScore: Long,
    @EncodeDefault val nextThreshold: Long? = null,
    val pointsToNext: Long,
    val progress: Double,
    val record: Int,
    /** Le plafond que le rang ouvre : 499, 1000, ou `null` (sans limite, à partir d'Oracle). */
    @EncodeDefault val cap: Int? = null,
    /** Le niveau est au plafond : il monte dès que le rang l'ouvre. */
    val isMax: Boolean,
    /** Les points sont là, une étape manque : le niveau attend au palier précédent. */
    @EncodeDefault val held: Boolean = false,
    @EncodeDefault val step: GameLevelStep? = null,
    @EncodeDefault val steps: GameLevelStepCounts? = null,
    /** Le niveau max à vie : il survit au prestige. */
    @EncodeDefault val levelMaxLifetime: Int? = null,
    /** Le record de chaque cycle clos par un Prestige, le plus ancien d'abord. */
    @EncodeDefault val pastCycleRecords: List<Int>? = null,
)

@Serializable
public data class GameLevel(
    /** Ancienne loi : borné à 100 — la vraie valeur est `ladder.level`. */
    val level: Int,
    val tier: LevelTierKey,
    val score: Long,
    val floorScore: Long,
    @EncodeDefault val nextThreshold: Long? = null,
    val pointsToNext: Long,
    val progress: Double,
    val record: Int,
    val prestige: Int,
    val canPrestige: Boolean,
    @EncodeDefault val ladder: GameLevelLadder? = null,
    /** La poche : ce que la frappe dépense, et la base du niveau. */
    @EncodeDefault val sparks: Long? = null,
    /** Accumulées depuis le dernier prestige — indicatif. */
    @EncodeDefault val sparksCycle: Long? = null,
    /** Accumulées à vie — indicatif. */
    @EncodeDefault val sparksLifetime: Long? = null,
    @EncodeDefault val levelMaxLifetime: Int? = null,
    /** La dette d'étincelles : déduite des prochains gains, elle bloque la frappe. */
    @EncodeDefault val sparksDebt: Long? = null,
) {
    /** Ce que l'écran montre : la lecture ouverte par le rang, ou les champs d'hier devant un serveur antérieur. */
    val shown: GameLevelLadder
        get() = ladder ?: GameLevelLadder(
            level = level,
            tier = tier,
            floorScore = floorScore,
            nextThreshold = nextThreshold,
            pointsToNext = pointsToNext,
            progress = progress,
            record = record,
            cap = null,
            isMax = nextThreshold == null,
        )

    /** Le niveau max à vie à MONTRER : servi, sinon relu sur le record — jamais sous le niveau montré. */
    val shownLevelMaxLifetime: Int
        get() = maxOf(levelMaxLifetime ?: ladder?.levelMaxLifetime ?: shown.record, shown.level)
}

/** Une place du Mythe : la place (1 à 100) et l'émission (sa Signature). */
@Serializable
public data class MythicSeatRef(val number: Int, val edition: Int) {
    val isValid: Boolean get() = number in 1..100 && edition >= 1
}

/** Une marche de l'échelle : un rang, sa division, la Gloire où elle commence. */
@Serializable
public data class GloryStep(
    val rank: GloryRank,
    /** Projection héritée (1–3). */
    val division: Int,
    /** V (5) à I (1) — absente d'un ancien serveur. */
    @EncodeDefault val division5: Int? = null,
    val minGlory: Int,
)

@Serializable
public data class GameGlory(
    val glory: Int,
    val rank: GloryRank,
    /** Projection héritée (1–3), `null` pour Mythe. */
    @EncodeDefault val division: Int? = null,
    /** V (5) à I (1), `null` pour Mythe ou devant un ancien serveur (#9636). */
    @EncodeDefault val division5: Int? = null,
    @EncodeDefault val next: GloryStep? = null,
    @EncodeDefault val gloryMissing: Int? = null,
    val progress: Double,
    /** La place du Mythe, quand le serveur la sert et qu'elle est lisible (#9636). */
    @EncodeDefault val mythic: MythicSeatRef? = null,
) {
    /** La division à montrer : `division5` servie, sinon la division héritée relue (ancien serveur). */
    val shownDivision: Int? get() = division5 ?: division

    /** La place du Mythe, seulement quand le rang servi EST le Mythe et la place lisible. */
    val mythicSeat: MythicSeatRef? get() = if (rank == GloryRank.Mythe) mythic?.takeIf { it.isValid } else null
}
