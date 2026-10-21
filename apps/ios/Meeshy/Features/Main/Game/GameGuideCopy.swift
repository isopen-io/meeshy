import Foundation
import MeeshySDK

/// CE QUE DISENT MEE ET MEO (#9379) — conception, partie III. Chaque
/// intervention suit la même structure :
///
///   Ce qui vient d'arriver → Ce que ça veut dire → L'étape d'après → Un bouton
///
/// La loi (`GameGuide`, miroir de `utils/game/guide.ts`) choisit le MOMENT et
/// rend ses chiffres ; elle ne prononce rien. Ce fichier l'habille, comme le web
/// (`game-guide-copy.ts`) : au tutoiement (ce sont des compagnons), sans bulle,
/// avec une version COURTE pour les fois suivantes. Tous les nombres entrent
/// dans les phrases déjà formatés par la locale — un seul `%@` par trou.
struct GuideCopy: Equatable {
    /// Ce qui vient d'arriver — la ligne forte.
    let what: String
    /// Ce que ça veut dire — la règle.
    let means: String
    /// L'étape d'après.
    let next: String
    /// La version d'UNE ligne, pour les fois suivantes.
    let short: String
    /// Le libellé du bouton qui y mène.
    let action: String
}

enum GameGuideCopy {

    // MARK: - Boutons

    static func actionLabel(_ action: GuideAction) -> String {
        switch action {
        case .startGame: String(localized: "game.guide.action.start_game", defaultValue: "Commencer le jeu", bundle: .main)
        case .earnFirstPoints: String(localized: "game.guide.action.earn_first_points", defaultValue: "Faire mon premier geste", bundle: .main)
        case .seeLevel: String(localized: "game.guide.action.see_level", defaultValue: "Voir ma lumière", bundle: .main)
        case .seeMissions: String(localized: "game.guide.action.see_missions", defaultValue: "Voir mon rêve", bundle: .main)
        case .seeFlame: String(localized: "game.guide.action.see_flame", defaultValue: "Voir ma Flamme", bundle: .main)
        case .seeMeeshes: String(localized: "game.guide.action.see_meeshes", defaultValue: "Voir mes Meeshes", bundle: .main)
        case .seeRank: String(localized: "game.guide.action.see_rank", defaultValue: "Voir mon rang", bundle: .main)
        case .takeStartPhoto: String(localized: "game.guide.action.take_start_photo", defaultValue: "Prendre la photo de départ", bundle: .main)
        case .seeProgress: String(localized: "game.guide.action.see_progress", defaultValue: "Voir ma progression", bundle: .main)
        case .seeNextTier: String(localized: "game.guide.action.see_next_tier", defaultValue: "Voir l’état suivant de ma lumière", bundle: .main)
        case .openFirstMission: String(localized: "game.guide.action.open_first_mission", defaultValue: "Ouvrir mon premier rêve", bundle: .main)
        case .mintOrClimb: String(localized: "game.guide.action.mint_or_climb", defaultValue: "Voir l’aperçu de frappe", bundle: .main)
        case .seeMintPreview: String(localized: "game.guide.action.see_mint_preview", defaultValue: "Voir l’aperçu de frappe", bundle: .main)
        case .takePhoto: String(localized: "game.guide.action.take_photo", defaultValue: "Immortaliser ce moment", bundle: .main)
        case .keepOrSpend: String(localized: "game.guide.action.keep_or_spend", defaultValue: "Voir mon Héritage", bundle: .main)
        case .doEasyMissionOrFreeze: String(localized: "game.guide.action.do_easy_mission_or_freeze", defaultValue: "Voir mon rêve", bundle: .main)
        case .relightFlame: String(localized: "game.guide.action.relight_flame", defaultValue: "Rallumer la Flamme", bundle: .main)
        case .doEasiestMission: String(localized: "game.guide.action.do_easiest_mission", defaultValue: "Voir le premier acte", bundle: .main)
        case .prestigeOrStay: String(localized: "game.guide.action.prestige_or_stay", defaultValue: "Voir la Renaissance", bundle: .main)
        }
    }

    // MARK: - Moments

