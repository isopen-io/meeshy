package me.meeshy.sdk.model.game.guide

import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.LevelTierKey
import me.meeshy.sdk.model.game.TreasuryTierKey
import me.meeshy.sdk.model.game.rules.GameRulesBook
import me.meeshy.sdk.model.game.rules.GuideMood
import me.meeshy.sdk.model.game.rules.GuideSpeaker
import me.meeshy.sdk.model.game.rules.OnboardingStep
import me.meeshy.sdk.model.game.rules.OnboardingStepKey

/** Le bouton qui mène à l'étape d'après (iOS `GuideAction`) — le client en fait un lien. */
public enum class GuideAction(public val wire: String) {
    StartGame("start-game"),
    EarnFirstPoints("earn-first-points"),
    SeeLevel("see-level"),
    SeeMissions("see-missions"),
    SeeFlame("see-flame"),
    SeeMeeshes("see-meeshes"),
    SeeRank("see-rank"),
    TakeStartPhoto("take-start-photo"),
    SeeProgress("see-progress"),
    SeeNextTier("see-next-tier"),
    OpenFirstMission("open-first-mission"),
    MintOrClimb("mint-or-climb"),
    SeeMintPreview("see-mint-preview"),
    TakePhoto("take-photo"),
    KeepOrSpend("keep-or-spend"),
    DoEasyMissionOrFreeze("do-easy-mission-or-freeze"),
    RelightFlame("relight-flame"),
    DoEasiestMission("do-easiest-mission"),
    PrestigeOrStay("prestige-or-stay"),
}

/** Les douze moments d'origine, par leur clé stable — la clé « déjà vue » que le serveur garde (iOS `GuideMomentKey`). */
public enum class GuideMomentKey(public val wire: String) {
    FirstLevel("first-level"),
    NewTier("new-tier"),
    MissionsUnlocked("missions-unlocked"),
    FirstMintPossible("first-mint-possible"),
    FirstMint("first-mint"),
    PriceRises("price-rises"),
    NewRank("new-rank"),
    TreasuryTier("treasury-tier"),
    FlameAtRisk("flame-at-risk"),
    FlameOut("flame-out"),
    ReturnAfterAbsence("return-after-absence"),
    Level100("level-100"),
}

/** Ce qui vient d'arriver au joueur, avec les chiffres que le moment cite (iOS `GuideEvent`). */
public sealed interface GuideEvent {
    public val key: GuideMomentKey

    public data class FirstLevel(val level: Int, val pointsToNext: Long) : GuideEvent {
        override val key: GuideMomentKey get() = GuideMomentKey.FirstLevel
    }

    public data class NewTier(val tier: LevelTierKey, val nextTierLevel: Int?) : GuideEvent {
        override val key: GuideMomentKey get() = GuideMomentKey.NewTier
    }

    public data object MissionsUnlocked : GuideEvent {
        override val key: GuideMomentKey get() = GuideMomentKey.MissionsUnlocked
    }

    public data class FirstMintPossible(val price: Int, val levelsLost: Int, val gloryGain: Int) : GuideEvent {
        override val key: GuideMomentKey get() = GuideMomentKey.FirstMintPossible
    }

    /** La première frappe : elle fait baisser le niveau du montant dépensé, le moment ne cite pas de niveaux. */
    public data object FirstMint : GuideEvent {
        override val key: GuideMomentKey get() = GuideMomentKey.FirstMint
    }

    public data class PriceRises(val nextPrice: Int) : GuideEvent {
        override val key: GuideMomentKey get() = GuideMomentKey.PriceRises
    }

    /** [division] : V = 5 … I = 1, `null` sans division. */
    public data class NewRank(val rank: GloryRank, val division: Int?, val glory: Int, val gloryMissing: Int?) : GuideEvent {
        override val key: GuideMomentKey get() = GuideMomentKey.NewRank
    }

    public data class TreasuryTier(val tier: TreasuryTierKey, val nextTierMissing: Int?) : GuideEvent {
        override val key: GuideMomentKey get() = GuideMomentKey.TreasuryTier
    }

    public data class FlameAtRisk(val days: Int) : GuideEvent {
        override val key: GuideMomentKey get() = GuideMomentKey.FlameAtRisk
    }

    public data class FlameOut(val lostDays: Int, val relightPrice: Int, val canRelight: Boolean) : GuideEvent {
        override val key: GuideMomentKey get() = GuideMomentKey.FlameOut
    }

    public data class ReturnAfterAbsence(val daysAway: Int) : GuideEvent {
        override val key: GuideMomentKey get() = GuideMomentKey.ReturnAfterAbsence
    }

