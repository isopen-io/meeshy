package me.meeshy.sdk.model.game

import me.meeshy.sdk.model.game.progression.ProgressionConcept

/**
 * **Le bandeau du joueur** (#9494, #9536, #18230) — ce que le bandeau du haut montre quand ni un appel ni un audio ne
 * l'occupe. MIROIR de `GamePlayerBanner` iOS (`packages/MeeshySDK/.../Game/GamePlayerBanner.swift`) et de
 * `playerBannerModel` web (`apps/web/src/lib/view/player-banner.ts`), rejoué sur les cas des témoins iOS.
 *
 * SEULEMENT CE QUI EXISTE : un morceau sans donnée vaut `null` et ne se dessine pas — jamais un zéro, un tiret ou une
 * case vide. Un joueur qui n'a rien fait n'a PAS de bandeau ([make] rend `null`). Le modèle ne calcule aucune règle :
 * il LIT le bloc `game` servi (le cache d'abord) et choisit ce qui se montre.
 */
public data class GamePlayerBanner(
    val level: Int,
    val tier: LevelTierKey,
    /** La part parcourue vers le niveau suivant ; la jauge lit [boundedProgress]. */
    val progress: Double,
    val prestige: Int = 0,
    /** La poche d'étincelles (#10846), jamais le cycle. */
    val score: Long,
    /** `null` au plafond : plus rien ne manque. */
    val nextLevel: Int?,
    val pointsToNext: Long?,
    /** Le plafond où le niveau s'est arrêté (499 ou 1000) — `null` quand rien ne bloque (#9688). */
    val levelCap: Int? = null,
    val meeshes: Int? = null,
    val rank: Rank? = null,
    val league: League? = null,
    val flame: Flame? = null,
    val trophies: Int? = null,
    val dailyMission: DailyMission? = null,
    val season: Season? = null,
    /** Le contenant de l'Héritage (#17437) — `null` sans Meesh gardée. */
    val treasury: TreasuryTierKey? = null,
    /** L'Offrande prête et la Flamme à risque (#17796) : un signal posé sur ce que le bandeau montre déjà. */
    val attention: GameAttention = GameAttention.None,
) {
    public data class Rank(
        val rank: GloryRank,
        /** V (5) à I (1) — `null` pour Mythe. */
        val division: Int?,
        val mythic: MythicSeatRef? = null,
        val glory: Int = 0,
        val progress: Double = 0.0,
        val gloryMissing: Int? = null,
        /** `null` au sommet de l'échelle et pour le Mythe. */
        val next: GloryStep? = null,
    ) {
        val boundedProgress: Double get() = GamePlayerBanner.bounded(progress)
    }

    public data class League(val league: LeagueKey, val place: Int)

    public data class Flame(val form: FlameFormKey, val days: Int)

    public data class DailyMission(val done: Int, val total: Int)

    public data class Season(val number: Int)

    /**
     * Une pièce du bandeau — chacune est SON bouton vers SA fiche (#10846). L'Offrande prête (#18199) s'ouvre sur place ;
     * sa fiche reste celle du Rêve, qui la fait naître.
     */
    public enum class Piece(public val concept: ProgressionConcept) {
        Level(ProgressionConcept.Level),
        Sparks(ProgressionConcept.Points),
        Meesh(ProgressionConcept.Meesh),
        Rank(ProgressionConcept.Glory),
        League(ProgressionConcept.League),
        Flame(ProgressionConcept.Flame),
        Trophies(ProgressionConcept.Showcase),
        Mission(ProgressionConcept.Missions),
        Offering(ProgressionConcept.Missions),
        Season(ProgressionConcept.Season),
        Treasury(ProgressionConcept.Meesh),
    }

    val boundedProgress: Double get() = bounded(progress)

    /** Le pourcentage entier, arrondi vers le bas — « 78 % vers le 35 » ne promet jamais plus que la jauge. */
    val percent: Int get() = kotlin.math.floor(boundedProgress * 100).toInt()

    /** Le détail du niveau n'a de sens qu'au-delà du niveau 1 — ou après un Prestige, qui en garde les étoiles. */
    val showsLevel: Boolean get() = level > 1 || prestige > 0

    /** Le total n'a de sens qu'une fois le premier point gagné. */
    val showsScore: Boolean get() = score > 0

    /**
     * Au moins un morceau a quelque chose à dire. La mission du jour et la saison existent pour tout compte : elles
     * accompagnent un bandeau, elles n'en font jamais naître un (#9536).
     */
    val hasAnythingToSay: Boolean
        get() = showsLevel || showsScore || meeshes != null || rank != null || league != null || flame != null ||
            trophies != null

    /** Les pièces qui existent, dans l'ordre du bandeau : le rang en tête (#17394, #19705), puis le niveau. */
    val pieces: List<Piece>
        get() = listOfNotNull(
            Piece.Rank.takeIf { rank != null },
            Piece.Level.takeIf { showsLevel },
            Piece.Sparks.takeIf { showsScore },
            Piece.Meesh.takeIf { meeshes != null },
            Piece.League.takeIf { league != null },
            Piece.Flame.takeIf { flame != null },
            Piece.Trophies.takeIf { trophies != null },
            Piece.Mission.takeIf { dailyMission != null },
            Piece.Offering.takeIf { attention.chestReady },
            Piece.Treasury.takeIf { treasury != null },
            Piece.Season.takeIf { season != null },
        )

    public companion object {
        private val burning = setOf(FlameStatus.Lit, FlameStatus.AtRisk, FlameStatus.Covered)

        /** LA décision : le bandeau, ou `null` quand rien n'a de sens à dire. */
        public fun make(game: GameBlock): GamePlayerBanner? = of(game).takeIf { it.hasAnythingToSay }

        /** Le bandeau lu du bloc servi, qu'il ait ou non quelque chose à dire. */
        public fun of(game: GameBlock): GamePlayerBanner {
            val shown = game.level.shown
            val atTop = shown.nextThreshold == null
            val held = game.treasury.held
            return GamePlayerBanner(
                level = shown.level,
                tier = shown.tier,
                progress = if (atTop) 1.0 else bounded(shown.progress),
                prestige = game.level.prestige,
                score = maxOf(0L, game.level.sparks ?: game.level.score),
                nextLevel = if (atTop) null else shown.level + 1,
                pointsToNext = if (atTop) null else shown.pointsToNext,
                levelCap = if (shown.isMax) shown.cap else null,
                meeshes = held.takeIf { it > 0 },
                rank = rankOf(game.glory),
                league = leagueOf(game.league),
                flame = flameOf(game.flame),
                trophies = game.trophies?.items?.size?.takeIf { it > 0 },
                dailyMission = game.missions.takeIf { it.unlocked && it.items.isNotEmpty() }
                    ?.let { missions -> DailyMission(done = missions.items.count { it.isCompleted }, total = missions.items.size) },
                season = game.season?.let { Season(it.number) },
                treasury = if (held > 0) game.treasury.tier else null,
                attention = GameAttention.of(game, hidden = false),
            )
        }

        private fun rankOf(glory: GameGlory): Rank? {
            if (glory.glory <= 0) return null
            return Rank(
                rank = glory.rank,
                division = glory.shownDivision,
                mythic = glory.mythicSeat,
                glory = glory.glory,
                progress = if (glory.next == null) 1.0 else bounded(glory.progress),
                gloryMissing = glory.gloryMissing,
                next = glory.next,
            )
        }

        private fun leagueOf(league: GameLeagueBlock?): League? {
            val current = league?.current ?: return null
            if (league.access != LeagueAccess.Open) return null
            return League(league = current.league, place = current.rank)
        }

        private fun flameOf(flame: GameFlame): Flame? {
            val form = flame.form ?: return null
            if (flame.status !in burning || flame.days <= 0) return null
            return Flame(form = form, days = flame.days)
        }

        /** Un `NaN` ou une valeur hors de [0, 1] ne casse jamais la jauge. */
        internal fun bounded(value: Double): Double = if (value.isFinite()) value.coerceIn(0.0, 1.0) else 0.0
    }
}