    static func moment(_ moment: GuideMoment) -> GuideCopy {
        let action = actionLabel(moment.action)
        switch moment.event {
        case .firstLevel(let level, let pointsToNext):
            let points = GameCopy.points(pointsToNext)
            let nextLevel = GameCopy.formatCount(level + 1)
            return GuideCopy(
                what: String(localized: "game.guide.moment.first_level.what", defaultValue: "Ta lumière grandit : premier niveau franchi.", bundle: .main),
                means: String(localized: "game.guide.moment.first_level.means", defaultValue: "Tes étincelles nourrissent ta lumière : quand l’anneau est plein, elle gagne un niveau.", bundle: .main),
                next: String(localized: "game.guide.moment.first_level.next", defaultValue: "\(points) jusqu’au niveau \(nextLevel).", bundle: .main),
                short: String(localized: "game.guide.moment.first_level.short", defaultValue: "Niveau \(GameCopy.formatCount(level)) · \(points) jusqu’au suivant.", bundle: .main),
                action: action
            )
        case .newTier(let tier, let nextTierLevel):
            let name = GameCopy.tierName(tier)
            return GuideCopy(
                what: String(localized: "game.guide.moment.new_tier.what", defaultValue: "Ta lumière brille en \(name) !", bundle: .main),
                means: String(localized: "game.guide.moment.new_tier.means", defaultValue: "Ta lumière traverse vingt états : un tous les dix niveaux jusqu’au 100, puis un par centaine.", bundle: .main),
                next: nextTierLevel.map {
                    String(localized: "game.guide.moment.new_tier.next", defaultValue: "Son prochain état s’éveille au niveau \(GameCopy.formatCount($0)).", bundle: .main)
                } ?? String(localized: "game.guide.moment.new_tier.next_last", defaultValue: "Ta lumière a atteint son dernier état.", bundle: .main),
                short: String(localized: "game.guide.moment.new_tier.short", defaultValue: "Ta lumière brille en \(name).", bundle: .main),
                action: action
            )
        case .missionsUnlocked:
            return GuideCopy(
                what: String(localized: "game.guide.moment.missions_unlocked.what", defaultValue: "Tes aïeux t’envoient ton premier rêve.", bundle: .main),
                means: String(localized: "game.guide.moment.missions_unlocked.means", defaultValue: "Chaque nuit, un rêve en trois actes. Réalise-les, et l’Offrande apparaît.", bundle: .main),
                next: String(localized: "game.guide.moment.missions_unlocked.next", defaultValue: "Commence par le premier acte.", bundle: .main),
                short: String(localized: "game.guide.moment.missions_unlocked.short", defaultValue: "Le rêve de cette nuit t’attend.", bundle: .main),
                action: action
            )
        case .firstMintPossible(let price, let levelsLost, let gloryGain):
            let cost = GameCopy.points(price)
            let glory = GameCopy.formatCount(gloryGain)
            // La poche fait le niveau (#10892) : une frappe qui coûte des niveaux le dit avant le geste.
            let means = levelsLost > 0
                ? firstMintPossibleDrop(cost: cost, glory: glory)
                : String(localized: "game.guide.moment.first_mint_possible.means_free", defaultValue: "Frapper fige \(cost) de ta lumière dans une pièce, sans te faire perdre un niveau, et tu gagnes +\(glory) de gloire.", bundle: .main)
            return GuideCopy(
                what: String(localized: "game.guide.moment.first_mint_possible.what", defaultValue: "Tu peux frapper ta première Meesh.", bundle: .main),
                means: means,
                next: String(localized: "game.guide.moment.first_mint_possible.next", defaultValue: "Frappe maintenant, ou laisse d’abord grandir ta lumière.", bundle: .main),
                short: String(localized: "game.guide.moment.first_mint_possible.short", defaultValue: "Une Meesh fige \(cost) de ta lumière.", bundle: .main),
                action: action
            )
        // La première frappe (#10892) : elle fait baisser le niveau du montant dépensé, jamais le rang, et n'ouvre aucun
        // Vent arrière — le moment ne cite pas de niveaux, et mène à la progression.
        case .firstMint:
            return GuideCopy(
                what: String(localized: "game.guide.moment.first_mint.what", defaultValue: "Tchak ! Ta première Meesh est frappée.", bundle: .main),
                means: String(localized: "game.guide.moment.first_mint.means", defaultValue: "Une part de ta lumière s’est figée dans la pièce : ton niveau a baissé d’autant, ton rang jamais.", bundle: .main),
                next: String(localized: "game.guide.moment.first_mint.next", defaultValue: "Ce que tu as reçu reste reçu : chaque nouvelle étincelle fait regrandir ta lumière.", bundle: .main),
                short: String(localized: "game.guide.moment.first_mint.short", defaultValue: "Première Meesh frappée : ta gloire grandit.", bundle: .main),
                action: action
            )
        case .priceRises(let nextPrice):
            let cost = GameCopy.points(nextPrice)
            return GuideCopy(
                what: String(localized: "game.guide.moment.price_rises.what", defaultValue: "Les Meeshes deviennent plus rares.", bundle: .main),
                means: String(localized: "game.guide.moment.price_rises.means", defaultValue: "Plus on en frappe, plus la suivante fige de lumière.", bundle: .main),
                next: String(localized: "game.guide.moment.price_rises.next", defaultValue: "La prochaine fige \(cost) de ta lumière.", bundle: .main),
                short: String(localized: "game.guide.moment.price_rises.short", defaultValue: "La prochaine Meesh fige \(cost).", bundle: .main),
                action: action
            )
        case .newRank(let rank, let division, _, let gloryMissing):
            let name = GameCopy.rankLabel(rank, division5: division)
            return GuideCopy(
                what: String(localized: "game.guide.moment.new_rank.what", defaultValue: "On t’appelle désormais \(name).", bundle: .main),
                means: String(localized: "game.guide.moment.new_rank.means", defaultValue: "Ta gloire a grandi : le monde te donne un nouveau nom, qui ne recule jamais.", bundle: .main),
                next: gloryMissing.map {
                    String(localized: "game.guide.moment.new_rank.next", defaultValue: "\(GameCopy.formatCount($0)) de gloire jusqu’à la marche suivante. Immortalise ce moment.", bundle: .main)
                } ?? String(localized: "game.guide.moment.new_rank.next_top", defaultValue: "C’est le rang le plus haut. Immortalise ce moment.", bundle: .main),
                short: String(localized: "game.guide.moment.new_rank.short", defaultValue: "On t’appelle \(name).", bundle: .main),
                action: action
            )
        case .treasuryTier(let tier, let nextTierMissing):
            let name = GameCopy.treasuryName(tier)
            return GuideCopy(
                what: String(localized: "game.guide.moment.treasury_tier.what", defaultValue: "Ton Héritage change de contenant : voici ton \(name).", bundle: .main),
                means: String(localized: "game.guide.moment.treasury_tier.means", defaultValue: "Ton Héritage se voit sur ton profil.", bundle: .main),
                next: nextTierMissing.map {
                    String(localized: "game.guide.moment.treasury_tier.next", defaultValue: "Garde \(GameCopy.meeshes($0)) de plus pour le contenant suivant, ou dépense-les.", bundle: .main)
                } ?? String(localized: "game.guide.moment.treasury_tier.next_top", defaultValue: "Garde-le, ou dépense tes Meeshes.", bundle: .main),
                short: String(localized: "game.guide.moment.treasury_tier.short", defaultValue: "Héritage : \(name).", bundle: .main),
                action: action
            )
        case .flameAtRisk(let days):
            let count = GameCopy.days(days)
            return GuideCopy(
                what: String(localized: "game.guide.moment.flame_at_risk.what", defaultValue: "Ta Flamme est en danger.", bundle: .main),
                means: String(localized: "game.guide.moment.flame_at_risk.means", defaultValue: "Elle s’éteint à minuit si tu ne fais aucun geste : \(count) de Flamme à sauver.", bundle: .main),
                next: String(localized: "game.guide.moment.flame_at_risk.next", defaultValue: "Réalise le premier acte, ou prends une Veilleuse.", bundle: .main),
                short: String(localized: "game.guide.moment.flame_at_risk.short", defaultValue: "Ta Flamme s’éteint à minuit : un geste suffit.", bundle: .main),
                action: action
            )
        case .flameOut(_, let relightPrice, let canRelight):
            let price = GameCopy.meeshes(relightPrice)
            return GuideCopy(
                what: String(localized: "game.guide.moment.flame_out.what", defaultValue: "Ta Flamme s’est éteinte.", bundle: .main),
                means: String(localized: "game.guide.moment.flame_out.means", defaultValue: "Ce qu’elle ajoutait à tes rêves repart de zéro.", bundle: .main),
                next: canRelight
                    ? String(localized: "game.guide.moment.flame_out.next", defaultValue: "Rallume-la sous 48 h pour \(price).", bundle: .main)
                    : String(localized: "game.guide.moment.flame_out.next_new", defaultValue: "Ton prochain geste en allume une nouvelle.", bundle: .main),
                short: canRelight
                    ? String(localized: "game.guide.moment.flame_out.short", defaultValue: "Flamme éteinte : rallume-la pour \(price).", bundle: .main)
                    : String(localized: "game.guide.moment.flame_out.short_new", defaultValue: "Flamme éteinte : un nouveau geste la rallume.", bundle: .main),
                action: action
            )
        case .returnAfterAbsence(let daysAway):
            let count = GameCopy.days(daysAway)
            return GuideCopy(
                what: String(localized: "game.guide.moment.return_after_absence.what", defaultValue: "Content de te revoir !", bundle: .main),
                means: String(localized: "game.guide.moment.return_after_absence.means", defaultValue: "Tu étais parti \(count) : ton rang, ton Héritage et ta gloire t’ont attendu.", bundle: .main),
                next: String(localized: "game.guide.moment.return_after_absence.next", defaultValue: "Commence par le premier acte du rêve.", bundle: .main),
                short: String(localized: "game.guide.moment.return_after_absence.short", defaultValue: "Bon retour : commence par le premier acte.", bundle: .main),
                action: action
            )
        case .level100(let canPrestige):
            return GuideCopy(
                what: String(localized: "game.guide.moment.level_100.what", defaultValue: "Niveau 100 : ta lumière peut renaître !", bundle: .main),
                means: String(localized: "game.guide.moment.level_100.means", defaultValue: "En renaissant, ta lumière redevient Étincelle et ta légende entre dans un nouvel Âge, avec un trophée de tes aïeux. La renaissance est facultative.", bundle: .main),
                next: canPrestige
                    ? String(localized: "game.guide.moment.level_100.next", defaultValue: "Renais, ou laisse ta lumière grandir encore.", bundle: .main)
                    : String(localized: "game.guide.moment.level_100.next_stay", defaultValue: "Laisse ta lumière grandir autant que tu veux.", bundle: .main),
                short: String(localized: "game.guide.moment.level_100.short", defaultValue: "La Renaissance s’ouvre.", bundle: .main),
                action: action
            )
        }
    }

