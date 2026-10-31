package me.meeshy.sdk.model.game.guide

import me.meeshy.sdk.model.game.LeagueKey
import me.meeshy.sdk.model.game.rules.GuideMood
import me.meeshy.sdk.model.game.rules.GuideSpeaker

/** Le bouton d'un moment de la vague 2 (iOS `GuideActionV2`) : une page du jeu, et « voir le niveau » du Prestige. */
public enum class GuideActionV2(public val wire: String) {
    SeeLeague("see-league"),
    SeeSeason("see-season"),
    SeeTrophies("see-trophies"),
    SeeAtlas("see-atlas"),
    SeeLevel("see-level"),
}

public enum class GuideMomentKeyV2(public val wire: String) {
    LeagueFirst("league-first"),
    LeaguePromoted("league-promoted"),
    LeagueRelegated("league-relegated"),
    SeasonStart("season-start"),
    SeasonEnd("season-end"),
    Trophy("trophy"),
    Prestige("prestige"),
    AtlasStamp("atlas-stamp"),
}

/** Ce qui vient d'arriver dans la vague 2 — ligue, saison, trophée, Prestige, Atlas (iOS `GuideEventV2`). */
public sealed interface GuideEventV2 {
    public val key: GuideMomentKeyV2

    public data class LeagueFirst(val league: LeagueKey, val pointsToPromotion: Int?) : GuideEventV2 {
        override val key: GuideMomentKeyV2 get() = GuideMomentKeyV2.LeagueFirst
    }

    public data class LeaguePromoted(val from: LeagueKey, val to: LeagueKey, val rank: Int, val weekKey: String) : GuideEventV2 {
        override val key: GuideMomentKeyV2 get() = GuideMomentKeyV2.LeaguePromoted
    }

    public data class LeagueRelegated(val from: LeagueKey, val to: LeagueKey, val pointsToPromotion: Int?, val weekKey: String) : GuideEventV2 {
        override val key: GuideMomentKeyV2 get() = GuideMomentKeyV2.LeagueRelegated
    }

    public data class SeasonStart(val season: Int, val themeKey: String, val steps: Int) : GuideEventV2 {
        override val key: GuideMomentKeyV2 get() = GuideMomentKeyV2.SeasonStart
    }

    public data class SeasonEnd(val season: Int, val stepsReached: Int, val completed: Boolean, val gloryGained: Int) : GuideEventV2 {
        override val key: GuideMomentKeyV2 get() = GuideMomentKeyV2.SeasonEnd
    }

    public data class Trophy(val trophyKey: String) : GuideEventV2 {
        override val key: GuideMomentKeyV2 get() = GuideMomentKeyV2.Trophy
    }

    public data class Prestige(val prestige: Int, val gloryGained: Int) : GuideEventV2 {
        override val key: GuideMomentKeyV2 get() = GuideMomentKeyV2.Prestige
    }

    public data class AtlasStamp(val language: String, val stamped: Int, val total: Int) : GuideEventV2 {
        override val key: GuideMomentKeyV2 get() = GuideMomentKeyV2.AtlasStamp
    }
}

public data class GuideMomentV2(
    val key: GuideMomentKeyV2,
    val speaker: GuideSpeaker,
    val mood: GuideMood,
    val event: GuideEventV2,
    val action: GuideActionV2,
    val presentation: GuidePresentation,
)

/** Un événement parmi les vingt et un moments : les douze d'origine ou les huit de la vague 2. */
public sealed interface GuideAnyEvent {
    public val wire: String

    public data class Original(val event: GuideEvent) : GuideAnyEvent {
        override val wire: String get() = event.key.wire
    }

    public data class Wave2(val event: GuideEventV2) : GuideAnyEvent {
        override val wire: String get() = event.key.wire
    }
}

public sealed interface GuideAnyMoment {
    public data class Original(val moment: GuideMoment) : GuideAnyMoment
    public data class Wave2(val moment: GuideMomentV2) : GuideAnyMoment
}

