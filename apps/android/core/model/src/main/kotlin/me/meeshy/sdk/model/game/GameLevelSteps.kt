package me.meeshy.sdk.model.game

import kotlin.math.max

/** Une étape : le niveau qu'elle ouvre et ce qu'elle demande (`target` pour les compteurs, `rank` pour un rang). */
public data class LevelStepRule(
    val level: Int,
    val kind: LevelStepKind,
    val target: Int = 0,
    val rank: GloryRank? = null,
)

/** Tout ce que les étapes lisent : les compteurs, la Gloire et le rang servi (Mythe compris). */
public data class LevelStepFacts(
    val minted: Int,
    val missionsDone: Int,
    val flameRecord: Int,
    val glory: Int,
    val rank: GloryRank,
) {
    public constructor(counts: GameLevelStepCounts, glory: Int, rank: GloryRank) :
        this(counts.minted, counts.missionsDone, counts.flameRecord, glory, rank)
}

/**
 * LES ÉTAPES DES NIVEAUX : une étape tous les dix niveaux, de 10 à 100. Les points ne suffisent plus ;
 * si l'étape manque, le niveau ATTEND au palier précédent (9, 19 ... 99), puis monte d'un coup. Le niveau
 * servi est le plus petit de trois : les points, le plafond du rang, le palier des étapes. Le TypeScript
 * fait foi (`level-steps.ts`) ; miroir iOS `GameLevelSteps.swift`. L'étape décrite est le
 * [GameLevelStep] du fil.
 */
public object GameLevelSteps {
    /** La table du porteur : une ligne par dizaine, dans l'ordre. */
    public val rules: List<LevelStepRule> = listOf(
        LevelStepRule(10, LevelStepKind.Mint, target = 1),
        LevelStepRule(20, LevelStepKind.Missions, target = 1),
        LevelStepRule(30, LevelStepKind.Rank, rank = GloryRank.Echo),
        LevelStepRule(40, LevelStepKind.Flame, target = 7),
        LevelStepRule(50, LevelStepKind.Missions, target = 10),
        LevelStepRule(60, LevelStepKind.Rank, rank = GloryRank.Voix),
        LevelStepRule(70, LevelStepKind.Mint, target = 5),
        LevelStepRule(80, LevelStepKind.Rank, rank = GloryRank.Conteur),
        LevelStepRule(90, LevelStepKind.Flame, target = 30),
        LevelStepRule(100, LevelStepKind.Rank, rank = GloryRank.Passeur),
    )

    /** La plus grande cible des missions : la passerelle n'a pas besoin de compter plus loin. */
    public val missionsCounted: Int =
        rules.filter { it.kind == LevelStepKind.Missions }.maxOfOrNull { it.target } ?: 0

    private fun rankIndex(rank: GloryRank): Int = rank.ordinal

    private fun current(rule: LevelStepRule, facts: LevelStepFacts): Int = max(
        0,
        when (rule.kind) {
            LevelStepKind.Mint -> facts.minted
            LevelStepKind.Missions -> facts.missionsDone
            LevelStepKind.Flame -> facts.flameRecord
            LevelStepKind.Rank -> facts.glory
        },
    )

    /** L'étape est-elle faite ? Un rang se juge sur le rang SERVI (le Mythe vaut tous les rangs). */
    public fun isMet(rule: LevelStepRule, facts: LevelStepFacts): Boolean =
        if (rule.kind == LevelStepKind.Rank) {
            rule.rank != null && rankIndex(facts.rank) >= rankIndex(rule.rank)
        } else {
            current(rule, facts) >= rule.target
        }

    /** L'étape d'un niveau donné, `null` hors des dizaines de 10 à 100. */
    public fun ruleAt(level: Int): LevelStepRule? = rules.firstOrNull { it.level == level }

    /**
     * Le palier des étapes : la première étape manquante retient le niveau juste en dessous (9, 19 ... 99) ;
     * toutes faites, ou sans faits (serveur d'avant les étapes), rien ne retient (`null`).
     */
    public fun gate(facts: LevelStepFacts?): Int? {
        if (facts == null) return null
        val missing = rules.firstOrNull { !isMet(it, facts) } ?: return null
        return missing.level - 1
    }

    /** Le plafond du niveau SERVI : le plus serré du rang et des étapes. */
    public fun cap(rank: GloryRank, steps: LevelStepFacts?): Int? =
        GameLevels.tighter(GloryLaws.levelCap(rank), gate(steps))

    private fun step(rule: LevelStepRule, facts: LevelStepFacts): GameLevelStep = GameLevelStep(
        level = rule.level,
        kind = rule.kind,
        target = (if (rule.kind == LevelStepKind.Rank) rule.rank?.let { GloryLaws.minGlory(it) } ?: 0 else rule.target).toLong(),
        current = current(rule, facts).toLong(),
        met = isMet(rule, facts),
        rank = rule.rank.takeIf { rule.kind == LevelStepKind.Rank },
    )

    /**
     * La PROCHAINE étape au-dessus de ce niveau, faite ou à faire. `null` au-delà de 100 ou sans faits.
     * Un niveau retenu à 9 montre l'étape du 10 : c'est elle qui dit pourquoi.
     */
    public fun next(afterLevel: Int, facts: LevelStepFacts?): GameLevelStep? {
        if (facts == null || afterLevel >= GameLevels.STEP_LAST) return null
        val nextLevel = (max(0, afterLevel) / GameLevels.STEP_INTERVAL + 1) * GameLevels.STEP_INTERVAL
        return ruleAt(nextLevel)?.let { step(it, facts) }
    }

    /** Toutes les étapes, faites ou à faire. */
    public fun all(facts: LevelStepFacts): List<GameLevelStep> = rules.map { step(it, facts) }
}