    // MARK: - Intégration

    /// « Frapper coûte 1 221 étincelles : ton niveau baisse d’autant, et tu gagnes +100 de Gloire. » (#10892)
    static func firstMintPossibleDrop(cost: String, glory: String) -> String {
        String(localized: "game.guide.moment.first_mint_possible.means_drop",
               defaultValue: "Frapper fige \(cost) de ta lumière dans une pièce : ton niveau baisse d’autant, et tu gagnes +\(glory) de gloire.", bundle: .main)
    }

    static func step(_ step: OnboardingStep) -> GuideCopy {
        let action = actionLabel(step.action)
        switch step.key {
        case .welcome:
            let what = String(localized: "game.guide.step.welcome.what", defaultValue: "Salut, c’est Mee ! Avec Meo, on t’explique le jeu en sept cartes.", bundle: .main)
            return GuideCopy(
                what: what,
                means: String(localized: "game.guide.step.welcome.means", defaultValue: "Chaque geste utile rapporte des étincelles : écrire, parler, publier, réagir, inviter.", bundle: .main),
                next: String(localized: "game.guide.step.welcome.next", defaultValue: "Fais ton premier geste : je guette tes premières étincelles.", bundle: .main),
                short: what,
                action: action
            )
        case .firstPoints:
            let what = String(localized: "game.guide.step.first_points.what", defaultValue: "Bravo, tes premières étincelles !", bundle: .main)
            return GuideCopy(
                what: what,
                means: String(localized: "game.guide.step.first_points.means", defaultValue: "Tes étincelles forment ta lumière : elles remplissent ton anneau.", bundle: .main),
                next: String(localized: "game.guide.step.first_points.next", defaultValue: "Regarde ton anneau se remplir.", bundle: .main),
                short: what,
                action: action
            )
        case .levels:
            let what = String(localized: "game.guide.step.levels.what", defaultValue: "Vingt états de ta lumière, et des niveaux que ton rang ouvre.", bundle: .main)
            return GuideCopy(
                what: what,
                means: String(localized: "game.guide.step.levels.means", defaultValue: "Chaque niveau demande un peu plus d’étincelles que le précédent.", bundle: .main),
                next: String(localized: "game.guide.step.levels.next", defaultValue: "Au niveau 5, tes aïeux t’envoient ton premier rêve.", bundle: .main),
                short: what,
                action: action
            )
        case .missions:
            let what = String(localized: "game.guide.step.missions.what", defaultValue: "Chaque nuit, un rêve en trois actes, et une Offrande.", bundle: .main)
            return GuideCopy(
                what: what,
                means: String(localized: "game.guide.step.missions.means", defaultValue: "Réalise-les pour faire apparaître l’Offrande et nourrir ta Flamme.", bundle: .main),
                next: String(localized: "game.guide.step.missions.next", defaultValue: "Une Flamme grandit tant que tu reviens.", bundle: .main),
                short: what,
                action: action
            )
        case .flame:
            let what = String(localized: "game.guide.step.flame.what", defaultValue: "Ta Flamme grandit chaque jour où tu agis.", bundle: .main)
            return GuideCopy(
                what: what,
                means: String(localized: "game.guide.step.flame.means", defaultValue: "Chaque jour de Flamme ajoute 2 % d’étincelles à tes rêves, jusqu’à 50 %. Une Veilleuse la garde allumée un jour d’absence.", bundle: .main),
                next: String(localized: "game.guide.step.flame.next", defaultValue: "Tes étincelles peuvent devenir des Meeshes.", bundle: .main),
                short: what,
                action: action
            )
        case .mint:
            let what = String(localized: "game.guide.step.mint.what", defaultValue: "À partir de 1 221 étincelles de ta lumière, on frappe une Meesh.", bundle: .main)
            return GuideCopy(
                what: what,
                means: String(localized: "game.guide.step.mint.means", defaultValue: "Frapper fige une part de ta lumière dans la pièce : ton niveau baisse d’autant, ton rang jamais, et chaque frappe t’apporte de la gloire.", bundle: .main),
                next: String(localized: "game.guide.step.mint.next", defaultValue: "Ta gloire te donne ton nom : ton rang.", bundle: .main),
                short: what,
                action: action
            )
        case .rank:
            let what = String(localized: "game.guide.step.rank.what", defaultValue: "Ton rang ne baisse jamais.", bundle: .main)
            return GuideCopy(
                what: what,
                means: String(localized: "game.guide.step.rank.means", defaultValue: "Frapper, réaliser tes rêves, accomplir des hauts faits : tout fait grandir ta gloire.", bundle: .main),
                next: String(localized: "game.guide.step.rank.next", defaultValue: "Immortalisons ton départ en photo.", bundle: .main),
                short: what,
                action: action
            )
        }
    }

