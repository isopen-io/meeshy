package me.meeshy.sdk.model.game

import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

/*
 * Les défis du jour (#9373, #9635) : trois par jour (facile, moyenne, difficile), la difficile
 * devenant mission d'Or dès le niveau 50 ou 50 Meesh gardées. MIROIR de
 * `packages/shared/utils/game/missions.ts` et de `GameMissions.swift` (iOS). Le tirage est
 * déterministe (mulberry32 sur `userId|jour|missions`) ; objectif et récompense sont calculés en
 * ENTIERS exacts (le flottant se trompe d'un ulp là où le plafond ne pardonne pas).
 */

/** Ce qu'un compte apporte au tirage : ce qu'il peut faire, et ce qu'il fait d'ordinaire (par jour, par opération). */
public data class MissionProfile(
    val capabilities: Set<MissionCapability>,
    val habits: Map<String, Double>,
)

public data class DrawnMission(
    val difficulty: MissionDifficulty,
    val templateKey: String,
    val signal: String,
    val prism: Boolean,
    val target: Int,
    /** Points crédités à la validation, bonus de Flamme compris. */
    val reward: Int,
    val glory: Int,
)

/** Ce que l'achèvement d'une mission paie, tout compris. */
public data class MissionArtifacts(val points: Int, val glory: Int, val seasonStars: Int, val chest: Boolean)

public data class DailyMissionDraw(val dayKey: String, val prismDay: Boolean, val missions: List<DrawnMission>)

public data class MissionDrawInput(
    val userId: String,
    val dayKey: String,
    val level: Int,
    val flameDays: Int,
    /** Meeshes gardées : à 50 ou plus, la mission d'Or remplace la difficile. */
    val treasury: Int,
    val unavailableSignals: Set<String> = emptySet(),
    val profile: MissionProfile? = null,
)

/** Une mission du jour telle qu'elle est posée en base : tirée, et peut-être déjà achevée. */
public data class DayMission(val mission: DrawnMission, val completed: Boolean)

public data class MissionReplacement(val index: Int, val mission: DrawnMission)

public object GameMissionLaws {

    public val BASE_POINTS: Map<MissionDifficulty, Int> = mapOf(
        MissionDifficulty.Easy to 40,
        MissionDifficulty.Medium to 80,
        MissionDifficulty.Hard to 160,
        MissionDifficulty.Gold to 320,
    )

    private val HABIT_FACTOR: Map<MissionDifficulty, Double> = mapOf(
        MissionDifficulty.Easy to 0.5,
        MissionDifficulty.Medium to 1.0,
        MissionDifficulty.Hard to 1.25,
        MissionDifficulty.Gold to 1.5,
    )

    /** La Gloire d'un défi, par difficulté : 40 / 100 / 250 / 500. */
    private val GLORY: Map<MissionDifficulty, Int> = mapOf(
        MissionDifficulty.Easy to 40,
        MissionDifficulty.Medium to 100,
        MissionDifficulty.Hard to 250,
        MissionDifficulty.Gold to 500,
    )

    /** Les étoiles de saison d'un défi, par difficulté. */
    private val SEASON_STARS: Map<MissionDifficulty, Int> = mapOf(
        MissionDifficulty.Easy to 1,
        MissionDifficulty.Medium to 1,
        MissionDifficulty.Hard to 2,
        MissionDifficulty.Gold to 3,
    )

    public const val MISSIONS_MIN_LEVEL: Int = 5
    public const val GOLD_MISSION_MIN_LEVEL: Int = 50
    public const val GOLD_MISSION_MIN_TREASURY: Int = 50
    public const val MISSION_SCALE_MAX_LEVEL: Int = 100
    public const val REROLL_PRICE: Int = 1
    public const val REROLL_PER_DAY: Int = 1
    public const val GAME_DAY_MIN_GAP_MS: Long = 20L * 60 * 60 * 1000
    private const val LEVEL_MIN: Int = 1
    private const val DEFAULT_WEIGHT: Int = 4

    public fun glory(difficulty: MissionDifficulty): Int = GLORY.getValue(difficulty)

    public fun seasonStars(difficulty: MissionDifficulty): Int = SEASON_STARS.getValue(difficulty)

    private fun clampLevel(level: Int): Int = min(MISSION_SCALE_MAX_LEVEL, max(LEVEL_MIN, level))

    /** bande = ⌊niveau ÷ 10⌋. */
    public fun band(level: Int): Int = clampLevel(level) / 10

