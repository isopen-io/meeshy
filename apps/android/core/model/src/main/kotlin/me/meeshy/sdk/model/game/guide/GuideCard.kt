package me.meeshy.sdk.model.game.guide

import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.sdk.model.game.rules.GuideMood
import me.meeshy.sdk.model.game.rules.GuideSpeaker
import me.meeshy.sdk.model.game.rules.OnboardingStep
import me.meeshy.sdk.model.game.rules.OnboardingStepKey

/** Où mène le bouton d'une carte (iOS `GameGuideTarget` + `GameNavigationMap.guideConcept`). */
public sealed interface GuideDestination {
    /** La FICHE du concept visé — au deuxième niveau, jamais une sous-page sautée par-dessus sa fiche. */
    public data class Concept(val concept: ProgressionConcept) : GuideDestination

    /** « Commencer à jouer » = faire un geste : la liste des conversations. */
    public data object Conversations : GuideDestination

    /** Le déroulé photo du moment. */
    public data object Photo : GuideDestination
}

/** Ce que la carte dit, sans le prononcer : le moment ou l'étape d'où viennent ses phrases. */
public sealed interface GuideContent {
    public data class Moment(val moment: GuideMoment) : GuideContent
    public data class MomentV2(val moment: GuideMomentV2) : GuideContent
    public data class Step(val step: OnboardingStep) : GuideContent
}

/**
 * LA CARTE DU GUIDE (iOS `GuideCard`) — ce que la ligne et la feuille montrent, bâti depuis la loi. La carte ne décide
 * rien : ni qui parle, ni quand, ni en entier ou en court.
 */
public data class GuideCard(
    /** La clé « vue » que le serveur garde : celle du moment, ou `onboarding.<étape>`. */
    val key: String,
    val speaker: GuideSpeaker,
    val mood: GuideMood,
    val content: GuideContent,
    val presentation: GuidePresentation,
    /** « Étape 3 sur 7 » pendant l'intégration. */
    val step: Position?,
    /** Le moment se photographie : la carte propose « Immortaliser ce moment ». */
    val photo: Boolean,
    val destination: GuideDestination,
) {
    public data class Position(val index: Int, val total: Int)
}

public object GameGuideCards {

    /** Nouveau rang, nouveau palier, niveau 100, première Meesh, palier du trésor (conception, partie VI). */
    public val photoMoments: Set<GuideMomentKey> = setOf(
        GuideMomentKey.NewRank, GuideMomentKey.NewTier, GuideMomentKey.Level100, GuideMomentKey.FirstMint,
        GuideMomentKey.TreasuryTier,
    )

    public fun of(moment: GuideAnyMoment): GuideCard = when (moment) {
        is GuideAnyMoment.Original -> of(moment.moment)
        is GuideAnyMoment.Wave2 -> of(moment.moment)
    }

    public fun of(moment: GuideMoment): GuideCard = GuideCard(
        key = moment.key.wire,
        speaker = moment.speaker,
        mood = moment.mood,
        content = GuideContent.Moment(moment),
        presentation = moment.presentation,
        step = null,
        photo = moment.key in photoMoments,
        destination = destination(moment.action),
    )

    public fun of(moment: GuideMomentV2): GuideCard = GuideCard(
        key = moment.key.wire,
        speaker = moment.speaker,
        mood = moment.mood,
        content = GuideContent.MomentV2(moment),
        presentation = moment.presentation,
        step = null,
        photo = GameGuideV2.isPhotoMoment(moment.event),
        destination = GuideDestination.Concept(concept(moment.action)),
    )

    public fun of(step: OnboardingStep): GuideCard = GuideCard(
        key = GameGuide.onboardingSeenKey(step.key),
        speaker = step.speaker,
        mood = step.mood,
        content = GuideContent.Step(step),
        presentation = GuidePresentation.Full,
        step = GuideCard.Position(step.index, GameGuide.onboardingSteps.size),
        photo = false,
        destination = destination(GameGuide.action(step.key)),
    )

    public fun of(step: OnboardingStepKey): GuideCard =
        of(GameGuide.onboardingSteps.first { it.key == step })

    /** Le `when` est EXHAUSTIF : une action ajoutée à la loi sans destination ne compile plus. */
    public fun destination(action: GuideAction): GuideDestination = when (action) {
        GuideAction.StartGame, GuideAction.EarnFirstPoints -> GuideDestination.Conversations
        GuideAction.SeeLevel, GuideAction.SeeProgress, GuideAction.SeeNextTier, GuideAction.PrestigeOrStay ->
            GuideDestination.Concept(ProgressionConcept.Level)
        GuideAction.SeeMissions, GuideAction.OpenFirstMission, GuideAction.DoEasyMissionOrFreeze,
        GuideAction.DoEasiestMission,
        -> GuideDestination.Concept(ProgressionConcept.Missions)
        GuideAction.SeeFlame, GuideAction.RelightFlame -> GuideDestination.Concept(ProgressionConcept.Flame)
        GuideAction.SeeMeeshes, GuideAction.KeepOrSpend, GuideAction.MintOrClimb, GuideAction.SeeMintPreview ->
            GuideDestination.Concept(ProgressionConcept.Meesh)
        GuideAction.SeeRank -> GuideDestination.Concept(ProgressionConcept.Glory)
        GuideAction.TakeStartPhoto, GuideAction.TakePhoto -> GuideDestination.Photo
    }

    /** La page d'un moment de la vague 2, rendue à la FICHE de son concept (le Prestige ouvre le niveau). */
    public fun concept(action: GuideActionV2): ProgressionConcept = when (action) {
        GuideActionV2.SeeLeague -> ProgressionConcept.League
        GuideActionV2.SeeSeason -> ProgressionConcept.Season
        GuideActionV2.SeeTrophies -> ProgressionConcept.Showcase
        GuideActionV2.SeeAtlas -> ProgressionConcept.Atlas
        GuideActionV2.SeeLevel -> ProgressionConcept.Level
    }
}
