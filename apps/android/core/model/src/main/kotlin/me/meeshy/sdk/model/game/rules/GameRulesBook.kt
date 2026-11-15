package me.meeshy.sdk.model.game.rules

import me.meeshy.sdk.model.game.progression.ProgressionConcept

/** Qui parle sur une carte du guide (iOS `GuideSpeaker`). */
public enum class GuideSpeaker { Mee, Meo, Duo }

/** L'humeur d'une carte du guide (iOS `GuideMood`) : elle choisit le film de chaque colibri. */
public enum class GuideMood { Guide, Cheer, Minting, Ready, Streak, Counting, Calm, Sad, Proud }

/** Les sept étapes de l'intégration (iOS `OnboardingStepKey`), dans l'ordre. */
public enum class OnboardingStepKey(public val wire: String) {
    Welcome("welcome"),
    FirstPoints("first-points"),
    Levels("levels"),
    Missions("missions"),
    Flame("flame"),
    Mint("mint"),
    Rank("rank"),
}

/** Une étape de l'intégration : son rang (à partir de 1), qui la dit et sur quel ton (iOS `OnboardingStep`). */
public data class OnboardingStep(val key: OnboardingStepKey, val index: Int, val speaker: GuideSpeaker, val mood: GuideMood)

/**
 * Une entrée du glossaire du carnet (iOS `GameRulesGlossaryKey`) : un concept de Progression, ou ce que Progression
 * montre sans en faire une fiche — l'Offrande, l'Héritage, les épreuves, le Vent arrière, l'Alliance.
 */
public sealed interface GlossaryKey {
    public val wire: String

    public data class Concept(val concept: ProgressionConcept) : GlossaryKey {
        override val wire: String get() = concept.wire
    }

    public enum class Extra(override val wire: String) : GlossaryKey {
        Chest("chest"),
        Treasury("treasury"),
        Steps("steps"),
        Tailwind("tailwind"),
        Duo("duo"),
    }
}

/** Les films de Mee et de Meo sur une carte du guide (iOS `GameGuideCard.figures`) ; `null` = le colibri n'y est pas. */
public data class GuideFilms(val mee: String?, val meo: String?) {
    public companion object {
        public fun of(speaker: GuideSpeaker, mood: GuideMood): GuideFilms = when (speaker) {
            GuideSpeaker.Mee -> GuideFilms(meeFilm(mood), null)
            GuideSpeaker.Meo -> GuideFilms(null, meoFilm(mood))
            GuideSpeaker.Duo -> GuideFilms(meeFilm(mood), meoFilm(mood))
        }

        private fun meeFilm(mood: GuideMood): String = when (mood) {
            GuideMood.Guide -> "mee-bonjour"
            GuideMood.Cheer -> "mee-fete"
            GuideMood.Minting -> "mee-jackpot"
            GuideMood.Ready -> "mee-coucou"
            GuideMood.Streak -> "mee-danse"
            GuideMood.Counting -> "mee-je-reflechis"
            GuideMood.Calm -> "mee-sourire"
            GuideMood.Sad -> "mee-pleure"
            GuideMood.Proud -> "mee-bravo"
        }

        private fun meoFilm(mood: GuideMood): String = when (mood) {
            GuideMood.Guide -> "meo-salut"
            GuideMood.Cheer -> "meo-bravo"
            GuideMood.Minting -> "meo-muscles"
            GuideMood.Ready -> "meo-clin"
            GuideMood.Streak -> "meo-feu-artifice"
            GuideMood.Counting -> "meo-hmm"
            GuideMood.Calm -> "meo-ok"
            GuideMood.Sad -> "meo-effondre"
            GuideMood.Proud -> "meo-roi"
        }
    }
}

/**
 * CE QUE LE CARNET « COMMENT ÇA MARCHE » PARCOURT, DANS L'ORDRE (iOS `GameGuideCopy.rules`, `GameRulesGlossary.keys`,
 * `GameGuide.onboardingSteps`) : les huit règles, le glossaire — chaque concept de Progression suivi de ce qui le
 * complète — et les sept étapes de l'intégration. Les textes vivent dans le catalogue ; ici, seulement la structure.
 */
public object GameRulesBook {
    public val ruleIndices: List<Int> = (1..8).toList()

    /** Ce qui suit chaque concept dans le glossaire : un `when` exhaustif, un concept ajouté ne compile pas sans décision. */
    public fun extras(after: ProgressionConcept): List<GlossaryKey.Extra> = when (after) {
        ProgressionConcept.Level -> listOf(GlossaryKey.Extra.Steps)
        ProgressionConcept.Meesh -> listOf(GlossaryKey.Extra.Treasury)
        ProgressionConcept.Missions -> listOf(GlossaryKey.Extra.Chest)
        ProgressionConcept.Season -> listOf(GlossaryKey.Extra.Duo)
        ProgressionConcept.Elans -> listOf(GlossaryKey.Extra.Tailwind)
        ProgressionConcept.Points, ProgressionConcept.Glory, ProgressionConcept.Flame, ProgressionConcept.League,
        ProgressionConcept.Prestige, ProgressionConcept.Badges, ProgressionConcept.Defis, ProgressionConcept.Succes,
        ProgressionConcept.Showcase, ProgressionConcept.Atlas,
        -> emptyList()
    }

    public val glossary: List<GlossaryKey> =
        ProgressionConcept.entries.flatMap { listOf(GlossaryKey.Concept(it)) + extras(after = it) }

    public val onboardingSteps: List<OnboardingStep> = listOf(
        OnboardingStepKey.Welcome to (GuideSpeaker.Mee to GuideMood.Guide),
        OnboardingStepKey.FirstPoints to (GuideSpeaker.Mee to GuideMood.Cheer),
        OnboardingStepKey.Levels to (GuideSpeaker.Meo to GuideMood.Guide),
        OnboardingStepKey.Missions to (GuideSpeaker.Mee to GuideMood.Ready),
        OnboardingStepKey.Flame to (GuideSpeaker.Meo to GuideMood.Calm),
        OnboardingStepKey.Mint to (GuideSpeaker.Duo to GuideMood.Minting),
        OnboardingStepKey.Rank to (GuideSpeaker.Meo to GuideMood.Guide),
    ).map { (key, voice) -> OnboardingStep(key, key.ordinal + 1, voice.first, voice.second) }
}