    // MARK: - Les huit règles (conception, partie I)

    struct Rule: Equatable, Identifiable {
        let index: Int
        let title: String
        let body: String
        var id: Int { index }
    }

    static var rules: [Rule] {
        [
            Rule(index: 1,
                 title: String(localized: "game.rules.1.title", defaultValue: "Chaque geste fait jaillir des étincelles", bundle: .main),
                 body: String(localized: "game.rules.1.body", defaultValue: "Écrire, parler, publier, réagir, inviter : chaque vrai échange fait jaillir des étincelles. Une publication en fait jaillir selon qui peut la voir : public, communauté ou amis. Les limites portent sur tes gestes, jamais sur tes étincelles : élans, Flamme et événements en font jaillir plus à chaque geste.", bundle: .main)),
            Rule(index: 2,
                 title: String(localized: "game.rules.2.title", defaultValue: "Les étincelles forment ta lumière", bundle: .main),
                 body: String(localized: "game.rules.2.body", defaultValue: "Ensemble, tes étincelles forment ta lumière, et ton niveau se lit sur elle : une frappe en fige une part, donc le fait baisser. Un million d’étincelles pour le niveau 100, et une épreuve tous les dix niveaux : tant qu’elle n’est pas réussie, ta lumière attend. Vingt états. Les niveaux montent jusqu’à 499 ; le rang Ambassadeur ouvre jusqu’à 1 000, et le rang Oracle les ouvre sans limite. Chaque niveau demande un peu plus que le précédent.", bundle: .main)),
            Rule(index: 3,
                 title: String(localized: "game.rules.3.title", defaultValue: "On frappe des Meeshes", bundle: .main),
                 body: String(localized: "game.rules.3.body", defaultValue: "Une Meesh se frappe à la main : une part de ta lumière s’y fige. Pour les dix premières, cette part est de 1 221 étincelles, puis elle grandit de 30 % toutes les dix frappes.", bundle: .main)),
            Rule(index: 4,
                 title: String(localized: "game.rules.4.title", defaultValue: "Frapper fige ta lumière", bundle: .main),
                 body: String(localized: "game.rules.4.body", defaultValue: "La part figée quitte ta lumière : ton niveau baisse d’autant, ton rang jamais, et chaque frappe fait grandir ta gloire. Ce que tu as reçu reste reçu. Aucune médaille ne s’éteint ni ne redescend.", bundle: .main)),
            Rule(index: 5,
                 title: String(localized: "game.rules.5.title", defaultValue: "Le rang ne recule jamais", bundle: .main),
                 body: String(localized: "game.rules.5.body", defaultValue: "Chaque frappe, chaque niveau atteint pour la première fois, chaque haut fait fait grandir ta gloire. La gloire te donne ton rang.", bundle: .main)),
            Rule(index: 6,
                 title: String(localized: "game.rules.6.title", defaultValue: "L’Héritage se garde ou se dépense", bundle: .main),
                 body: String(localized: "game.rules.6.body", defaultValue: "Garder ses Meeshes fait grandir l’héritage, de la Bourse à la Réserve. Les dépenser veille sur la Flamme ou offre des parures.", bundle: .main)),
            Rule(index: 7,
                 title: String(localized: "game.rules.7.title", defaultValue: "Chaque jour compte", bundle: .main),
                 body: String(localized: "game.rules.7.body", defaultValue: "Un rêve en trois actes chaque nuit, une Offrande, une Flamme qui grandit tant qu’on revient.", bundle: .main)),
            Rule(index: 8,
                 title: String(localized: "game.rules.8.title", defaultValue: "Les aïeux se manifestent", bundle: .main),
                 body: String(localized: "game.rules.8.body", defaultValue: "À chaque évolution, tes aïeux se manifestent : chaque signe s’immortalise en photo avec Mee et Meo dans ta Chronique.", bundle: .main)),
        ]
    }
}

