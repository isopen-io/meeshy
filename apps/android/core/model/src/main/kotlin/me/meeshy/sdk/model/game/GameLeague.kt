package me.meeshy.sdk.model.game

import java.text.Normalizer
import java.util.Locale

/*
 * Les ligues hebdomadaires et la ligue Amis (#9384, #9385) — la loi pure. MIROIR de
 * `packages/shared/utils/game/league.ts` (le TypeScript fait foi) et de `GameLeague.swift` (iOS) ;
 * `game.vectors.json` les rejoue tous les trois.
 *
 * Huit ligues, du Quartz au Prisme. La semaine s'identifie par son LUNDI local et ferme le dimanche
 * à 20 h, heure locale. On classe les points GAGNÉS dans la semaine, jamais le score en poche. Les
 * groupes sont de 30 au plus, d'activité comparable, répartis par une fonction DÉTERMINISTE.
 *
 * Ce que la loi se refuse : aucune horloge, aucun fuseau, aucun aléa implicite ; AUCUNE heure
 * d'activité ne sort du classement (un ex æquo se tranche par un hachage de la semaine) ; aucun
 * texte en toutes lettres.
 */

/** Un instant LOCAL : le jour (`AAAA-MM-JJ`) et la minute depuis minuit. */
public data class LeagueMoment(val dayKey: String, val minuteOfDay: Int)

/** Des points GAGNÉS à un instant local. */
public data class LeagueGain(val moment: LeagueMoment, val points: Int)

public data class LeagueEntrant(val userId: String, val activity: Int)

public data class LeagueGroup(val groupId: String, val league: LeagueKey, val weekKey: String, val memberIds: List<String>)

public data class LeagueMemberPoints(val userId: String, val weekPoints: Int)

public data class LeagueStanding(
    val userId: String,
    val weekPoints: Int,
    /** À partir de 1. */
    val rank: Int,
    val zone: LeagueZone,
    val cup: LeagueCup?,
)

public data class LeagueOutcome(val nextLeague: LeagueKey, val promoted: Boolean, val relegated: Boolean, val glory: Int)

public data class SettledLeagueMember(val standing: LeagueStanding, val outcome: LeagueOutcome)

public data class FriendsLeagueEntry(val userId: String, val weekPoints: Int, val rank: Int, val isMe: Boolean)

/** Le filtre d'un pseudonyme CHOISI : la forme, puis les noms réservés, puis l'identité de la personne. */
public sealed interface LeaguePseudonymCheck {
    public data object Ok : LeaguePseudonymCheck
    public data class Refused(val reason: Reason) : LeaguePseudonymCheck

    public enum class Reason(public val wire: String) { Shape("shape"), Reserved("reserved"), Identity("identity") }
}

/** Ce qu'un lecteur apprend d'un joueur de la ligue : jamais une présence. */
public data class LeagueMemberVisibility(val pseudonym: Boolean, val realIdentity: Boolean) {
    val presence: Boolean get() = false
}

public enum class LeagueBoard { Public, Friends }

public object GameLeague {

    public const val MIN_LEVEL: Int = 10
    public const val GROUP_SIZE: Int = 30
    public const val PROMOTED: Int = 7
    public const val RELEGATED: Int = 5
    public const val CUP_COUNT: Int = 3

    /** Dimanche, le lundi valant 0. */
    public const val CLOSE_WEEKDAY: Int = 6

    /** 20 h 00, en minutes depuis minuit local. */
    public const val CLOSE_MINUTE: Int = 20 * 60

    /** 4 h locales : l'heure où le classement se fige pour les AUTRES membres. */
    public const val SNAPSHOT_MINUTE: Int = 4 * 60

    public const val PSEUDONYM_MIN: Int = 3
    public const val PSEUDONYM_MAX: Int = 20

    /** La première semaine de ligue publique ; avant elle, aucun groupe ne se place. */
    public const val FIRST_WEEK: String = "2026-10-12"

