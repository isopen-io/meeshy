package me.meeshy.sdk.model.game

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/*
 * Le calendrier des saisons SERVI (#10016, #10232). MIROIR de `packages/shared/utils/game/season-schedule.ts`
 * et de `GameSeasonSchedule.swift` (iOS) — la loi de LECTURE.
 *
 * La passerelle sert un calendrier (`GET /api/v1/me/game/seasons/calendar`) : une définition par saison
 * programmée. Ce qui n'est pas défini se DÉRIVE de `GameSeason` : la saison 1 ouvre le 2026-12-21, chaque
 * saison suit la précédente de 56 jours, le thème tourne. Le calendrier vide ([SeasonSchedule.default]) rend
 * donc EXACTEMENT `GameSeason`.
 *
 * - Une saison DÉCALÉE pose une ancre : elle ouvre à son lundi, les suivantes s'enchaînent depuis elle.
 * - Une saison EN PAUSE n'a plus de dates, ni celles qui la suivent.
 *
 * La PROGRAMMATION (`applySeasonEdit`) n'a pas de miroir : l'admin la fait depuis le web.
 */

@Serializable
public enum class SeasonDefinitionStatus {
    @SerialName("scheduled") Scheduled,
    @SerialName("paused") Paused,
}

/** Les textes d'une saison dans une langue — les limites d'un événement in-app App Store. */
@Serializable
public data class SeasonCopy(val title: String, val tagline: String, val description: String)

@Serializable
public data class SeasonDefinition(
    val number: Int,
    /** Un lundi, `AAAA-MM-JJ`. Pour une saison en pause : la date proposée, ignorée. */
    val startDay: String,
    val status: SeasonDefinitionStatus,
    val themeKey: String,
    /** Les points d'une étape ordinaire, dans `[STEP_POINTS_MIN, STEP_POINTS_MAX]`. */
    val stepPoints: Int,
    /** Par langue de la fiche ([SeasonSchedule.COPY_LOCALES]), `null` sans texte propre. */
    val copy: Map<String, SeasonCopy>? = null,
)