    /** objectif = ⌈ base × (1 + 0,3 × bande) ⌉, en entiers. */
    public fun objective(baseTarget: Int, level: Int): Int = (baseTarget * (10 + 3 * band(level)) + 9) / 10

    /** récompense = base × (1 + 0,15 × bande) × (1 + bonus de Flamme), arrondie au plus proche (demi vers le haut). */
    public fun reward(basePoints: Int, level: Int, flameDays: Int): Int {
        val numerator = basePoints.toLong() * (100 + 15 * band(level)) * (100 + GameFlameLaw.bonusPercent(flameDays))
        return ((numerator + 5000) / 10_000).toInt()
    }

    private fun clampTarget(template: MissionTemplate, target: Int): Int = min(template.maxTarget, max(template.minTarget, target))

    /** L'objectif d'un gabarit pour un compte, borné par le plancher et le plafond du gabarit. */
    public fun target(template: MissionTemplate, difficulty: MissionDifficulty, level: Int, profile: MissionProfile? = null): Int {
        if (profile == null) return clampTarget(template, objective(template.baseTarget, level))
        val habitDef = template.habit ?: return template.minTarget
        val perDay = profile.habits[habitDef.operation] ?: 0.0
        val habit = if (perDay.isFinite() && perDay > 0) perDay * habitDef.ratio else 0.0
        val scaled = habit * HABIT_FACTOR.getValue(difficulty) * (10 + 3 * band(level))
        return clampTarget(template, ceil(scaled / 10 - 1e-9).toInt())
    }

    public fun artifacts(mission: DrawnMission, slot: Int): MissionArtifacts =
        MissionArtifacts(mission.reward, mission.glory, seasonStars(mission.difficulty), chest = slot < 3)

    /** Les gabarits d'une difficulté ; l'Or tire parmi les siens ET les difficiles portés à l'Or. */
    public fun templatesFor(difficulty: MissionDifficulty): List<MissionTemplate> {
        val all = GameMissionCatalog.templates
        if (difficulty != MissionDifficulty.Gold) return all.filter { it.difficulty == difficulty }
        return all.filter { it.difficulty == MissionDifficulty.Gold } +
            all.filter { it.difficulty == MissionDifficulty.Hard }.map { it.copy(difficulty = MissionDifficulty.Gold) }
    }

    /** Un gabarit que ce profil peut faire. Sans profil, tous. */
    public fun availableFor(template: MissionTemplate, profile: MissionProfile?): Boolean =
        profile == null || template.requires.all { it in profile.capabilities }

    public fun drawnMissionOf(template: MissionTemplate, difficulty: MissionDifficulty, level: Int, flameDays: Int, profile: MissionProfile? = null): DrawnMission {
        val clamped = clampLevel(level)
        val target = target(template, difficulty, clamped, profile)
        return DrawnMission(
            difficulty = difficulty,
            templateKey = template.key,
            signal = template.signal,
            prism = template.prism,
            target = target,
            reward = reward(BASE_POINTS.getValue(difficulty) + template.unitPoints * target, clamped, flameDays),
            glory = glory(difficulty),
        )
    }

    private fun pickWeighted(rng: GameRandom, pool: List<MissionTemplate>): MissionTemplate? {
        val weights = pool.map { max(0, it.weight ?: DEFAULT_WEIGHT) }
        val ticket = rng.next() * weights.sum()
        var cumulative = 0
        val index = weights.indexOfFirst { w -> cumulative += w; cumulative > ticket }
        return pool.getOrNull(if (index >= 0) index else pool.size - 1)
    }

    private fun poolOf(difficulty: MissionDifficulty, excluded: Set<String>, prismOnly: Boolean, profile: MissionProfile?): List<MissionTemplate> {
        val pool = templatesFor(difficulty).filter { it.signal !in excluded && availableFor(it, profile) }
        val prism = pool.filter { it.prism }
        return if (prismOnly && prism.isNotEmpty()) prism else pool
    }

    /** Jour Prisme garanti : un jour sur trois, décalé par utilisateur. */
    public fun isPrismDay(userId: String, dayKey: String): Boolean {
        val day = GameDay.number(dayKey) ?: return false
        return (day + (GameSeed.fnv1a(userId) % 3u).toLong()) % 3 == 0L
    }