// MARK: - « Chaque concept, en clair » (#10540)
//
// MIROIR de `rulesGlossary` (`apps/web/src/lib/view/game-rules-copy.ts`) : aucun concept que Progression affiche
// n'est absent du carnet. Les quinze concepts de la liste partagée, et ce que Progression montre sans en faire une
// fiche — le coffre, le trésor, les étapes des niveaux, le Vent arrière, la mission en duo —, chacun rangé à la suite
// du concept qu'il complète. Chaque entrée dit ce que c'est, à quoi ça sert, comment ça se gagne et comment s'en servir.

/// Une entrée du glossaire du carnet : un concept de Progression, ou un de ses compléments.
enum GameRulesGlossaryKey: Hashable {
    case concept(ProgressionConcept)
    case chest
    case treasury
    case steps
    case tailwind
    case duo

    /// Le segment de la clé du catalogue (`game.rules.concept.<segment>.body`) et de l'identifiant d'accessibilité.
    var rawValue: String {
        switch self {
        case .concept(let concept): concept.rawValue
        case .chest: "chest"
        case .treasury: "treasury"
        case .steps: "steps"
        case .tailwind: "tailwind"
        case .duo: "duo"
        }
    }
}

enum GameRulesGlossary {

    struct Entry: Equatable, Identifiable {
        let key: GameRulesGlossaryKey
        let name: String
        let body: String
        var id: String { key.rawValue }
    }

