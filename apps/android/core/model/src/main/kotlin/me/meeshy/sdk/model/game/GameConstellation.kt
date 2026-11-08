package me.meeshy.sdk.model.game

/**
 * LA CONSTELLATION (#10053) — miroir de `packages/shared/utils/game/constellation.ts` et de `GameConstellation`.
 * Tous les DIX fragments d'étoile collectés, une étoile s'allume ; chacune débloque UN cosmétique de profil (halo,
 * cadre, scintillement) sans avantage de jeu. Le total est DÉRIVÉ, jamais dépensé. Clé déterministe :
 * `constellation.star-<n>.<genre>`.
 */
public enum class ConstellationCosmeticKind(public val wire: String) { Halo("halo"), Frame("frame"), Sparkle("sparkle") }

public data class ConstellationCosmetic(val star: Int, val kind: ConstellationCosmeticKind, val cosmeticKey: String)

public data class Constellation(
    val collected: Int,
    val stars: Int,
    val inStar: Int,
    val toNextStar: Int,
    val cosmetics: List<ConstellationCosmetic>,
)

public object GameConstellation {
    public const val FRAGMENTS_PER_STAR: Int = 10
    public val kinds: List<ConstellationCosmeticKind> = ConstellationCosmeticKind.entries

    /** Le cosmétique que débloque l'étoile n (n >= 1) ; `null` sinon. */
    public fun starCosmetic(star: Int): ConstellationCosmetic? {
        if (star < 1) return null
        val kind = kinds[(star - 1) % kinds.size]
        return ConstellationCosmetic(star, kind, "constellation.star-$star.${kind.wire}")
    }

    private val keyShape = Regex("^constellation\\.star-([1-9]\\d{0,5})\\.[a-z]+$")

    /** `true` pour une clé que la constellation produit : l'étoile ET son genre concordent. */
    public fun isCosmeticKey(key: String): Boolean {
        val star = keyShape.matchEntire(key)?.groupValues?.get(1)?.toIntOrNull() ?: return false
        return starCosmetic(star)?.cosmeticKey == key
    }

    public fun of(collected: Int): Constellation {
        val total = maxOf(0, collected)
        val stars = total / FRAGMENTS_PER_STAR
        val inStar = total % FRAGMENTS_PER_STAR
        return Constellation(
            collected = total,
            stars = stars,
            inStar = inStar,
            toNextStar = FRAGMENTS_PER_STAR - inStar,
            cosmetics = (1..stars).mapNotNull(::starCosmetic),
        )
    }

    /** Les cosmétiques d'un visiteur, qui ne reçoit que des étoiles. */
    public fun ofStars(stars: Int): Constellation = of(maxOf(0, stars) * FRAGMENTS_PER_STAR)
}