    /** Les noms qu'un pseudonyme de ligue ne prend jamais — ceux de la maison et des rôles. */
    public val RESERVED_PSEUDONYMS: List<String> =
        listOf("meeshy", "mee", "meo", "admin", "administrator", "moderator", "support")

    private const val RESERVED_CONTAINED_MIN = 6
    private const val IDENTITY_MIN = 3
    private const val IDENTITY_CONTAINED_MIN = 4
    private const val BASE36_CAP = 36L * 36 * 36 * 36
    private val CUPS = listOf(LeagueCup.Gold, LeagueCup.Silver, LeagueCup.Bronze)

    private fun dayNumber(dayKey: String): Long =
        GameDay.number(dayKey) ?: throw IllegalArgumentException("Clé de jour invalide : $dayKey")

    private fun addDays(dayKey: String, days: Int): String =
        GameDay.add(days, dayKey) ?: throw IllegalArgumentException("Clé de jour invalide : $dayKey")

    /** 0 pour le lundi, 6 pour le dimanche. */
    public fun weekdayIndex(dayKey: String): Int = (((dayNumber(dayKey) + 3) % 7 + 7) % 7).toInt()

    /** La clé de la semaine : le lundi local qui la commence. */
    public fun weekKey(dayKey: String): String = addDays(dayKey, -weekdayIndex(dayKey))

    /** Une semaine de ligue se place à partir de [FIRST_WEEK], jamais avant. */
    public fun isWeekPlaceable(weekKey: String): Boolean = dayNumber(weekKey) >= dayNumber(FIRST_WEEK)

    /** Le dimanche 20 h local de la semaine. */
    public fun weekClose(weekKey: String): LeagueMoment = LeagueMoment(addDays(weekKey, CLOSE_WEEKDAY), CLOSE_MINUTE)

    /** La semaine à laquelle un moment appartient : passé la fermeture, c'est la suivante. */
    public fun weekOfMoment(moment: LeagueMoment): String {
        val week = weekKey(moment.dayKey)
        val closed = weekdayIndex(moment.dayKey) == CLOSE_WEEKDAY && moment.minuteOfDay >= CLOSE_MINUTE
        return if (closed) addDays(week, 7) else week
    }

    /** La prochaine fermeture, toujours STRICTEMENT après le moment. */
    public fun nextWeekClose(moment: LeagueMoment): LeagueMoment = weekClose(weekOfMoment(moment))

    /** `true` quand le moment est à la fermeture de la semaine ou après. */
    public fun isWeekClosed(weekKey: String, moment: LeagueMoment): Boolean = weekOfMoment(moment) > weekKey

    /** Les points de la semaine : la somme des gains dont le moment tombe dans la semaine ; un débit ne retire rien. */
    public fun weekPoints(weekKey: String, gains: List<LeagueGain>): Int =
        gains.filter { weekOfMoment(it.moment) == weekKey }.sumOf { maxOf(0, it.points) }

    /** Qui peut jouer la ligue PUBLIQUE : niveau record, majorité vérifiée (fail-closed), puis consentement. */
    public fun access(levelRecord: Int, adultVerified: Boolean, consented: Boolean): LeagueAccess = when {
        levelRecord < MIN_LEVEL -> LeagueAccess.Locked
        !adultVerified -> LeagueAccess.Minor
        consented -> LeagueAccess.Open
        else -> LeagueAccess.ConsentRequired
    }

    private val pseudonymShape = Regex("^[\\p{L}\\p{N}][\\p{L}\\p{N}._-]*$")
    private val onlyDigits = Regex("^\\p{N}+$")
    private val wwwPrefix = Regex("^www\\.", RegexOption.IGNORE_CASE)
    private val domainSuffix = Regex("\\.(com|net|org|me|fr|io|app)$", RegexOption.IGNORE_CASE)

