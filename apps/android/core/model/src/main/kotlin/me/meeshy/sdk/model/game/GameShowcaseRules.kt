package me.meeshy.sdk.model.game

/**
 * L'ordre d'une vitrine et son rangement — purs. Miroir de `GameShowcaseRules` (iOS, `GameShowcaseRules.swift`).
 */
public object GameShowcaseRules {

    /**
     * L'ordre PARCOURU : les clés rangées qui existent, puis tout ce que l'ordre ne cite pas, dans l'ordre servi.
     * C'est `trophies.order`, calculé par la loi, que l'écran parcourt sans le recalculer.
     */
    public fun shelfOrder(trophies: GameTrophiesBlock): List<String> {
        val owned = trophies.items.map { it.key }.toSet()
        val ordered = trophies.order.filter { it in owned }.distinct()
        val placed = ordered.toSet()
        return ordered + trophies.items.map { it.key }.filter { it !in placed }
    }

    /** Monter ou descendre d'un cran ; la même suite quand le geste n'a pas de sens (bord de la vitrine). */
    public fun moved(order: List<String>, index: Int, delta: Int): List<String> {
        val target = index + delta
        if (index !in order.indices || target !in order.indices) return order
        return order.toMutableList().also { it[index] = order[target]; it[target] = order[index] }
    }
}

/**
 * LE JEU D'UN AUTRE (#9481, #9387) — ce que SA visibilité autorise, rien sinon. Le serveur décide (`visible`) ;
 * quand il ferme la vitrine à ce lecteur, l'écran ne dit PAS qu'elle existe : il ne dessine rien. Seul le MOIS
 * d'obtention est servi. Les clés d'une version plus récente ne se montrent pas : on ne nomme pas ce qu'on ne
 * comprend pas.
 */
public object GameVisitorShowcase {

    public data class Entry(val key: String, val awardedMonth: String, val count: Int?, val spec: TrophySpec)

    public fun entries(showcase: UserShowcaseResponse?): List<Entry> {
        if (showcase == null || !showcase.visible) return emptyList()
        val items = LinkedHashMap<String, GameVisitorTrophyItem>()
        showcase.items.forEach { items.putIfAbsent(it.key, it) }
        val ordered = (showcase.order + showcase.items.map { it.key }).filter { it in items }.distinct()
        return ordered.mapNotNull { key ->
            val spec = GameTrophies.parse(key) ?: return@mapNotNull null
            val item = items.getValue(key)
            Entry(key = key, awardedMonth = item.awardedMonth, count = item.count, spec = spec)
        }
    }
}