    static var sectionTitle: String { String(localized: "game.rules.section_concepts", defaultValue: "Chaque concept, en clair", bundle: .main) }

    static var intro: String { String(localized: "game.rules.concepts_intro", defaultValue: "Tout ce que le jeu affiche, un par un : ce que c’est, à quoi ça sert, comment ça se gagne et comment t’en servir.", bundle: .main) }

    /// Ce qui suit chaque concept : un `switch` exhaustif — un concept ajouté à la liste partagée sans décision ici
    /// ne compile pas.
    static func extras(after concept: ProgressionConcept) -> [GameRulesGlossaryKey] {
        switch concept {
        case .level: [.steps]
        case .meesh: [.treasury]
        case .missions: [.chest]
        case .season: [.duo]
        case .elans: [.tailwind]
        case .points, .glory, .flame, .league, .prestige, .badges, .defis, .succes, .showcase, .atlas: []
        }
    }

    static var keys: [GameRulesGlossaryKey] {
        ProgressionConcept.allCases.flatMap { [.concept($0)] + extras(after: $0) }
    }

    static var entries: [Entry] {
        keys.map { Entry(key: $0, name: name($0), body: body($0)) }
    }

    static func name(_ key: GameRulesGlossaryKey) -> String {
        switch key {
        case .concept(let concept): ConceptText.name(concept)
        case .chest: String(localized: "game.rules.concept.chest.name", defaultValue: "L’Offrande", bundle: .main)
        case .treasury: String(localized: "game.rules.concept.treasury.name", defaultValue: "L’Héritage", bundle: .main)
        case .steps: String(localized: "game.rules.concept.steps.name", defaultValue: "Les épreuves", bundle: .main)
        case .tailwind: String(localized: "game.rules.concept.tailwind.name", defaultValue: "Vent arrière", bundle: .main)
        case .duo: String(localized: "game.rules.concept.duo.name", defaultValue: "L’Alliance", bundle: .main)
        }
    }

