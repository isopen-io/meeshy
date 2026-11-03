package me.meeshy.sdk.model.game

import me.meeshy.sdk.model.game.guide.GuideAction
import me.meeshy.sdk.model.game.guide.GuideActionV2
import me.meeshy.sdk.model.game.pages.GamePage

/**
 * OÙ MÈNE LE BOUTON DU GUIDE (iOS `GuideTarget`) : défiler Progression jusqu'à une ancre, quitter vers les
 * conversations, ouvrir la porte des badges, ouvrir le déroulé photo.
 */
public sealed interface GuideTarget {
    public data class Scroll(val anchor: GameAnchor) : GuideTarget
    public data object Conversations : GuideTarget
    public data object Badges : GuideTarget
    public data object Photo : GuideTarget
}

/** Miroir de `GameGuideTarget` (iOS) : le `when` est EXHAUSTIF, une action sans cible ne compile plus. */
public object GameGuideTarget {

    public fun target(action: GuideAction): GuideTarget = when (action) {
        GuideAction.StartGame, GuideAction.EarnFirstPoints -> GuideTarget.Conversations
        GuideAction.SeeLevel, GuideAction.SeeProgress, GuideAction.SeeNextTier, GuideAction.PrestigeOrStay ->
            GuideTarget.Scroll(GameAnchor.Level)
        GuideAction.SeeMissions, GuideAction.OpenFirstMission, GuideAction.DoEasyMissionOrFreeze,
        GuideAction.DoEasiestMission,
        -> GuideTarget.Scroll(GameAnchor.Missions)
        GuideAction.SeeFlame -> GuideTarget.Scroll(GameAnchor.Flame)
        GuideAction.SeeMeeshes, GuideAction.KeepOrSpend -> GuideTarget.Scroll(GameAnchor.Treasury)
        GuideAction.SeeRank -> GuideTarget.Scroll(GameAnchor.Rank)
        GuideAction.TakeStartPhoto, GuideAction.TakePhoto -> GuideTarget.Photo
        GuideAction.MintOrClimb, GuideAction.SeeMintPreview -> GuideTarget.Scroll(GameAnchor.Mint)
        GuideAction.RelightFlame -> GuideTarget.Scroll(GameAnchor.FlamePanel)
    }

    /** La page où mène le bouton d'un moment de la vague 2 ; « voir le niveau » ouvre le Prestige. */
    public fun page(action: GuideActionV2): GamePage = when (action) {
        GuideActionV2.SeeLeague -> GamePage.League
        GuideActionV2.SeeSeason -> GamePage.Season
        GuideActionV2.SeeTrophies -> GamePage.Showcase
        GuideActionV2.SeeAtlas -> GamePage.Atlas
        GuideActionV2.SeeLevel -> GamePage.Prestige
    }
}