@Serializable
public data class SeasonSchedule(
    /** Croît à chaque écriture : l'ETag de la lecture servie, la clé du cache hors ligne. */
    val revision: Int,
    /** Les définitions CONFORMES, triées par numéro ([normalize]). */
    val seasons: List<SeasonDefinition>,
) {
    /** L'ETag que la passerelle pose sur la lecture de cette révision. */
    val etag: String get() = "\"season-schedule-$revision\""

    // MARK: Les lectures

    /** Le calendrier d'une saison ; `null` en pause (ou derrière une pause) ou pour un numéro invalide. */
    public fun calendar(number: Int): SeasonCalendar? = if (number < 1) null else plan.calendarOf(number)

    /** La saison qui contient ce jour ; `null` avant la première, dans un intervalle ou pendant une pause. */
    public fun season(dayKey: String): Int? {
        if (!GameDay.isDayKey(dayKey)) return null
        val n = plan.lastStartedAt(dayKey) ?: return null
        val calendar = plan.calendarOf(n) ?: return null
        val day = GameDay.number(dayKey) ?: return null
        val end = GameDay.number(calendar.endDay) ?: return null
        return if (day <= end) n else null
    }

    /** La semaine de saison, de 1 à 8 ; `null` hors saison. */
    public fun week(dayKey: String): Int? {
        val n = season(dayKey) ?: return null
        val start = plan.startOf(n) ?: return null
        val elapsed = GameDay.diff(start, dayKey) ?: return null
        return elapsed / 7 + 1
    }

    /** La saison d'un moment, la fermeture du dimanche 20 h comprise. */
    public fun season(moment: SeasonMoment): Int? = season(SeasonWeeks.weekOfMoment(moment))

    /**
     * La saison À VENIR : hors saison (avant la première, dans un intervalle), la prochaine programmée ;
     * `null` pendant une saison, ou quand la suivante est en pause.
     */
    public fun upcoming(moment: SeasonMoment): SeasonCalendar? {
        val week = SeasonWeeks.weekOfMoment(moment)
        if (season(week) != null) return null
        return plan.calendarOf(plan.lastStartedAt(week)?.let { it + 1 } ?: 1)
    }

    public fun status(number: Int): SeasonDefinitionStatus {
        val paused = plan.pausedFrom
        return if (paused != null && number >= paused) SeasonDefinitionStatus.Paused else SeasonDefinitionStatus.Scheduled
    }

    /**
     * La définition d'une saison : celle du calendrier, ou la dérivation (dates enchaînées, thème en boucle,
     * points de la loi, sans texte propre).
     */
    public fun definition(number: Int): SeasonDefinition? {
        if (number < 1) return null
        plan.byNumber[number]?.let { return it }
        val anchor = SchedulePlan.dates(this).anchorFor(number)
        return SeasonDefinition(
            number = number,
            startDay = GameDay.add((number - anchor.number) * GameSeason.DAYS, anchor.startDay) ?: anchor.startDay,
            status = status(number),
            themeKey = GameSeason.themeOf(number),
            stepPoints = GameSeason.STEP_POINTS,
            copy = null,
        )
    }

    private val plan: SchedulePlan get() = SchedulePlan(this)

    public companion object {
        /** Le repli : aucune définition, la constante de [GameSeason]. Jamais vide de saison. */
        public val default: SeasonSchedule = SeasonSchedule(revision = 0, seasons = emptyList())

        public const val STEP_POINTS_MIN: Int = 50
        public const val STEP_POINTS_MAX: Int = 200
        public const val STEP_POINTS_STEP: Int = 10

        /** Les sept langues de la fiche — arabe en miroir. */
        public val COPY_LOCALES: List<String> = listOf("fr", "en", "es", "de", "it", "pt-BR", "ar")
        public const val TITLE_MAX: Int = 30
        public const val TAGLINE_MAX: Int = 50
        public const val DESCRIPTION_MAX: Int = 120

        public fun isLawfulStepPoints(value: Int): Boolean =
            value in STEP_POINTS_MIN..STEP_POINTS_MAX && value % STEP_POINTS_STEP == 0

        /** Lit un calendrier reçu en texte JSON (réseau, disque). Illisible : le repli. */
        public fun normalizeJson(text: String?): SeasonSchedule {
            if (text == null) return default
            val raw = try {
                Json.parseToJsonElement(text)
            } catch (_: Exception) {
                return default
            }
            return normalize(raw)
        }

        /**
         * Lit un calendrier reçu (réseau, disque) et en garde ce qui est conforme : une définition illisible
         * ou qui chevauche la précédente est ignorée — la saison retombe alors sur la dérivation. Illisible :
         * le repli.
         */
        public fun normalize(raw: JsonElement?): SeasonSchedule {
            val record = raw as? JsonObject ?: return default
            val revision = integer(record["revision"])?.takeIf { it >= 0 } ?: return default
            val list = record["seasons"] as? JsonArray ?: return default
            val candidates = list.mapNotNull(::definitionFrom).sortedBy { it.number }
            val accepted = mutableListOf<SeasonDefinition>()
            for (def in candidates) {
                if (accepted.any { it.number == def.number }) continue
                if (def.number > 1 && overlapsPrevious(accepted, def)) continue
                accepted += def
            }
            return SeasonSchedule(revision, accepted.toList())
        }

        // Les dates se vérifient pauses IGNORÉES : une saison en pause garde sa date prévue, et ce qui la
        // suit doit rester cohérent avec elle.
        private fun overlapsPrevious(accepted: List<SeasonDefinition>, def: SeasonDefinition): Boolean {
            val previous = SchedulePlan.dates(SeasonSchedule(0, accepted)).startOf(def.number - 1) ?: return false
            val gap = GameDay.diff(previous, def.startDay) ?: return false
            return gap < GameSeason.DAYS
        }

        private fun integer(value: JsonElement?): Int? {
            val primitive = value as? JsonPrimitive ?: return null
            if (primitive.isString) return null
            val number = primitive.content.toDoubleOrNull() ?: return null
            if (!number.isFinite() || number != Math.rint(number) || Math.abs(number) >= 1e15) return null
            return number.toLong().toInt()
        }

        private fun text(value: JsonElement?): String? =
            (value as? JsonPrimitive)?.takeIf { it.isString }?.content

        private fun definitionFrom(raw: JsonElement): SeasonDefinition? {
            val r = raw as? JsonObject ?: return null
            val number = integer(r["number"])?.takeIf { it >= 1 } ?: return null
            val startDay = text(r["startDay"])?.takeIf { GameDay.isDayKey(it) && SeasonWeeks.weekdayIndex(it) == 0 } ?: return null
            val status = when (text(r["status"])) {
                "scheduled" -> SeasonDefinitionStatus.Scheduled
                "paused" -> SeasonDefinitionStatus.Paused
                else -> return null
            }
            val themeKey = text(r["themeKey"])?.takeIf { it in GameSeason.themeKeys } ?: return null
            val stepPoints = integer(r["stepPoints"])?.takeIf(::isLawfulStepPoints) ?: return null
            // Des textes illisibles ne retirent QUE les textes : jamais les dates d'une saison, qui se
            // décalerait sinon en silence.
            return SeasonDefinition(number, startDay, status, themeKey, stepPoints, lawfulCopy(r["copy"]))
        }

        /** Sept langues, trois textes chacune, dans les limites ; rien d'autre. */
        internal fun lawfulCopy(value: JsonElement?): Map<String, SeasonCopy>? {
            val record = value as? JsonObject ?: return null
            if (record.size != COPY_LOCALES.size) return null
            val result = linkedMapOf<String, SeasonCopy>()
            for (locale in COPY_LOCALES) {
                val c = record[locale] as? JsonObject ?: return null
                if (c.size != 3) return null
                val title = text(c["title"])?.takeIf { lawfulText(it, TITLE_MAX) } ?: return null
                val tagline = text(c["tagline"])?.takeIf { lawfulText(it, TAGLINE_MAX) } ?: return null
                val description = text(c["description"])?.takeIf { lawfulText(it, DESCRIPTION_MAX) } ?: return null
                result[locale] = SeasonCopy(title, tagline, description)
            }
            return result
        }

        // Aucun lien, domaine ni adresse dans un texte de saison (il devient un événement App Store).
        private val linkPattern = Regex(
            "[a-z][a-z0-9+.-]*://|www\\.|[a-z0-9-]+\\.[a-z]{2,}(?:/|(?![A-Za-z0-9_]))|@[a-z0-9-]+\\.",
            RegexOption.IGNORE_CASE,
        )

        // Aucune devise. Le `\b` ASCII du TS s'écrit en regards explicites (celui de Java est Unicode).
        private val moneyPattern = Regex(
            "[\$€£¥₹₦₩₽¢]|(?<![A-Za-z0-9_])(?:USD|EUR|XAF|XOF|FCFA|GBP|CFA)(?![A-Za-z0-9_])",
            RegexOption.IGNORE_CASE,
        )

        // Ni contrôle, ni contrôle bidirectionnel, ni caractère sans chasse.
        private val hiddenPattern = Regex("[\\u0000-\\u001f\\u007f\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u2069\\ufeff]")

        private fun lawfulText(value: String, max: Int): Boolean =
            value.isNotBlank() && value.trim() == value && value.codePointCount(0, value.length) <= max &&
                !hiddenPattern.containsMatchIn(value) && !linkPattern.containsMatchIn(value) &&
                !moneyPattern.containsMatchIn(value)
    }
}

