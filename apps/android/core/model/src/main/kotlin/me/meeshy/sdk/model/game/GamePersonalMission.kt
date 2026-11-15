package me.meeshy.sdk.model.game

import kotlin.math.max
import kotlin.math.min

/*
 * La mission personnelle du jour (#9539) : UNE mission par compte et par jour, À CÔTÉ des trois du
 * jour, avec sa plage de deux heures pleines dans le fuseau du compte. MIROIR de
 * `packages/shared/utils/game/personal-mission.ts` et de `GamePersonalMission.swift` (iOS).
 *
 * L'histogramme des heures est une ENTRÉE de la loi, jamais une sortie : seule la plage tirée est
 * servie, au hasard pondéré. `nowMinute` est un PARAMÈTRE : tirée tard, la mission ne retient que
 * des plages où il reste au moins une heure, sinon `null` (jamais une mission déjà manquée).
 */

public enum class PersonalActivity { React, Voice, Chat, Stickers, Attachments, Reply, Comment, Story, Post, Prism }

public data class PersonalMissionInput(
    val userId: String,
    val dayKey: String,
    val level: Int,
    val flameDays: Int,
    /** La minute du jour LOCAL au moment du tirage, 0..1439. */
    val nowMinute: Int,
    /** Vingt-quatre compteurs d'activité par heure locale ; `null` sans historique lisible. */
    val activeHours: List<Double>?,
    /** Un compte par signal d'axe (`axis:…`), qui pèse sur le tirage. */
    val usage: Map<String, Double>,
    val multilingual: Boolean,
    val excludedSignals: Set<String> = emptySet(),
    val profile: MissionProfile? = null,
)

public data class PersonalMissionDraw(val mission: DrawnMission, val startMinute: Int, val endMinute: Int)

public object GamePersonalMissionLaw {

    /** L'emplacement de la mission personnelle : les trois premiers sont ceux du jour. */
    public const val SLOT: Int = 3
    public const val WINDOW_MINUTES: Int = 120
    private const val EARLIEST_START_HOUR = 8
    private const val LATEST_START_HOUR = 21
    private const val MIN_REMAINING_MINUTES = 60
    private const val MIN_HABIT_SAMPLES = 8

    private data class Entry(val key: String, val tier: MissionDifficulty, val activity: PersonalActivity)

    private val POOL = listOf(
        Entry("react-messages", MissionDifficulty.Easy, PersonalActivity.React),
        Entry("send-voice", MissionDifficulty.Easy, PersonalActivity.Voice),
        Entry("send-texts", MissionDifficulty.Easy, PersonalActivity.Chat),
        Entry("use-stickers", MissionDifficulty.Easy, PersonalActivity.Stickers),
        Entry("send-attachments", MissionDifficulty.Easy, PersonalActivity.Attachments),
        Entry("reply-conversations", MissionDifficulty.Medium, PersonalActivity.Reply),
        Entry("comment-text", MissionDifficulty.Medium, PersonalActivity.Comment),
        Entry("publish-story", MissionDifficulty.Medium, PersonalActivity.Story),
        Entry("publish-post", MissionDifficulty.Medium, PersonalActivity.Post),
        Entry("prism-foreign-messages", MissionDifficulty.Medium, PersonalActivity.Prism),
        Entry("prism-foreign-exchange", MissionDifficulty.Hard, PersonalActivity.Prism),
        Entry("reply-conversations-wide", MissionDifficulty.Hard, PersonalActivity.Reply),
        Entry("publish-posts", MissionDifficulty.Hard, PersonalActivity.Post),
        Entry("voice-comments", MissionDifficulty.Hard, PersonalActivity.Comment),
        Entry("long-chat", MissionDifficulty.Hard, PersonalActivity.Chat),
    )

    /** L'activité que la notification nomme pour ce gabarit (`Chat` hors du pool personnel). */
    public fun activity(templateKey: String): PersonalActivity = POOL.firstOrNull { it.key == templateKey }?.activity ?: PersonalActivity.Chat

    private fun tierOf(level: Int): MissionDifficulty = when {
        level < 10 -> MissionDifficulty.Easy
        level < 30 -> MissionDifficulty.Medium
        else -> MissionDifficulty.Hard
    }