    public fun draw(input: MissionDrawInput): DailyMissionDraw {
        val level = clampLevel(input.level)
        val rng = GameRandom(GameSeedParts(input.userId, input.dayKey, "missions"))
        val top = if (level >= GOLD_MISSION_MIN_LEVEL || input.treasury >= GOLD_MISSION_MIN_TREASURY) MissionDifficulty.Gold else MissionDifficulty.Hard
        val prismDay = isPrismDay(input.userId, input.dayKey)

        val prismCandidates = if (top == MissionDifficulty.Gold) listOf(MissionDifficulty.Medium) else listOf(MissionDifficulty.Medium, MissionDifficulty.Hard)
        val prismDifficulty = prismCandidates[rng.pickIndex(prismCandidates.size)]

        val used = input.unavailableSignals.toMutableSet()
        val drawn = listOf(top, MissionDifficulty.Medium, MissionDifficulty.Easy).mapNotNull { difficulty ->
            val picked = pickWeighted(rng, poolOf(difficulty, used, prismDay && difficulty == prismDifficulty, input.profile)) ?: return@mapNotNull null
            used += picked.signal
            drawnMissionOf(picked, difficulty, level, input.flameDays, input.profile)
        }
        val byDifficulty = drawn.associateBy { it.difficulty }
        return DailyMissionDraw(
            dayKey = input.dayKey,
            prismDay = prismDay,
            missions = listOf(MissionDifficulty.Easy, MissionDifficulty.Medium, top).mapNotNull { byDifficulty[it] },
        )
    }

    /** Changer UNE mission du jour : même difficulté, un autre gabarit, jamais un signal déjà tiré ce jour-là. */
    public fun reroll(
        userId: String,
        dayKey: String,
        level: Int,
        flameDays: Int,
        missions: List<DrawnMission>,
        index: Int,
        rerollCount: Int,
        unavailableSignals: Set<String> = emptySet(),
        profile: MissionProfile? = null,
    ): DrawnMission? {
        val current = missions.getOrNull(index) ?: return null
        val excluded = unavailableSignals + missions.map { it.signal }
        val pool = poolOf(current.difficulty, excluded, false, profile).filter { it.key != current.templateKey }
        val rng = GameRandom(GameSeedParts(userId, dayKey, "reroll:$index:${max(0, rerollCount)}"))
        val picked = pickWeighted(rng, pool) ?: return null
        return drawnMissionOf(picked, current.difficulty, clampLevel(level), flameDays, profile)
    }

    /** Le gabarit est-il encore tirable à cette difficulté, et son signal encore produit par le compte ? */
    public fun isStillPossible(templateKey: String, difficulty: MissionDifficulty, signal: String, unavailableSignals: Set<String> = emptySet()): Boolean =
        templatesFor(difficulty).any { it.key == templateKey } && signal !in unavailableSignals

    /** Les missions du jour devenues IMPOSSIBLES et pas encore achevées reçoivent un gabarit de MÊME difficulté. */
    public fun replaceImpossible(
        userId: String,
        dayKey: String,
        level: Int,
        flameDays: Int,
        missions: List<DayMission>,
        unavailableSignals: Set<String> = emptySet(),
        profile: MissionProfile? = null,
    ): List<MissionReplacement> {
        val clamped = clampLevel(level)
        var signals = missions.map { it.mission.signal }
        val replaced = mutableListOf<MissionReplacement>()
        missions.forEachIndexed { index, day ->
            val current = day.mission
            if (day.completed || isStillPossible(current.templateKey, current.difficulty, current.signal, unavailableSignals)) return@forEachIndexed
            val taken = unavailableSignals + signals.filterIndexed { i, _ -> i != index }
            val open = poolOf(current.difficulty, taken, false, profile)
            val pool = open.ifEmpty { poolOf(current.difficulty, unavailableSignals, false, profile) }
            val picked = pickWeighted(GameRandom(GameSeedParts(userId, dayKey, "replaced:$index")), pool) ?: return@forEachIndexed
            val mission = drawnMissionOf(picked, current.difficulty, clamped, flameDays, profile)
            signals = signals.mapIndexed { i, s -> if (i == index) mission.signal else s }
            replaced += MissionReplacement(index, mission)
        }
        return replaced
    }

    /**
     * La clé de la journée de jeu, MONOTONE : la clé du fuseau ([candidate]) ne s'impose que si elle est
     * postérieure à la dernière journée ouverte ET que celle-ci a été ouverte il y a au moins 20 h.
     */
    public fun resolveGameDayKey(candidate: String, latestDayKey: String?, latestOpenedAtMillis: Long?, nowMillis: Long): String {
        if (latestDayKey == null || latestOpenedAtMillis == null) return candidate
        if (candidate <= latestDayKey) return latestDayKey
        return if (nowMillis - latestOpenedAtMillis < GAME_DAY_MIN_GAP_MS) latestDayKey else candidate
    }
}