    static func body(_ key: GameRulesGlossaryKey) -> String {
        switch key {
        case .concept(.level): String(localized: "game.rules.concept.level.body", defaultValue: "Le chiffre de ton anneau, lu sur ta lumière. Il ouvre le rêve (niveau 5), la joute (10), l’alliance (20) et la renaissance (100). Il monte quand ta lumière atteint le seuil suivant, et baisse quand une frappe en fige une part. La renaissance le remet à 1.", bundle: .main)
        case .concept(.points): String(localized: "game.rules.concept.points.body", defaultValue: "Chaque vrai échange fait jaillir des étincelles ; ensemble, elles forment ta lumière. Ta lumière fait ton niveau et frappe les Meeshes. Les étincelles reçues depuis toujours restent reçues.", bundle: .main)
        case .concept(.meesh): String(localized: "game.rules.concept.meesh.body", defaultValue: "La pièce rare de Meeshy, numérotée : une part de ta lumière s’y fige quand tu la frappes. Garde-la pour ton héritage, ou dépense-la : une Veilleuse pour ta Flamme, un acte à changer, le Sceau du voyage. La part figée grandit de 30 % toutes les dix frappes.", bundle: .main)
        case .concept(.glory): String(localized: "game.rules.concept.glory.body", defaultValue: "Ta gloire grandit et ne recule jamais : elle te donne ton rang. Elle grandit quand tu frappes, quand ta lumière atteint un niveau pour la première fois, quand tu accomplis un haut fait, quand tu gravis un cercle de joute, quand tu achèves un voyage. Ton rang ouvre ta lumière au-delà du niveau 499.", bundle: .main)
        case .concept(.flame): String(localized: "game.rules.concept.flame.body", defaultValue: "Le feu que tes aïeux te confient, entretenu chaque jour par au moins un geste. Chaque jour de Flamme ajoute 2 % aux étincelles de tes rêves, jusqu’à 50 %. Une Veilleuse la garde un jour d’absence ; éteinte, elle se rallume avec des Meeshes pendant 48 h.", bundle: .main)
        case .concept(.missions): String(localized: "game.rules.concept.missions.body", defaultValue: "Chaque nuit, tes aïeux t’envoient un rêve en trois actes, ouvert au niveau 5. Chaque acte réalisé fait jaillir des étincelles ; les trois réalisés font apparaître l’Offrande. Tu peux changer un acte par jour avec une Meesh.", bundle: .main)
        case .concept(.league): String(localized: "game.rules.concept.league.body", defaultValue: "Le classement de la semaine, ouvert au niveau 10 : trente héros s’y mesurent sous leur nom de joute. Tes étincelles de la semaine font ta place : les 7 premiers gravissent le cercle suivant, les 5 derniers redescendent, et tout repart de zéro le lundi. La Joute des amis reste toujours ouverte.", bundle: .main)
        case .concept(.season): String(localized: "game.rules.concept.season.body", defaultValue: "Un voyage de huit semaines en terre de langue, avec 40 haltes gratuites. Les actes de ton rêve et l’alliance te font avancer de quelques pas ; quatre pas mènent à la halte suivante, que tu réclames une à une. Le voyage fini donne la coupe du voyage.", bundle: .main)
        case .concept(.prestige): String(localized: "game.rules.concept.prestige.body", defaultValue: "Une renaissance facultative, offerte au niveau 100, cinq fois au plus. Ton niveau repart à 1 et ta lumière à zéro : elle redevient Étincelle, et ta légende entre dans un nouvel Âge. Tes étincelles reçues depuis toujours et ta plus haute lumière restent. Tes aïeux t’offrent un trophée numéroté et de la gloire. Ton rang, tes Meeshes et ta Flamme restent.", bundle: .main)
        case .concept(.elans): String(localized: "game.rules.concept.elans.body", defaultValue: "Un multiplicateur d’étincelles. Il s’allume quand tu es actif dans plusieurs familles de gestes ces jours-ci : contenu, commentaires, conversations, outils, lien social. Tant qu’il tient, chaque geste fait jaillir plus d’étincelles.", bundle: .main)
        case .concept(.badges): String(localized: "game.rules.concept.badges.body", defaultValue: "Vingt médailles, une par geste précis. Chacune gravit sept paliers, du cuivre au prisme, à force de refaire son geste. Une frappe n’en éteint aucune et n’en fait redescendre aucune.", bundle: .main)
        case .concept(.defis): String(localized: "game.rules.concept.defis.body", defaultValue: "Des paliers chiffrés dans chaque famille de gestes. Atteins le nombre demandé : le palier est franchi et le suivant s’ouvre.", bundle: .main)
        case .concept(.succes): String(localized: "game.rules.concept.succes.body", defaultValue: "Des distinctions rares, accomplies d’un coup quand tu réunis ce qu’elles demandent. Chaque haut fait fait grandir ta gloire : plus il est rare, plus elle grandit.", bundle: .main)
        case .concept(.showcase): String(localized: "game.rules.concept.showcase.body", defaultValue: "L’étagère de tes trophées : coupes de joute et de voyage, trophées de renaissance et de Flamme. Un trophée ne rapporte rien : il se garde et se montre. Tu choisis l’ordre et qui les voit.", bundle: .main)
        case .concept(.atlas): String(localized: "game.rules.concept.atlas.body", defaultValue: "Ton passeport des langues. Un tampon se pose quand tu as envoyé un message et reçu un message dans une langue. Il est privé par défaut : tu choisis qui le voit.", bundle: .main)
        case .chest: String(localized: "game.rules.concept.chest.body", defaultValue: "Elle apparaît quand les trois actes du rêve sont réalisés. C’est un présent voilé : des étincelles selon tes actes, de la gloire, parfois une prime en étincelles, un fragment d’étoile ou une Veilleuse.", bundle: .main)
        case .treasury: String(localized: "game.rules.concept.treasury.body", defaultValue: "Les Meeshes que tu gardes pour ta lignée. Six contenants, de la Bourse à la Réserve, visibles sur ton profil. L’héritage grandit quand tu gardes tes Meeshes et baisse quand tu les dépenses.", bundle: .main)
        case .steps: String(localized: "game.rules.concept.steps.body", defaultValue: "De 10 à 100, tous les dix niveaux, tes aïeux demandent une épreuve simple : frapper une Meesh, réaliser des rêves, tenir une Flamme, atteindre un rang. Tant qu’elle n’est pas réussie, ta lumière attend ; réussie, le niveau monte d’un coup.", bundle: .main)
        case .tailwind: String(localized: "game.rules.concept.tailwind.body", defaultValue: "+25 % sur les étincelles de tes gestes tant que ton niveau est 7 niveaux ou plus sous ta plus haute lumière. Il s’arrête dès que l’écart retombe à 6.", bundle: .main)
        case .duo: String(localized: "game.rules.concept.duo.body", defaultValue: "Une fois par semaine, une alliance avec un ami accepté, ouverte au niveau 20 pour vous deux. Si chacun réalise sa part, la récompense double. Elle fait aussi avancer ton voyage de quelques pas.", bundle: .main)
        }
    }
}