/** Le plan : ancres, pause, définitions par numéro. */
internal class SchedulePlan(schedule: SeasonSchedule) {
    class Anchor(val number: Int, val startDay: String)

    val anchors: List<Anchor>
    val pausedFrom: Int?
    val byNumber: Map<Int, SeasonDefinition>

    init {
        val sorted = schedule.seasons.sortedBy { it.number }
        val found = mutableListOf(Anchor(1, GameSeason.ONE_START))
        var paused: Int? = null
        for (def in sorted) {
            if (def.status == SeasonDefinitionStatus.Paused) {
                paused = def.number
                break
            }
            if (def.number == 1) found[0] = Anchor(1, def.startDay) else found += Anchor(def.number, def.startDay)
        }
        anchors = found
        pausedFrom = paused
        byNumber = sorted.associateBy { it.number }
    }

    fun anchorFor(n: Int): Anchor = anchors.lastOrNull { it.number <= n } ?: anchors[0]

    /** Le lundi d'ouverture de la saison, `null` en pause (ou derrière une pause). */
    fun startOf(n: Int): String? {
        if (pausedFrom != null && n >= pausedFrom) return null
        val anchor = anchorFor(n)
        return GameDay.add((n - anchor.number) * GameSeason.DAYS, anchor.startDay)
    }

    fun calendarOf(n: Int): SeasonCalendar? {
        val startDay = startOf(n) ?: return null
        return SeasonWeeks.calendarOf(n, startDay, byNumber[n]?.themeKey ?: GameSeason.themeOf(n))
    }

    /** Le numéro de la dernière saison OUVERTE à ce jour (en cours ou close), `null` avant la première. */
    fun lastStartedAt(dayKey: String): Int? {
        val day = GameDay.number(dayKey) ?: return null
        val index = anchors.indexOfLast { (GameDay.number(it.startDay) ?: Long.MAX_VALUE) <= day }
        if (index < 0) return null
        val anchor = anchors[index]
        val start = GameDay.number(anchor.startDay) ?: return null
        var n = anchor.number + ((day - start) / GameSeason.DAYS).toInt()
        anchors.getOrNull(index + 1)?.let { n = minOf(n, it.number - 1) }
        pausedFrom?.let { n = minOf(n, it - 1) }
        return if (n >= 1 && startOf(n) != null) n else null
    }

    companion object {
        /** Le plan des DATES, pauses ignorées : la date prévue d'une saison en pause, ou derrière une pause. */
        fun dates(schedule: SeasonSchedule): SchedulePlan {
            if (schedule.seasons.none { it.status == SeasonDefinitionStatus.Paused }) return SchedulePlan(schedule)
            return SchedulePlan(
                SeasonSchedule(
                    schedule.revision,
                    schedule.seasons.map { if (it.status == SeasonDefinitionStatus.Paused) it.copy(status = SeasonDefinitionStatus.Scheduled) else it },
                ),
            )
        }
    }
}
