import Foundation
import MeeshySDK

/// La section d'une fiche où une entrée extérieure pose le regard (#9564, amendement n° 4).
enum ProgressionConceptSection: String, Hashable, CaseIterable {
    /// « À toi de jouer » — les gestes du concept (missions et coffre, détail de ligue, Flamme…).
    case act
    /// « Aller plus loin » — les sous-pages (parcours de saison, classement…).
    case more
}

/// LA CARTE DE NAVIGATION DU JEU (#9564, amendement n° 4) — trois niveaux, jamais plus :
///
///  1. **Progression** (`.progression`) — les concepts, en cartes ;
///  2. **la fiche d'un concept** (`.progressionConcept`) — tout le concept et ses gestes ; au même niveau, les trois
///     portes de la première page : Carnet, Comment ça marche, Réglages du jeu ;
///  3. **la sous-page d'une fiche** — classement de la ligue, parcours de saison, Prestige, vitrine, Atlas, pages
///     Badges / Défis / Succès, règle visée.
///
/// Le retour ramène TOUJOURS au niveau d'au-dessus : chaque route a UN parent, et la pile n'est jamais qu'un chemin
/// de cet arbre. Une entrée EXTÉRIEURE (notification de mission, de ligue, de saison, bandeau du joueur) ouvre la
/// fiche de son concept, à sa section, posée AU-DESSUS de la première page — jamais une sous-page orpheline dont le
/// retour mènerait hors du jeu. Une table pure : les hôtes la lisent, les témoins la parcourent.
enum GameNavigationMap {

    /// Le niveau d'une route du jeu (1, 2 ou 3) ; `nil` hors du jeu.
    static func level(of route: Route) -> Int? {
        guard let above = parent(of: route) else { return isRoot(route) ? 1 : nil }
        return level(of: above).map { $0 + 1 }
    }

    /// La route du jeu d'où l'on vient, et où le retour ramène ; `nil` pour la première page (et hors du jeu).
    static func parent(of route: Route) -> Route? {
        switch route {
        case .progressionConcept, .progressionNotebook, .progressionRules:
            return .progression
        case .gamePage(let page):
            return concept(owning: page).map { Route.progressionConcept($0) } ?? .progression
        case .progressionSection(let section):
            return .progressionConcept(concept(owning: section))
        default:
            return nil
        }
    }

    /// Une route du jeu ouverte DEPUIS une page du jeu s'empile au-dessus d'elle (pile du panneau iPad) ; la première
    /// page ne s'empile jamais : la rouvrir revient à la racine du jeu.
    static func stacks(_ route: Route, over root: Route) -> Bool {
        guard let depth = level(of: route), depth > 1 else { return false }
        return self.level(of: root) != nil
    }

    private static func isRoot(_ route: Route) -> Bool {
        switch route {
        case .progression, .progressionDashboard: true
        default: false
        }
    }

    /// Le concept dont une page du jeu est la sous-page ; `nil` pour les réglages, au deuxième niveau comme le carnet.
    static func concept(owning page: GamePage) -> ProgressionConcept? {
        switch page {
        case .league: .league
        case .season: .season
        case .prestige: .prestige
        case .showcase: .showcase
        case .atlas: .atlas
        case .settings: nil
        }
    }

    static func concept(owning section: ProgressionSection) -> ProgressionConcept {
        switch section {
        case .badges: .badges
        case .defis: .defis
        case .succes: .succes
        }
    }

    /// Ce qu'un lien « Aller plus loin » d'une fiche ouvre : sa sous-page.
    static func route(for link: ProgressionConceptLink) -> Route {
        switch link {
        case .page(let page): .gamePage(page)
        case .section(let section): .progressionSection(section)
        }
    }

    /// Le CHEMIN COMPLET jusqu'à un écran du jeu, de la première page à lui : `[Progression, fiche, sous-page]`.
    /// C'est ce que la pile reçoit d'une entrée extérieure — « retour » remonte la chaîne, jamais ailleurs.
    static func chain(to route: Route) -> [Route] {
        guard let above = parent(of: route) else { return [route] }
        return chain(to: above) + [route]
    }

    // MARK: - Les entrées extérieures

    /// L'écran qu'une notification ouvre (#9490, #9539, #5698) ; `nil` hors du jeu. Une notification ouvre la FICHE
    /// de son concept ; elle n'ouvre une sous-page que lorsque ce qu'elle annonce n'existe que là — le duo et le
    /// résultat de ligue au Classement, l'étape à réclamer dans la Saison.
    static func entry(for type: MeeshyNotificationType) -> Route? {
        switch type {
        case .gameDuoInvited, .gameDuoAccepted, .gameLeagueResult: .gamePage(.league)
        case .gameSeasonStep: .gamePage(.season)
        case .gameMissionWindow: .progressionConcept(.missions, section: .act)
        case .levelUp: .progressionConcept(.level)
        case .streakMilestone: .progressionConcept(.flame)
        case .badgeEarned: .progressionConcept(.badges)
        case .achievementUnlocked, .legacyAchievementUnlocked: .progressionConcept(.succes)
        default: nil
        }
    }

    /// La fiche qu'un moment de la vague 2 du guide de Mee ouvre : celle du concept dont la page est la sous-page —
    /// ligue, saison, vitrine, Atlas ; « voir le niveau » (le moment du Prestige) ouvre la fiche du Niveau.
    static func guideConcept(for page: GamePage) -> ProgressionConcept {
        switch page {
        case .league: .league
        case .season: .season
        case .showcase: .showcase
        case .atlas: .atlas
        case .prestige, .settings: .level
        }
    }
}