/**
 * LES MOMENTS DE LA VAGUE 2 (iOS `GameGuideV2`, miroir de `packages/shared/utils/game/guide-v2.ts`) et le choix d'UNE
 * carte parmi les vingt et un moments.
 */
public object GameGuideV2 {

    private data class Persona(val speaker: GuideSpeaker, val mood: GuideMood, val action: GuideActionV2)

    private fun persona(event: GuideEventV2): Persona = when (event) {
        is GuideEventV2.LeagueFirst -> Persona(GuideSpeaker.Mee, GuideMood.Guide, GuideActionV2.SeeLeague)
        is GuideEventV2.LeaguePromoted -> Persona(GuideSpeaker.Mee, GuideMood.Cheer, GuideActionV2.SeeLeague)
        is GuideEventV2.LeagueRelegated -> Persona(GuideSpeaker.Meo, GuideMood.Calm, GuideActionV2.SeeLeague)
        is GuideEventV2.SeasonStart -> Persona(GuideSpeaker.Duo, GuideMood.Cheer, GuideActionV2.SeeSeason)
        is GuideEventV2.SeasonEnd ->
            Persona(GuideSpeaker.Duo, if (event.completed) GuideMood.Proud else GuideMood.Calm, GuideActionV2.SeeSeason)
        is GuideEventV2.Trophy -> Persona(GuideSpeaker.Duo, GuideMood.Proud, GuideActionV2.SeeTrophies)
        is GuideEventV2.Prestige -> Persona(GuideSpeaker.Duo, GuideMood.Proud, GuideActionV2.SeeLevel)
        is GuideEventV2.AtlasStamp -> Persona(GuideSpeaker.Mee, GuideMood.Cheer, GuideActionV2.SeeAtlas)
    }

    public fun moment(event: GuideEventV2, seen: Set<String>): GuideMomentV2 {
        val voice = persona(event)
        val presentation = if (event.key.wire in seen) GuidePresentation.Short else GuidePresentation.Full
        return GuideMomentV2(event.key, voice.speaker, voice.mood, event, voice.action, presentation)
    }

    /**
     * Du plus important au moins important, sur les vingt et un moments. L'ordre relatif des douze d'origine est
     * celui de `GameGuide.momentPriority` : sans événement nouveau, le choix est exactement celui de la vague 1.
     */
    public val momentPriority: List<String> = listOf(
        "new-rank", "prestige", "trophy", "level-100", "first-mint", "season-end", "flame-out", "flame-at-risk",
        "league-promoted", "league-relegated", "new-tier", "season-start", "treasury-tier", "badge-extinguished",
        "price-rises", "atlas-stamp", "league-first", "first-mint-possible", "missions-unlocked", "first-level",
        "return-after-absence",
    )

    /** UNE carte par ouverture : le plus important, un moment encore inédit passant devant un moment déjà vu. */
    public fun chooseMoment(events: List<GuideAnyEvent>, seen: Set<String>): GuideAnyMoment? {
        val byPriority = events.sortedBy { momentPriority.indexOf(it.wire) }
        val chosen = byPriority.firstOrNull { it.wire !in seen } ?: byPriority.firstOrNull() ?: return null
        return when (chosen) {
            is GuideAnyEvent.Original -> GuideAnyMoment.Original(GameGuide.moment(chosen.event, seen))
            is GuideAnyEvent.Wave2 -> GuideAnyMoment.Wave2(moment(chosen.event, seen))
        }
    }

    /**
     * Les moments de la vague 2 qui se photographient (iOS `GamePhotoMomentsV2.emblem`) : un trophée, une montée, un
     * voyage accompli, une Renaissance. Une première ligue, une descente, une saison inachevée, un tampon, jamais.
     */
    public fun isPhotoMoment(event: GuideEventV2): Boolean = when (event) {
        is GuideEventV2.Trophy, is GuideEventV2.LeaguePromoted, is GuideEventV2.Prestige -> true
        is GuideEventV2.SeasonEnd -> event.completed
        is GuideEventV2.LeagueFirst, is GuideEventV2.LeagueRelegated, is GuideEventV2.SeasonStart,
        is GuideEventV2.AtlasStamp,
        -> false
    }
}