    public data class Level100(val canPrestige: Boolean) : GuideEvent {
        override val key: GuideMomentKey get() = GuideMomentKey.Level100
    }
}

/** En ENTIER la première fois, en version COURTE quand la clé est déjà vue (« ? » rouvre toujours l'entier). */
public enum class GuidePresentation { Full, Short }

public data class GuideMoment(
    val key: GuideMomentKey,
    val speaker: GuideSpeaker,
    val mood: GuideMood,
    val event: GuideEvent,
    val action: GuideAction,
    val presentation: GuidePresentation,
)

/**
 * MEE ET MEO, LES GUIDES DU JEU (iOS `GameGuide`, miroir de `packages/shared/utils/game/guide.ts`) — la loi qui choisit
 * le moment. Elle ne dit rien en toutes lettres : une clé stable, un locuteur, une humeur, les chiffres, le bouton, et
 * si le moment se montre en entier ou en court. Une seule carte par ouverture d'écran ([GameGuideV2.chooseMoment]).
 */
public object GameGuide {

    /** Le bouton de chaque étape de l'intégration. Les voix vivent dans [GameRulesBook.onboardingSteps]. */
    public fun action(of: OnboardingStepKey): GuideAction = when (of) {
        OnboardingStepKey.Welcome -> GuideAction.EarnFirstPoints
        OnboardingStepKey.FirstPoints -> GuideAction.SeeLevel
        OnboardingStepKey.Levels -> GuideAction.SeeMissions
        OnboardingStepKey.Missions -> GuideAction.SeeFlame
        OnboardingStepKey.Flame -> GuideAction.SeeMeeshes
        OnboardingStepKey.Mint -> GuideAction.SeeRank
        OnboardingStepKey.Rank -> GuideAction.TakeStartPhoto
    }

    public val onboardingSteps: List<OnboardingStep> get() = GameRulesBook.onboardingSteps

    public fun onboardingSeenKey(key: OnboardingStepKey): String = "onboarding.${key.wire}"

    /** La première étape non vue, `null` quand l'intégration est terminée. */
    public fun nextOnboardingStep(seen: Set<String>): OnboardingStep? =
        onboardingSteps.firstOrNull { onboardingSeenKey(it.key) !in seen }

    private data class Persona(val speaker: GuideSpeaker, val mood: GuideMood, val action: GuideAction)

    private fun persona(key: GuideMomentKey): Persona = when (key) {
        GuideMomentKey.FirstLevel -> Persona(GuideSpeaker.Mee, GuideMood.Cheer, GuideAction.SeeProgress)
        GuideMomentKey.NewTier -> Persona(GuideSpeaker.Duo, GuideMood.Cheer, GuideAction.SeeNextTier)
        GuideMomentKey.MissionsUnlocked -> Persona(GuideSpeaker.Mee, GuideMood.Guide, GuideAction.OpenFirstMission)
        GuideMomentKey.FirstMintPossible -> Persona(GuideSpeaker.Meo, GuideMood.Ready, GuideAction.MintOrClimb)
        GuideMomentKey.FirstMint -> Persona(GuideSpeaker.Duo, GuideMood.Minting, GuideAction.SeeProgress)
        GuideMomentKey.PriceRises -> Persona(GuideSpeaker.Meo, GuideMood.Calm, GuideAction.SeeMintPreview)
        GuideMomentKey.NewRank -> Persona(GuideSpeaker.Duo, GuideMood.Proud, GuideAction.TakePhoto)
        GuideMomentKey.TreasuryTier -> Persona(GuideSpeaker.Mee, GuideMood.Cheer, GuideAction.KeepOrSpend)
        GuideMomentKey.FlameAtRisk -> Persona(GuideSpeaker.Meo, GuideMood.Calm, GuideAction.DoEasyMissionOrFreeze)
        GuideMomentKey.FlameOut -> Persona(GuideSpeaker.Meo, GuideMood.Sad, GuideAction.RelightFlame)
        GuideMomentKey.ReturnAfterAbsence -> Persona(GuideSpeaker.Mee, GuideMood.Guide, GuideAction.DoEasiestMission)
        GuideMomentKey.Level100 -> Persona(GuideSpeaker.Duo, GuideMood.Proud, GuideAction.PrestigeOrStay)
    }

    public fun moment(event: GuideEvent, seen: Set<String>): GuideMoment {
        val voice = persona(event.key)
        val presentation = if (event.key.wire in seen) GuidePresentation.Short else GuidePresentation.Full
        return GuideMoment(event.key, voice.speaker, voice.mood, event, voice.action, presentation)
    }
}
