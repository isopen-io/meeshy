package me.meeshy.sdk.model.game

/**
 * **Le niveau et le rang d'un AUTRE membre, posés sur sa bannière** (miroir de `GameBannerBadgeModel`, iOS #10093,
 * #10231). Rien d'autre ne voyage : ni trésor, ni vitrine, ni Flamme — le type ne PORTE pas la Flamme, aucune vue ne peut la
 * peindre par mégarde. Les étincelles et la Gloire ne sont servies qu'à soi et aux amis (#9541) : absentes, rien ne se
 * dessine à leur place. Le client ne fabrique jamais ce que le serveur retient.
 */
public data class GameBannerBadge(
    val userId: String,
    val level: Int,
    val tier: LevelTierKey,
    val prestige: Int,
    val rank: GloryRank,
    val division5: Int?,
    val mythic: MythicSeatRef?,
    /** La poche d'étincelles : `sparks` servi, sinon `points` (même nombre devant un serveur antérieur). */
    val pocket: Int?,
    /** La Gloire totale, `null` quand elle n'est pas servie à ce lecteur, ou nulle. */
    val glory: Int?,
    /** Le record de niveau, qui survit au prestige — jamais sous le niveau montré. */
    val levelMax: Int,
) {
    /**
     * Le cercle se remplit de la POCHE, base du niveau. Quand elle ne porte pas le niveau servi (retenu par une étape, borné
     * par le rang, ou un serveur antérieur), il reste PLEIN plutôt que de mentir.
     */
    val levelProgress: Double
        get() {
            val held = pocket?.toLong() ?: return 1.0
            return if (GameLevels.levelForScore(held, cap = null) == level) GameLevels.progress(held, cap = null).progress else 1.0
        }

    /** Le nom du rang et sa division V–I ; le Mythe dit sa PLACE quand le serveur la sert. */
    val rankLabel: GameText
        get() {
            mythic?.let { return GameCopyLaws.mythicSeat(it.number) }
            val name = GameCopyLaws.rankName(rank)
            val roman = division5?.let { ROMAN.getOrNull(it - 1) } ?: return name
            return GameText(GameTextKey.JoinedBySpace, listOf(GameTextArg.Nested(name), GameTextArg.Verbatim(roman)))
        }

    public companion object {
        private val ROMAN = listOf("I", "II", "III", "IV", "V")

        /** `null` quand le serveur ne sert pas le niveau et le rang : un refus, un compte inconnu, ou le seul trésor. */
        public fun of(response: UserGameProfileResponse?, userId: String): GameBannerBadge? {
            val standing = response?.takeIf { it.visible }?.standing ?: return null
            val shown = standing.shownLevel
            return GameBannerBadge(
                userId = userId,
                level = shown,
                tier = standing.shownTier,
                prestige = standing.prestige,
                rank = standing.rank,
                division5 = standing.shownDivision,
                mythic = standing.mythic,
                pocket = standing.sparks ?: standing.points,
                glory = standing.glory?.takeIf { it > 0 },
                levelMax = maxOf(standing.levelMaxLifetime ?: standing.ladder?.levelMaxLifetime ?: shown, shown),
            )
        }

        /** Ce qui se peint pour [userId] : rien sous « Jeu masqué », rien d'un autre membre. */
        public fun shown(badge: GameBannerBadge?, userId: String, hidden: Boolean): GameBannerBadge? =
            badge?.takeIf { !hidden && it.userId == userId }
    }
}
