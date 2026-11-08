package me.meeshy.sdk.model.game

/**
 * LES TROPHÉES ET LA VITRINE (#9387) — miroir de `packages/shared/utils/game/trophies.ts` et de `GameTrophies`
 * (`GameTrophies.swift`). Un objet reçu à un moment précis : coupe de ligue, coupe de saison, trophée de Prestige
 * (1 à 5), trophée de Flamme (100 puis 365 jours). Ni un trophée ni un succès ne rapporte de points ni de Gloire.
 *
 * Chaque trophée a une CLÉ STABLE. Un VISITEUR ne lit jamais la semaine d'une coupe (conformité D-3) : sa clé porte
 * le MOIS d'obtention. Un trophée d'un type inconnu de ce client n'est jamais retiré de la vitrine : il reste, en
 * dernier, le temps d'une mise à jour.
 */
public enum class TrophyKind(public val wire: String) {
    LeagueCup("league-cup"),
    SeasonCup("season-cup"),
    Prestige("prestige"),
    Flame("flame"),
}

/** Une coupe de ligue se date par sa SEMAINE (la clé du membre) ou par son MOIS (la seule qu'un visiteur reçoive). */
public sealed interface LeagueCupPeriod {
    public val key: String

    public data class Week(override val key: String) : LeagueCupPeriod

    public data class Month(override val key: String) : LeagueCupPeriod
}

public sealed interface TrophySpec {
    public val kind: TrophyKind

    public data class LeagueCupTrophy(
        val period: LeagueCupPeriod,
        val league: LeagueKey,
        val cup: LeagueCup,
    ) : TrophySpec {
        override val kind: TrophyKind get() = TrophyKind.LeagueCup
    }

    public data class SeasonCup(val season: Int) : TrophySpec {
        override val kind: TrophyKind get() = TrophyKind.SeasonCup
    }

    public data class Prestige(val number: Int) : TrophySpec {
        override val kind: TrophyKind get() = TrophyKind.Prestige
    }

    public data class Flame(val days: Int) : TrophySpec {
        override val kind: TrophyKind get() = TrophyKind.Flame
    }
}

/** Qui regarde la vitrine. */
public enum class ShowcaseViewer { Self, Friend, Other, Admin }

public data class TrophyRecord(
    val key: String,
    /** ISO 8601. */
    val awardedAt: String,
)

public data class VisitorShowcase(
    val items: List<GameVisitorTrophyItem>,
    val order: List<String>,
)

public object GameTrophies {
    public val flameDays: List<Int> = listOf(100, 365)
    public const val SHOWCASE_ORDER_MAX: Int = 200
    public val defaultVisibility: ShowcaseVisibility = ShowcaseVisibility.Friends

    /** L'Atlas est PRIVÉ par défaut, quel que soit le réglage de la vitrine. */
    public val atlasDefaultVisibility: ShowcaseVisibility = ShowcaseVisibility.Me

    private val monthShape = Regex("^\\d{4}-\\d{2}$")
    private val positive = Regex("^[1-9]\\d*$")

    private fun isMonthKey(value: String): Boolean =
        monthShape.matches(value) && value.substring(5).toInt() in 1..12

    private fun leagueOf(wire: String): LeagueKey? = LeagueKey.entries.firstOrNull { leagueWire(it) == wire }

    private fun cupOf(wire: String): LeagueCup? = LeagueCup.entries.firstOrNull { cupWire(it) == wire }

    public fun leagueWire(league: LeagueKey): String = league.name.lowercase()

    public fun cupWire(cup: LeagueCup): String = cup.name.lowercase()

    public fun key(spec: TrophySpec): String = when (spec) {
        is TrophySpec.LeagueCupTrophy ->
            "trophy.league-cup.${spec.period.key}.${leagueWire(spec.league)}.${cupWire(spec.cup)}"
        is TrophySpec.SeasonCup -> "trophy.season-cup.${spec.season}"
        is TrophySpec.Prestige -> "trophy.prestige.${spec.number}"
        is TrophySpec.Flame -> "trophy.flame.${spec.days}"
    }

    /** Le trophée d'une clé, `null` pour tout ce qui n'est pas une clé du catalogue. */
    public fun parse(key: String): TrophySpec? {
        val parts = key.split('.')
        if (parts.first() != "trophy" || parts.size < 2) return null
        val kind = parts[1]
        if (kind == "league-cup" && parts.size == 5) {
            val league = leagueOf(parts[3]) ?: return null
            val cup = cupOf(parts[4]) ?: return null
            return when {
                GameDay.isDayKey(parts[2]) -> TrophySpec.LeagueCupTrophy(LeagueCupPeriod.Week(parts[2]), league, cup)
                isMonthKey(parts[2]) -> TrophySpec.LeagueCupTrophy(LeagueCupPeriod.Month(parts[2]), league, cup)
                else -> null
            }
        }
        if (parts.size != 3 || !positive.matches(parts[2])) return null
        val number = parts[2].toIntOrNull() ?: return null
        return when (kind) {
            "season-cup" -> TrophySpec.SeasonCup(number)
            "prestige" -> if (number <= GameLevels.MAX_PRESTIGE) TrophySpec.Prestige(number) else null
            "flame" -> if (number in flameDays) TrophySpec.Flame(number) else null
            else -> null
        }
    }

    /** Les trophées de Flamme gagnés au franchissement du record de série. */
    public fun flameTrophiesEarned(previousLongest: Int, longest: Int): List<Int> =
        flameDays.filter { previousLongest < it && longest >= it }

