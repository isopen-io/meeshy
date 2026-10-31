package me.meeshy.app.game.progression

import androidx.annotation.StringRes
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.sdk.model.game.rules.GlossaryKey
import me.meeshy.sdk.model.game.rules.OnboardingStepKey

/**
 * CE QUE DIT LE CARNET « COMMENT ÇA MARCHE » (iOS `GameGuideCopy.rules`, `GameRulesGlossary`, `GameGuideCopy.step`) :
 * les clés du catalogue iOS, dans les sept langues, phrase pour phrase. La structure (quoi, dans quel ordre) vit dans
 * `GameRulesBook` ; ici, seulement quelle chaîne dit chaque morceau.
 */
internal object RulesBookCopy {
    data class Rule(@StringRes val title: Int, @StringRes val body: Int)

    data class Step(@StringRes val what: Int, @StringRes val means: Int, @StringRes val next: Int)

    fun rule(index: Int): Rule = when (index) {
        1 -> Rule(R.string.game_rules_1_title, R.string.game_rules_1_body)
        2 -> Rule(R.string.game_rules_2_title, R.string.game_rules_2_body)
        3 -> Rule(R.string.game_rules_3_title, R.string.game_rules_3_body)
        4 -> Rule(R.string.game_rules_4_title, R.string.game_rules_4_body)
        5 -> Rule(R.string.game_rules_5_title, R.string.game_rules_5_body)
        6 -> Rule(R.string.game_rules_6_title, R.string.game_rules_6_body)
        7 -> Rule(R.string.game_rules_7_title, R.string.game_rules_7_body)
        8 -> Rule(R.string.game_rules_8_title, R.string.game_rules_8_body)
        else -> error("Le carnet porte huit règles, pas $index")
    }

    @StringRes fun name(key: GlossaryKey): Int = when (key) {
        is GlossaryKey.Concept -> ConceptCopy.name(key.concept)
        GlossaryKey.Extra.Chest -> R.string.game_rules_concept_chest_name
        GlossaryKey.Extra.Treasury -> R.string.game_rules_concept_treasury_name
        GlossaryKey.Extra.Steps -> R.string.game_rules_concept_steps_name
        GlossaryKey.Extra.Tailwind -> R.string.game_rules_concept_tailwind_name
        GlossaryKey.Extra.Duo -> R.string.game_rules_concept_duo_name
    }

    @StringRes fun body(key: GlossaryKey): Int = when (key) {
        is GlossaryKey.Concept -> conceptBody(key.concept)
        GlossaryKey.Extra.Chest -> R.string.game_rules_concept_chest_body
        GlossaryKey.Extra.Treasury -> R.string.game_rules_concept_treasury_body
        GlossaryKey.Extra.Steps -> R.string.game_rules_concept_steps_body
        GlossaryKey.Extra.Tailwind -> R.string.game_rules_concept_tailwind_body
        GlossaryKey.Extra.Duo -> R.string.game_rules_concept_duo_body
    }

    @StringRes private fun conceptBody(concept: ProgressionConcept): Int = when (concept) {
        ProgressionConcept.Level -> R.string.game_rules_concept_level_body
        ProgressionConcept.Points -> R.string.game_rules_concept_points_body
        ProgressionConcept.Meesh -> R.string.game_rules_concept_meesh_body
        ProgressionConcept.Glory -> R.string.game_rules_concept_glory_body
        ProgressionConcept.Flame -> R.string.game_rules_concept_flame_body
        ProgressionConcept.Missions -> R.string.game_rules_concept_missions_body
        ProgressionConcept.League -> R.string.game_rules_concept_league_body
        ProgressionConcept.Season -> R.string.game_rules_concept_season_body
        ProgressionConcept.Prestige -> R.string.game_rules_concept_prestige_body
        ProgressionConcept.Elans -> R.string.game_rules_concept_elans_body
        ProgressionConcept.Badges -> R.string.game_rules_concept_badges_body
        ProgressionConcept.Defis -> R.string.game_rules_concept_defis_body
        ProgressionConcept.Succes -> R.string.game_rules_concept_succes_body
        ProgressionConcept.Showcase -> R.string.game_rules_concept_showcase_body
        ProgressionConcept.Atlas -> R.string.game_rules_concept_atlas_body
    }

    fun step(key: OnboardingStepKey): Step = when (key) {
        OnboardingStepKey.Welcome -> Step(R.string.game_guide_step_welcome_what, R.string.game_guide_step_welcome_means, R.string.game_guide_step_welcome_next)
        OnboardingStepKey.FirstPoints -> Step(R.string.game_guide_step_first_points_what, R.string.game_guide_step_first_points_means, R.string.game_guide_step_first_points_next)
        OnboardingStepKey.Levels -> Step(R.string.game_guide_step_levels_what, R.string.game_guide_step_levels_means, R.string.game_guide_step_levels_next)
        OnboardingStepKey.Missions -> Step(R.string.game_guide_step_missions_what, R.string.game_guide_step_missions_means, R.string.game_guide_step_missions_next)
        OnboardingStepKey.Flame -> Step(R.string.game_guide_step_flame_what, R.string.game_guide_step_flame_means, R.string.game_guide_step_flame_next)
        OnboardingStepKey.Mint -> Step(R.string.game_guide_step_mint_what, R.string.game_guide_step_mint_means, R.string.game_guide_step_mint_next)
        OnboardingStepKey.Rank -> Step(R.string.game_guide_step_rank_what, R.string.game_guide_step_rank_means, R.string.game_guide_step_rank_next)
    }
}
