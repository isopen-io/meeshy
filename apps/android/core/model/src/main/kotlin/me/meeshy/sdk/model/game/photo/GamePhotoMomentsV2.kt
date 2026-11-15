package me.meeshy.sdk.model.game.photo

import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GamePhotoAlerts
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.LeagueKey
import me.meeshy.sdk.model.game.LevelTierKey
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.TreasuryTierKey
import me.meeshy.sdk.model.game.guide.GameGuideEventsV2
import me.meeshy.sdk.model.game.guide.GuideEventV2

/*
 * LES MOMENTS QUI SORTENT DES SEPT PISTES (#9387, #9384, #9386, #9389, #10168, #10816) — miroir de
 * `packages/shared/utils/game/photo-moments.ts` et de `GamePhotoMomentsV2` (SDK Swift), rejoué sur la loi `photo-moment`
 * de `game.vectors.json` : trophée, montée de ligue, saison terminée, Prestige numéroté, réalisation du jour, haut fait,
 * fin de mission personnelle. La loi dit QUEL emblème et QUELLE identité ; l'identité fait qu'un « plus tard » puis un
 * retour ne propose jamais deux fois la même photo.
 *
 * Ne se photographient pas : une première ligue, une descente, une saison inachevée, un simple tampon d'Atlas.
 */

/** L'emblème d'un moment de la vague 2, avec l'identité qu'il porte (`photoMomentId`). */
public sealed interface PhotoMomentEmblemV2 {
    public val id: String

    public data class Trophy(val trophyKey: String) : PhotoMomentEmblemV2 {
        override val id: String get() = "trophy:$trophyKey"
    }

    public data class LeagueUp(val league: LeagueKey, val weekKey: String) : PhotoMomentEmblemV2 {
        override val id: String get() = "league-up:$weekKey:${league.name.lowercase()}"
    }

    public data class Season(val season: Int) : PhotoMomentEmblemV2 {
        override val id: String get() = "season:$season"
    }

    public data class Prestige(val number: Int) : PhotoMomentEmblemV2 {
        override val id: String get() = "prestige:$number"
    }
}

/** Un argument d'une ligne, dit à l'affichage dans la langue de l'interface. */
public sealed interface PhotoLineArg {
    public data class Count(val value: Int) : PhotoLineArg
    public data class Rank(val rank: GloryRank, val division: Int?) : PhotoLineArg
    public data class Tier(val tier: LevelTierKey) : PhotoLineArg
    public data class Treasury(val tier: TreasuryTierKey) : PhotoLineArg
    public data class League(val league: LeagueKey) : PhotoLineArg
    public data class Edition(val edition: MeeshEdition) : PhotoLineArg
    public data class Text(val value: String) : PhotoLineArg
}

/**
 * Une ligne d'un moment : la clé du catalogue iOS (`game.photo.kicker.rank`), ses arguments, et `times` (« ×2 » ajouté
 * à la ligne quand un palier a été atteint dans plusieurs cycles). Clé nulle : la ligne est son seul argument (le nom
 * d'un rang, d'un trésor, le titre d'un haut fait).
 */
public data class PhotoLine(val key: String?, val args: List<PhotoLineArg> = emptyList(), val times: Int? = null)

/** Les deux lignes d'un moment : « Nouveau rang » au-dessus, « Voix II » en fort. */
public data class PhotoMomentLines(val kicker: PhotoLine, val title: PhotoLine)

public object GamePhotoMomentsV2 {

    public fun emblem(event: GuideEventV2): PhotoMomentEmblemV2? = when (event) {
        is GuideEventV2.Trophy -> PhotoMomentEmblemV2.Trophy(event.trophyKey)
        is GuideEventV2.LeaguePromoted -> PhotoMomentEmblemV2.LeagueUp(event.to, event.weekKey)
        is GuideEventV2.SeasonEnd -> if (event.completed) PhotoMomentEmblemV2.Season(event.season) else null
        is GuideEventV2.Prestige -> PhotoMomentEmblemV2.Prestige(event.prestige)
        is GuideEventV2.LeagueFirst, is GuideEventV2.LeagueRelegated, is GuideEventV2.SeasonStart, is GuideEventV2.AtlasStamp -> null
    }

    /** Les moments de la vague 2 qu'une transition confirmée vient de produire. */
    public fun ofTransition(before: GameBlock, after: GameBlock): List<PhotoMomentEmblemV2> =
        GameGuideEventsV2.transition(before, after).mapNotNull(::emblem)

    /** Le haut fait révélé : `achievement:<clé>` (déjà préfixée ou non) ; la rareté n'entre jamais dans l'identité. */
    public fun achievementId(key: String): String = if (key.startsWith("achievement:")) key else "achievement:$key"

    /** La mission personnelle accomplie : une identité par mission. */
    public fun missionId(id: String): String = "mission:$id"

    public fun dayId(dayKey: String): String? = GamePhotoAlerts.dayMomentId(dayKey)

    /** Les deux lignes d'un moment de la vague 2 (clés du catalogue iOS `game2.photo.*`, `game.photo.*`). */
    public fun lines(emblem: PhotoMomentEmblemV2): PhotoMomentLines = when (emblem) {
        is PhotoMomentEmblemV2.Trophy -> PhotoMomentLines(
            PhotoLine("game2.photo.kicker.trophy"),
            PhotoLine(null, listOf(PhotoLineArg.Text(emblem.trophyKey))),
        )
        is PhotoMomentEmblemV2.LeagueUp -> PhotoMomentLines(
            PhotoLine("game2.photo.kicker.league_up"),
            PhotoLine("game2.photo.title.league_up", listOf(PhotoLineArg.League(emblem.league))),
        )
        is PhotoMomentEmblemV2.Season -> PhotoMomentLines(
            PhotoLine("game2.photo.kicker.season"),
            PhotoLine("game2.door.season", listOf(PhotoLineArg.Count(emblem.season))),
        )
        is PhotoMomentEmblemV2.Prestige -> PhotoMomentLines(
            PhotoLine("game2.photo.kicker.prestige"),
            PhotoLine("game.photo.title.prestige", listOf(PhotoLineArg.Count(emblem.number))),
        )
    }

    public fun achievementLines(title: String): PhotoMomentLines =
        PhotoMomentLines(PhotoLine("game.photo.kicker.achievement"), PhotoLine(null, listOf(PhotoLineArg.Text(title))))

    public fun missionLines(title: String): PhotoMomentLines =
        PhotoMomentLines(PhotoLine("game.photo.kicker.mission"), PhotoLine(null, listOf(PhotoLineArg.Text(title))))
}