    private fun defaultWeight(spec: TrophySpec?): Int = when (spec) {
        null -> 0
        is TrophySpec.Prestige -> 1000 + spec.number
        is TrophySpec.SeasonCup -> 800
        is TrophySpec.Flame -> if (spec.days == 365) 700 else 600
        is TrophySpec.LeagueCupTrophy -> when (spec.cup) {
            LeagueCup.Gold -> 500
            LeagueCup.Silver -> 400
            LeagueCup.Bronze -> 300
        }
    }

    /** L'ordre reçu d'un client, assaini : seulement des trophées POSSÉDÉS, uniques, bornés. */
    public fun sanitizeShowcaseOrder(order: List<String>, ownedKeys: List<String>): List<String> {
        val owned = ownedKeys.toSet()
        return order.filter { it in owned }.distinct().take(SHOWCASE_ORDER_MAX)
    }

    /**
     * La vitrine, dans l'ordre : d'abord ce que le joueur a rangé, puis le reste du plus précieux au moins
     * précieux (le plus récent d'abord à valeur égale, la clé en dernier recours).
     */
    public fun orderShowcase(owned: List<TrophyRecord>, order: List<String>): List<String> {
        val chosen = sanitizeShowcaseOrder(order, owned.map { it.key })
        val placed = chosen.toSet()
        val rest = owned.filter { it.key !in placed }.sortedWith(
            compareByDescending<TrophyRecord> { defaultWeight(parse(it.key)) }
                .thenByDescending { it.awardedAt }
                .thenBy { it.key },
        )
        return chosen + rest.map { it.key }.distinct()
    }

    /** Qui voit la vitrine. Une valeur inconnue ne s'ouvre qu'au propriétaire et à l'administration. */
    public fun canView(visibility: String, viewer: ShowcaseViewer): Boolean = when {
        viewer == ShowcaseViewer.Self || viewer == ShowcaseViewer.Admin -> true
        visibility == "everyone" -> true
        else -> visibility == "friends" && viewer == ShowcaseViewer.Friend
    }

    public fun canView(visibility: ShowcaseVisibility, viewer: ShowcaseViewer): Boolean =
        canView(wire(visibility), viewer)

    private fun wire(visibility: ShowcaseVisibility): String = visibility.name.lowercase()

    /**
     * Le réglage de discrétion qui PLAFONNE la vitrine : un profil caché de la recherche ne la montre qu'aux amis,
     * « Jeu masqué » la ramène à « moi seul ». Une valeur inconnue vaut « moi seul ».
     */
    public fun capVisibility(visibility: String, hideProfileFromSearch: Boolean, gameHidden: Boolean): ShowcaseVisibility {
        if (gameHidden) return ShowcaseVisibility.Me
        val known = ShowcaseVisibility.entries.firstOrNull { wire(it) == visibility } ?: return ShowcaseVisibility.Me
        return if (hideProfileFromSearch && known == ShowcaseVisibility.Everyone) ShowcaseVisibility.Friends else known
    }

    public fun capVisibility(
        visibility: ShowcaseVisibility,
        hideProfileFromSearch: Boolean,
        gameHidden: Boolean,
    ): ShowcaseVisibility = capVisibility(wire(visibility), hideProfileFromSearch, gameHidden)

    private val dateShape = Regex("^\\d{4}-\\d{2}-\\d{2}")

    /** Le MOIS d'une date (`AAAA-MM`), `null` pour une date illisible : jamais le jour. */
    public fun visitorAwardedMonth(awardedAt: String): String? =
        if (dateShape.containsMatchIn(awardedAt)) awardedAt.substring(0, 7) else null

    /**
     * La clé d'un trophée telle qu'un VISITEUR la reçoit : une coupe de ligue y porte le MOIS d'obtention à la
     * place de sa semaine. `null` pour une clé que la loi ne sait pas lire, ou un mois illisible.
     */
    public fun visitorKey(key: String, awardedMonth: String): String? {
        val spec = parse(key) ?: return null
        if (!isMonthKey(awardedMonth)) return null
        return if (spec is TrophySpec.LeagueCupTrophy) {
            key(spec.copy(period = LeagueCupPeriod.Month(awardedMonth)))
        } else {
            key(spec)
        }
    }

    private data class Projected(val source: String, val key: String, val awardedMonth: String)

    /**
     * La vitrine telle qu'un VISITEUR la reçoit : des clés projetées, le mois d'obtention, rien de plus fin. Deux
     * coupes identiques du même mois se réunissent en UNE ligne qui porte `count`.
     */
    public fun visitorShowcase(owned: List<TrophyRecord>, order: List<String>): VisitorShowcase {
        val projected = owned.mapNotNull { trophy ->
            val month = visitorAwardedMonth(trophy.awardedAt) ?: return@mapNotNull null
            val key = visitorKey(trophy.key, month) ?: return@mapNotNull null
            Projected(trophy.key, key, month)
        }
        val keyOf = projected.associate { it.source to it.key }
        val ordered = orderShowcase(
            owned = projected.map { TrophyRecord(it.key, it.awardedMonth) },
            order = order.mapNotNull { keyOf[it] },
        )
        val counts = projected.groupingBy { it.key }.eachCount()
        val monthOf = projected.associate { it.key to it.awardedMonth }
        val items = ordered.mapNotNull { key ->
            val month = monthOf[key] ?: return@mapNotNull null
            val count = counts[key] ?: 1
            GameVisitorTrophyItem(key = key, awardedMonth = month, count = if (count > 1) count else null)
        }
        return VisitorShowcase(items = items, order = ordered)
    }
}