    /** 3 à 20 caractères, lettres de toute langue, chiffres, `.` `-` `_`, ni un nombre ni une adresse. */
    public fun isValidPseudonym(value: String): Boolean {
        val length = value.codePointCount(0, value.length)
        if (length < PSEUDONYM_MIN || length > PSEUDONYM_MAX) return false
        if (!pseudonymShape.matches(value)) return false
        if (onlyDigits.matches(value)) return false
        return !wwwPrefix.containsMatchIn(value) && !domainSuffix.containsMatchIn(value)
    }

    /** Le pseudonyme de départ : un colibri et quatre signes tirés du nombre aléatoire [draw] de la passerelle. */
    public fun pseudonymFromDraw(draw: Long): String =
        "Colibri-" + (Math.abs(draw) % BASE36_CAP).toString(36).padStart(4, '0')

    /** Ce que la ligue publique montre d'un joueur : son pseudonyme gardé, jamais son nom. */
    public fun displayName(pseudonym: String?): String? = pseudonym?.takeIf(::isValidPseudonym)

    private val combiningMarks = Regex("\\p{M}")

    private fun fold(value: String): String =
        Normalizer.normalize(value, Normalizer.Form.NFKD)
            .replace(combiningMarks, "")
            .lowercase(Locale.ROOT)
            .filter { it != '.' && it != '_' && it != '-' }

    public fun checkPseudonym(value: String, forbidden: List<String>): LeaguePseudonymCheck {
        if (!isValidPseudonym(value)) return LeaguePseudonymCheck.Refused(LeaguePseudonymCheck.Reason.Shape)
        val folded = fold(value)
        val reserved = RESERVED_PSEUDONYMS.any { name ->
            folded == name || (name.length >= RESERVED_CONTAINED_MIN && folded.contains(name))
        }
        if (reserved) return LeaguePseudonymCheck.Refused(LeaguePseudonymCheck.Reason.Reserved)
        val identity = forbidden.map(::fold).filter { it.length >= IDENTITY_MIN }
            .any { name -> folded == name || (name.length >= IDENTITY_CONTAINED_MIN && folded.contains(name)) }
        return if (identity) LeaguePseudonymCheck.Refused(LeaguePseudonymCheck.Reason.Identity) else LeaguePseudonymCheck.Ok
    }

    /** Le jour de l'instantané que les autres membres voient ; avant 4 h, c'est celui de la veille. */
    public fun snapshotDay(moment: LeagueMoment): String =
        if (moment.minuteOfDay >= SNAPSHOT_MINUTE) moment.dayKey else addDays(moment.dayKey, -1)

    public fun visibility(board: LeagueBoard, viewerIsMember: Boolean): LeagueMemberVisibility = when {
        !viewerIsMember -> LeagueMemberVisibility(pseudonym = false, realIdentity = false)
        board == LeagueBoard.Public -> LeagueMemberVisibility(pseudonym = true, realIdentity = false)
        else -> LeagueMemberVisibility(pseudonym = false, realIdentity = true)
    }

    private fun tieHash(seed: String, userId: String): Long = GameSeed.fnv1a("$seed|$userId").toLong()

    private fun <T> byDescendingThenHash(userId: (T) -> String, measure: (T) -> Int, seed: String): Comparator<T> =
        Comparator { a, b ->
            val delta = measure(b).toLong() - measure(a).toLong()
            if (delta != 0L) return@Comparator delta.compareTo(0L)
            val hash = tieHash(seed, userId(a)) - tieHash(seed, userId(b))
            if (hash != 0L) hash.compareTo(0L) else userId(a).compareTo(userId(b))
        }

    /** Les inscrits en groupes de 30 au plus, par tranches continues de tailles égales à un près (31 → 16 et 15). */
    public fun partition(weekKey: String, league: LeagueKey, entrants: List<LeagueEntrant>): List<LeagueGroup> {
        val seed = "$weekKey|${wire(league)}"
        val latest = LinkedHashMap<String, LeagueEntrant>()
        entrants.forEach { latest[it.userId] = it }
        val ranked = latest.values.sortedWith(byDescendingThenHash({ it.userId }, { it.activity }, seed))
        if (ranked.isEmpty()) return emptyList()
        val groupCount = (ranked.size + GROUP_SIZE - 1) / GROUP_SIZE
        val base = ranked.size / groupCount
        val extra = ranked.size % groupCount
        return (0 until groupCount).map { index ->
            val start = index * base + minOf(index, extra)
            val size = base + if (index < extra) 1 else 0
            LeagueGroup(
                groupId = "$weekKey:${wire(league)}:${index + 1}",
                league = league,
                weekKey = weekKey,
                memberIds = ranked.subList(start, start + size).map { it.userId },
            )
        }
    }

