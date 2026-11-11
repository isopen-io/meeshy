package me.meeshy.app.game.progression

import androidx.annotation.StringRes
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.progression.ProgressionConcept

/**
 * CE QUE DISENT LES CONCEPTS DE PROGRESSION — une SEULE source de texte par concept : la fiche dit ce que c'est
 * ([what]) sous « C'est quoi ? », comment en gagner par deux conseils ([tip1], [tip2]), et range l'usage ([use])
 * derrière le (i) de « C'est quoi ? ». Les clés sont celles du catalogue iOS et du
 * web, dans les sept langues, phrase pour phrase.
 */
internal object ConceptCopy {
    @StringRes fun name(concept: ProgressionConcept): Int = when (concept) {
        ProgressionConcept.Level -> R.string.game_concept_level_name
        ProgressionConcept.Points -> R.string.game_concept_points_name
        ProgressionConcept.Meesh -> R.string.game_concept_meesh_name
        ProgressionConcept.Glory -> R.string.game_concept_glory_name
        ProgressionConcept.Flame -> R.string.game_concept_flame_name
        ProgressionConcept.Missions -> R.string.game_concept_missions_name
        ProgressionConcept.League -> R.string.game_concept_league_name
        ProgressionConcept.Season -> R.string.game_concept_season_name
        ProgressionConcept.Prestige -> R.string.game_concept_prestige_name
        ProgressionConcept.Elans -> R.string.game_concept_elans_name
        ProgressionConcept.Badges -> R.string.game_concept_badges_name
        ProgressionConcept.Defis -> R.string.game_concept_defis_name
        ProgressionConcept.Succes -> R.string.game_concept_succes_name
        ProgressionConcept.Showcase -> R.string.game_concept_showcase_name
        ProgressionConcept.Atlas -> R.string.game_concept_atlas_name
    }

    @StringRes fun tip1(concept: ProgressionConcept): Int = when (concept) {
        ProgressionConcept.Level -> R.string.game_concept_level_tip_1
        ProgressionConcept.Points -> R.string.game_concept_points_tip_1
        ProgressionConcept.Meesh -> R.string.game_concept_meesh_tip_1
        ProgressionConcept.Glory -> R.string.game_concept_glory_tip_1
        ProgressionConcept.Flame -> R.string.game_concept_flame_tip_1
        ProgressionConcept.Missions -> R.string.game_concept_missions_tip_1
        ProgressionConcept.League -> R.string.game_concept_league_tip_1
        ProgressionConcept.Season -> R.string.game_concept_season_tip_1
        ProgressionConcept.Prestige -> R.string.game_concept_prestige_tip_1
        ProgressionConcept.Elans -> R.string.game_concept_elans_tip_1
        ProgressionConcept.Badges -> R.string.game_concept_badges_tip_1
        ProgressionConcept.Defis -> R.string.game_concept_defis_tip_1
        ProgressionConcept.Succes -> R.string.game_concept_succes_tip_1
        ProgressionConcept.Showcase -> R.string.game_concept_showcase_tip_1
        ProgressionConcept.Atlas -> R.string.game_concept_atlas_tip_1
    }

    @StringRes fun tip2(concept: ProgressionConcept): Int = when (concept) {
        ProgressionConcept.Level -> R.string.game_concept_level_tip_2
        ProgressionConcept.Points -> R.string.game_concept_points_tip_2
        ProgressionConcept.Meesh -> R.string.game_concept_meesh_tip_2
        ProgressionConcept.Glory -> R.string.game_concept_glory_tip_2
        ProgressionConcept.Flame -> R.string.game_concept_flame_tip_2
        ProgressionConcept.Missions -> R.string.game_concept_missions_tip_2
        ProgressionConcept.League -> R.string.game_concept_league_tip_2
        ProgressionConcept.Season -> R.string.game_concept_season_tip_2
        ProgressionConcept.Prestige -> R.string.game_concept_prestige_tip_2
        ProgressionConcept.Elans -> R.string.game_concept_elans_tip_2
        ProgressionConcept.Badges -> R.string.game_concept_badges_tip_2
        ProgressionConcept.Defis -> R.string.game_concept_defis_tip_2
        ProgressionConcept.Succes -> R.string.game_concept_succes_tip_2
        ProgressionConcept.Showcase -> R.string.game_concept_showcase_tip_2
        ProgressionConcept.Atlas -> R.string.game_concept_atlas_tip_2
    }

    @StringRes fun what(concept: ProgressionConcept): Int = when (concept) {
        ProgressionConcept.Level -> R.string.game_concept_level_what
        ProgressionConcept.Points -> R.string.game_concept_points_what
        ProgressionConcept.Meesh -> R.string.game_concept_meesh_what
        ProgressionConcept.Glory -> R.string.game_concept_glory_what
        ProgressionConcept.Flame -> R.string.game_concept_flame_what
        ProgressionConcept.Missions -> R.string.game_concept_missions_what
        ProgressionConcept.League -> R.string.game_concept_league_what
        ProgressionConcept.Season -> R.string.game_concept_season_what
        ProgressionConcept.Prestige -> R.string.game_concept_prestige_what
        ProgressionConcept.Elans -> R.string.game_concept_elans_what
        ProgressionConcept.Badges -> R.string.game_concept_badges_what
        ProgressionConcept.Defis -> R.string.game_concept_defis_what
        ProgressionConcept.Succes -> R.string.game_concept_succes_what
        ProgressionConcept.Showcase -> R.string.game_concept_showcase_what
        ProgressionConcept.Atlas -> R.string.game_concept_atlas_what
    }

    @StringRes fun use(concept: ProgressionConcept): Int = when (concept) {
        ProgressionConcept.Level -> R.string.game_concept_level_use
        ProgressionConcept.Points -> R.string.game_concept_points_use
        ProgressionConcept.Meesh -> R.string.game_concept_meesh_use
        ProgressionConcept.Glory -> R.string.game_concept_glory_use
        ProgressionConcept.Flame -> R.string.game_concept_flame_use
        ProgressionConcept.Missions -> R.string.game_concept_missions_use
        ProgressionConcept.League -> R.string.game_concept_league_use
        ProgressionConcept.Season -> R.string.game_concept_season_use
        ProgressionConcept.Prestige -> R.string.game_concept_prestige_use
        ProgressionConcept.Elans -> R.string.game_concept_elans_use
        ProgressionConcept.Badges -> R.string.game_concept_badges_use
        ProgressionConcept.Defis -> R.string.game_concept_defis_use
        ProgressionConcept.Succes -> R.string.game_concept_succes_use
        ProgressionConcept.Showcase -> R.string.game_concept_showcase_use
        ProgressionConcept.Atlas -> R.string.game_concept_atlas_use
    }
}
