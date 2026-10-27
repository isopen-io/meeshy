package me.meeshy.sdk.model.game

import me.meeshy.sdk.model.game.pages.GamePage
import me.meeshy.sdk.model.game.progression.ProgressionConcept

/**
 * L'écran du jeu qu'une entrée extérieure (notification système, ligne de la liste) ouvre — miroir de
 * `GameNavigationMap.entry(for:)` (iOS). Une notification ouvre la FICHE de son concept ; elle n'ouvre une sous-page
 * que lorsque ce qu'elle annonce n'existe que là : le duo et le résultat de ligue au Classement, l'étape à
 * réclamer dans la Saison. Le TYPE décide, jamais la métadonnée.
 */
public sealed interface GameTarget {
    /** La première page du jeu (« Progression ») : l'entrée par défaut quand le type ne nomme pas de concept. */
    public data object Home : GameTarget

    public data class Concept(val concept: ProgressionConcept) : GameTarget

    public data class Page(val page: GamePage) : GameTarget

    public companion object {
        /** Les types de notification qui appartiennent au jeu, qu'ils nomment un écran précis ou non. */
        public val NOTIFICATION_TYPES: Set<String> = setOf(
            "achievement_unlocked", "streak_milestone", "level_up", "badge_earned",
            "game_duo_invited", "game_duo_accepted", "game_league_result", "game_season_step",
            "game_mission_window",
        )

        /** L'écran du jeu d'un type de notification ; la première page pour un type du jeu que la carte ne nomme pas. */
        public fun forNotification(type: String): GameTarget? {
            val key = type.lowercase()
            return when (key) {
                "game_duo_invited", "game_duo_accepted", "game_league_result" -> Page(GamePage.League)
                "game_season_step" -> Page(GamePage.Season)
                "game_mission_window" -> Concept(ProgressionConcept.Missions)
                "level_up" -> Concept(ProgressionConcept.Level)
                "streak_milestone" -> Concept(ProgressionConcept.Flame)
                "badge_earned" -> Concept(ProgressionConcept.Badges)
                "achievement_unlocked" -> Concept(ProgressionConcept.Succes)
                else -> null
            }
        }
    }
}
