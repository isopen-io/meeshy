package me.meeshy.sdk.model.game

import me.meeshy.sdk.model.deeplink.GameLink
import me.meeshy.sdk.model.game.guide.GuideActionV2
import me.meeshy.sdk.model.game.pages.GamePage
import me.meeshy.sdk.model.game.progression.ProgressionConcept

/** La section d'une fiche où une entrée extérieure pose le regard : « À toi de jouer » ou « Aller plus loin ». */
public enum class ConceptSection { Act, More }

/** La saison ou la semaine sur laquelle une page s'ouvre ; `null` : l'en cours. */
public sealed interface GamePageFocus {
    public data class Season(val number: Int) : GamePageFocus
    public data class LeagueWeek(val key: String) : GamePageFocus
}

/** Une route du jeu (iOS `Route.progression*`, `.gamePage`). */
public sealed interface GameRoute {
    /** Niveau 1 : la première page. */
    public data object Progression : GameRoute

    /** Niveau 2 : la fiche d'un concept, posée à une section. */
    public data class Concept(val concept: ProgressionConcept, val section: ConceptSection? = null) : GameRoute

    /** Niveau 2 : la Chronique. */
    public data object Notebook : GameRoute

    /** Niveau 2 : « Comment ça marche », ouvert à une section du carnet (`null` : en haut). */
    public data class Rules(val section: String? = null) : GameRoute

    /** Niveau 3 : la sous-page d'une fiche (Ligue, Voyage, Vitrine, Atlas, Renaissance) ; Réglages au niveau 2. */
    public data class Page(val page: GamePage, val focus: GamePageFocus? = null) : GameRoute

    /** Niveau 3 : la page de section d'une fiche (Badges, Défis, Succès) ; porte le concept qui la possède. */
    public data class Section(val concept: ProgressionConcept) : GameRoute
}

/**
 * LA CARTE DE NAVIGATION DU JEU (iOS `GameNavigationMap`) — trois niveaux, jamais plus ; chaque route a UN parent et
 * le retour ramène toujours au niveau d'au-dessus. Une entrée EXTÉRIEURE ouvre la fiche de son concept posée
 * AU-DESSUS de la première page ([chain]), jamais une sous-page orpheline.
 */
public object GameNavigationMap {

    public const val BADGES_RULES_SECTION: String = "badges"

    /** « Comprendre les médailles » : LA section badges du carnet, une seule adresse. */
    public val badgesGuide: GameRoute = GameRoute.Rules(BADGES_RULES_SECTION)

    public fun level(route: GameRoute): Int {
        val above = parent(route) ?: return 1
        return level(above) + 1
    }

    public fun parent(route: GameRoute): GameRoute? = when (route) {
        GameRoute.Progression -> null
        is GameRoute.Concept, GameRoute.Notebook, is GameRoute.Rules -> GameRoute.Progression
        is GameRoute.Page -> route.page.concept?.let { GameRoute.Concept(it) } ?: GameRoute.Progression
        is GameRoute.Section -> GameRoute.Concept(route.concept)
    }

    /** Le chemin complet de la première page jusqu'à la route : ce que la pile reçoit d'une entrée extérieure. */
    public fun chain(route: GameRoute): List<GameRoute> {
        val above = parent(route) ?: return listOf(route)
        return chain(above) + route
    }

    /** L'écran qu'une notification ouvre ; `null` hors du jeu. */
    public fun entry(notificationType: String): GameRoute? = when (notificationType.lowercase()) {
        "game_duo_invited", "game_duo_accepted", "game_league_result" -> GameRoute.Page(GamePage.League)
        "game_season_step" -> GameRoute.Page(GamePage.Season)
        "game_mission_window" -> GameRoute.Concept(ProgressionConcept.Missions, ConceptSection.Act)
        "level_up" -> GameRoute.Concept(ProgressionConcept.Level)
        "streak_milestone" -> GameRoute.Concept(ProgressionConcept.Flame)
        "badge_earned" -> GameRoute.Concept(ProgressionConcept.Badges)
        "achievement_unlocked", "legacy_achievement_unlocked" -> GameRoute.Concept(ProgressionConcept.Succes)
        else -> null
    }

    /** La saison ou la semaine nommée par un lien ; sans paramètre valide, l'en cours. */
    public fun entry(link: GameLink): GameRoute = when (link) {
        is GameLink.Season -> GameRoute.Page(GamePage.Season, link.number?.let { GamePageFocus.Season(it) })
        is GameLink.LeagueWeek -> GameRoute.Page(GamePage.League, link.key?.let { GamePageFocus.LeagueWeek(it) })
    }

    /** La fiche qu'un moment de la vague 2 du guide ouvre ; « voir le niveau » ouvre la fiche du Niveau. */
    public fun guideConcept(action: GuideActionV2): ProgressionConcept = when (GameGuideTarget.page(action)) {
        GamePage.League -> ProgressionConcept.League
        GamePage.Season -> ProgressionConcept.Season
        GamePage.Showcase -> ProgressionConcept.Showcase
        GamePage.Atlas -> ProgressionConcept.Atlas
        GamePage.Prestige, GamePage.Settings -> ProgressionConcept.Level
    }
}