    /** Le classement d'un groupe : 7 montent, 5 descendent (la moitié du groupe au plus), 3 coupes ; zéro point = rien. */
    public fun standings(groupId: String, league: LeagueKey, members: List<LeagueMemberPoints>): List<LeagueStanding> {
        val ranked = members.sortedWith(byDescendingThenHash({ it.userId }, { it.weekPoints }, groupId))
        val half = ranked.size / 2
        val promoted = if (league.next == null) 0 else minOf(PROMOTED, half)
        val relegated = if (league.previous == null) 0 else minOf(RELEGATED, half)
        return ranked.mapIndexed { index, member ->
            val points = maxOf(0, member.weekPoints)
            val earned = points > 0
            val zone = when {
                index < promoted && earned -> LeagueZone.Promotion
                index >= ranked.size - relegated -> LeagueZone.Relegation
                else -> LeagueZone.Safe
            }
            LeagueStanding(member.userId, points, index + 1, zone, if (earned && index < CUP_COUNT) CUPS[index] else null)
        }
    }

    /** Les points qui manquent pour entrer en zone de montée : 0 si on y est, `null` au sommet ou sans zone. */
    public fun pointsToPromotion(league: LeagueKey, standings: List<LeagueStanding>, userId: String): Int? {
        if (league.next == null) return null
        val mine = standings.firstOrNull { it.userId == userId } ?: return null
        if (mine.zone == LeagueZone.Promotion) return 0
        val lastPromoted = standings.lastOrNull { it.zone == LeagueZone.Promotion }
        val bar = if (lastPromoted == null) 1 else lastPromoted.weekPoints + 1
        return maxOf(0, bar - mine.weekPoints)
    }

    /** Le règlement d'un groupe à la fermeture : où chacun joue la semaine suivante, et sa Gloire. */
    public fun settle(groupId: String, league: LeagueKey, members: List<LeagueMemberPoints>): List<SettledLeagueMember> =
        standings(groupId, league, members).map { standing ->
            val promoted = standing.zone == LeagueZone.Promotion
            val relegated = standing.zone == LeagueZone.Relegation
            val destination = when {
                promoted -> league.next
                relegated -> league.previous
                else -> null
            }
            val glory = (if (promoted) GloryLaws.POINTS_LEAGUE_UP else 0) +
                (if (standing.cup == null) 0 else GloryLaws.POINTS_LEAGUE_CUP)
            SettledLeagueMember(standing, LeagueOutcome(destination ?: league, promoted, relegated, glory))
        }

    /** La ligue Amis : le MÊME classement, restreint au joueur et à ses amis ACCEPTÉS. Ni montée ni descente. */
    public fun friendsRanking(
        weekKey: String,
        viewerId: String,
        friendIds: List<String>,
        weekPoints: Map<String, Int>,
    ): List<FriendsLeagueEntry> {
        val entries = (listOf(viewerId) + friendIds).distinct()
            .map { LeagueMemberPoints(it, maxOf(0, weekPoints[it] ?: 0)) }
        return entries.sortedWith(byDescendingThenHash({ it.userId }, { it.weekPoints }, "$weekKey|friends"))
            .mapIndexed { index, e -> FriendsLeagueEntry(e.userId, e.weekPoints, index + 1, e.userId == viewerId) }
    }

    /** La clé de fil d'une ligue (`quartz`...`prisme`). */
    public fun wire(league: LeagueKey): String = league.name.lowercase(Locale.ROOT)
}
