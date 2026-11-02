package me.meeshy.sdk.model.game.engagement

import kotlin.math.log10

/**
 * La grammaire des succès (#5758/#5759) — MIROIR de `packages/shared/types/achievement-catalog.ts`,
 * `utils/achievement-view.ts` et de `AchievementCatalog.swift`. Trois mécanismes distincts : l'ATTEIGNABILITÉ
 * (retire un palier que le produit ne peut pas rendre vrai), l'ORDRE (`baseDifficulty + log10(palier)`) et la
 * FENÊTRE `max(7, acquis + 2)`.
 */
public data class AchievementFamily(
    val section: String,
    val subject: String,
    val verb: String,
    /** `count` (volume) ou `size` (ampleur). */
    val scale: String,
    val baseDifficulty: Double,
) {
    /** L'identité dans les tables de libellés et la carte d'atteignabilité — sans la section. */
    val id: String get() = "$subject.$verb.$scale"

    public fun key(tier: Int): String = "achievement.$section.$subject.$verb.$scale:$tier"

    val tiers: List<Int> get() = if (scale == "count") AchievementCatalog.countTiers else AchievementCatalog.sizeTiers

    public fun difficulty(tier: Int): Double = baseDifficulty + log10(tier.coerceAtLeast(1).toDouble())
}

public data class ParsedAchievementKey(val family: AchievementFamily, val tier: Int)

public data class AchievementEntry(
    val key: String,
    val section: String,
    val family: AchievementFamily,
    val tier: Int,
    val difficulty: Double,
    val unlocked: Boolean,
    val reachedAt: String?,
)

public data class AchievementSectionView(
    val section: String,
    /** Déjà tronquées à la fenêtre — la vue n'en retire aucune. */
    val entries: List<AchievementEntry>,
    val unlockedCount: Int,
    /** Le total ATTEIGNABLE, jamais le total déclaré. */
    val attainableCount: Int,
)

public object AchievementCatalog {
    public val countTiers: List<Int> = listOf(1, 10, 100, 1_000, 10_000)
    public val sizeTiers: List<Int> = listOf(10, 100, 1_000, 10_000, 100_000, 1_000_000)

    public const val WINDOW_MINIMUM: Int = 7
    public const val WINDOW_STEP: Int = 2

    private fun family(section: String, subject: String, verb: String, scale: String, difficulty: Double) =
        AchievementFamily(section, subject, verb, scale, difficulty)

    /**
     * Les familles, TOUTES sections — miroir exact du TypeScript. `decouverte` et `community.leave.count` en sont
     * ABSENTES des deux côtés (aucun stockage / rien à compter).
     */
    public val families: List<AchievementFamily> = listOf(
        family("cercles", "conversation", "join", "size", 1.0),
        family("cercles", "conversation", "join", "count", 2.0),
        family("cercles", "conversation", "leave", "count", 1.8),
        family("cercles", "conversation", "create", "count", 2.5),
        family("cercles", "community", "join", "size", 1.5),
        family("cercles", "community", "join", "count", 2.5),
        family("cercles", "community", "create", "size", 2.0),
        family("cercles", "community", "create", "count", 3.0),
        family("parole", "message", "send", "count", 0.0),
        family("parole", "voice", "send", "count", 0.8),
        family("parole", "image", "send", "count", 0.8),
        family("parole", "video", "send", "count", 1.3),
        family("retouche", "message", "edit", "count", 1.0),
        family("retouche", "message", "delete", "count", 1.0),
        family("retouche", "message", "react", "count", 0.5),
        family("appels", "call", "join", "count", 1.5),
        family("appels", "call", "start", "count", 2.0),
        family("appels", "call", "start", "size", 2.5),
        family("ambassade", "referral", "complete", "count", 2.5),
        family("ambassade", "link", "click", "count", 1.5),
        family("constance", "streak", "hold", "count", 2.0),
        family("monnaie", "meesh", "mint", "count", 3.5),
    )

    /** Une famille absente de la carte est « non mesurée » : ampleur masquée, volume visible. */
    public fun isAttainable(family: AchievementFamily, tier: Int, reach: Map<String, Int>): Boolean {
        val measured = reach[family.id] ?: return family.scale == "count"
        return tier <= measured
    }

    /**
     * L'INVERSE de [AchievementFamily.key] : `achievement.<section>.<sujet>.<geste>.<échelle>:<palier>`. Une clé
     * hors famille, ou dont le palier n'appartient pas à l'échelle, rend `null` — jamais un fait inventé.
     */
    public fun parse(key: String): ParsedAchievementKey? {
        val pieces = key.split(":")
        if (pieces.size != 2) return null
        val tier = pieces[1].toIntOrNull() ?: return null
        val path = pieces[0].split(".")
        if (path.size != 5 || path[0] != "achievement") return null
        val family = families.firstOrNull {
            it.section == path[1] && it.subject == path[2] && it.verb == path[3] && it.scale == path[4]
        } ?: return null
        return if (tier in family.tiers) ParsedAchievementKey(family, tier) else null
    }

    public fun windowSize(unlockedCount: Int): Int =
        maxOf(WINDOW_MINIMUM, unlockedCount.coerceAtLeast(0) + WINDOW_STEP)
}

/** Développe, ordonne, filtre et tronque — dans cet ordre, comme la loi partagée. */
public object AchievementResolver {

    /** [unlocked] : clé du succès → ISO 8601 de son palier gravé (ou `null` s'il est tenu sans date). */
    public fun sections(
        reach: Map<String, Int>,
        unlocked: Map<String, String?>,
        families: List<AchievementFamily> = AchievementCatalog.families,
    ): List<AchievementSectionView> {
        val entries = families
            .flatMap { family ->
                family.tiers
                    .filter { AchievementCatalog.isAttainable(family, it, reach) }
                    .map { tier ->
                        val key = family.key(tier)
                        AchievementEntry(
                            key = key,
                            section = family.section,
                            family = family,
                            tier = tier,
                            difficulty = family.difficulty(tier),
                            unlocked = unlocked.containsKey(key),
                            reachedAt = unlocked[key],
                        )
                    }
            }
            .sortedWith(compareBy<AchievementEntry> { it.difficulty }.thenBy { it.key })

        return entries.groupBy { it.section }.map { (section, all) ->
            val acquired = all.count { it.unlocked }
            AchievementSectionView(
                section = section,
                entries = all.take(AchievementCatalog.windowSize(acquired)),
                unlockedCount = acquired,
                attainableCount = all.size,
            )
        }
    }
}