    private fun finite(value: Double?): Double = if (value != null && value.isFinite() && value > 0) value else 0.0

    private fun weightedIndex(rng: GameRandom, weights: List<Double>): Int {
        val total = weights.sum()
        if (total <= 0) return rng.pickIndex(weights.size)
        var ticket = rng.next() * total
        val index = weights.indexOfFirst { w -> ticket -= w; ticket < 0 }
        return if (index == -1) weights.size - 1 else index
    }

    /** Une activité par heure locale, sur 24 cases : les minutes hors de la journée sont ignorées. */
    public fun activeHoursHistogram(minutesOfDay: List<Int>): List<Int> {
        val histogram = IntArray(24)
        minutesOfDay.filter { it in 0 until 1440 }.forEach { histogram[it / 60]++ }
        return histogram.toList()
    }

    private fun defaultHourWeight(hour: Int): Double = when (hour) {
        in 18..21 -> 3.0
        in 12..13 -> 2.0
        else -> 1.0
    }

    private fun hourWeights(activeHours: List<Double>?, startHours: List<Int>): List<Double> {
        val known = activeHours != null && activeHours.size == 24 && activeHours.sumOf { finite(it) } >= MIN_HABIT_SAMPLES
        return startHours.map { hour ->
            if (known) 1 + finite(activeHours?.getOrNull(hour)) + finite(activeHours?.getOrNull(hour + 1)) else defaultHourWeight(hour)
        }
    }

    private fun openStartHours(nowMinute: Int): List<Int> =
        (EARLIEST_START_HOUR..LATEST_START_HOUR).filter { it * 60 + WINDOW_MINUTES - nowMinute >= MIN_REMAINING_MINUTES }

    /** Une plage tient-elle encore aujourd'hui ? À demander AVANT de lire les habitudes du compte. */
    public fun windowStillFits(nowMinute: Int): Boolean = openStartHours(nowMinute).isNotEmpty()

    private fun floorLog2(value: Double): Int = Math.getExponent(value)

    public fun draw(input: PersonalMissionInput): PersonalMissionDraw? {
        val startHours = openStartHours(input.nowMinute)
        if (startHours.isEmpty()) return null

        val tier = tierOf(input.level)
        val candidates = POOL.filter { it.tier == tier }
            .mapNotNull { entry -> GameMissionCatalog.template(entry.key) }
            .filter { GameMissionLaws.availableFor(it, input.profile) }
        val open = candidates.filter { it.signal !in input.excludedSignals }
        val pool = open.ifEmpty { candidates }

        val weights = pool.map { template ->
            if (template.prism) {
                if (input.multilingual) 3.0 else 0.0
            } else {
                1.0 + min(6, floorLog2(1 + finite(input.usage[template.signal])))
            }
        }
        val picked = pool.getOrNull(weightedIndex(GameRandom(GameSeedParts(input.userId, input.dayKey, "personal-mission")), weights)) ?: return null

        val startHour = startHours[
            weightedIndex(GameRandom(GameSeedParts(input.userId, input.dayKey, "personal-window")), hourWeights(input.activeHours, startHours)),
        ]
        val mission = GameMissionLaws.drawnMissionOf(picked, tier, input.level, input.flameDays, input.profile).copy(glory = 0)
        return PersonalMissionDraw(mission, startHour * 60, startHour * 60 + WINDOW_MINUTES)
    }

    /** Début inclus, fin exclue : passé la fin, la mission n'est plus réalisable. */
    public fun isOpen(startsAtMillis: Long, endsAtMillis: Long, nowMillis: Long): Boolean =
        nowMillis >= startsAtMillis && nowMillis < endsAtMillis

    /** Réussie dès qu'elle est faite ; sinon à venir, en cours, ou manquée. */
    public fun state(startsAtMillis: Long, endsAtMillis: Long, completed: Boolean, nowMillis: Long): PersonalMissionState = when {
        completed -> PersonalMissionState.Completed
        nowMillis < startsAtMillis -> PersonalMissionState.Upcoming
        nowMillis < endsAtMillis -> PersonalMissionState.Active
        else -> PersonalMissionState.Missed
    }
}
