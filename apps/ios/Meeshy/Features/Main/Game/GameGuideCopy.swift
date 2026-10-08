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
        case .seeLevel: String(localized: "game.guide.action.see_level", defaultValue: "Voir mon niveau", bundle: .main)
        case .seeMissions: String(localized: "game.guide.action.see_missions", defaultValue: "Voir les missions", bundle: .main)
        case .seeFlame: String(localized: "game.guide.action.see_flame", defaultValue: "Voir ma Flamme", bundle: .main)
        case .seeMeeshes: String(localized: "game.guide.action.see_meeshes", defaultValue: "Voir les Meeshes", bundle: .main)
        case .seeRank: String(localized: "game.guide.action.see_rank", defaultValue: "Voir mon rang", bundle: .main)
        case .takeStartPhoto: String(localized: "game.guide.action.take_start_photo", defaultValue: "Prendre la photo de départ", bundle: .main)
        case .seeProgress: String(localized: "game.guide.action.see_progress", defaultValue: "Voir ma progression", bundle: .main)
        case .seeNextTier: String(localized: "game.guide.action.see_next_tier", defaultValue: "Voir le palier suivant", bundle: .main)
        case .openFirstMission: String(localized: "game.guide.action.open_first_mission", defaultValue: "Ouvrir ma première mission", bundle: .main)
        case .mintOrClimb: String(localized: "game.guide.action.mint_or_climb", defaultValue: "Voir l’aperçu de frappe", bundle: .main)
        case .regainLevels: String(localized: "game.guide.action.regain_levels", defaultValue: "Reprendre mes niveaux", bundle: .main)
        case .relightBadge: String(localized: "game.guide.action.relight_badge", defaultValue: "Voir mes badges", bundle: .main)
        case .seeMintPreview: String(localized: "game.guide.action.see_mint_preview", defaultValue: "Voir l’aperçu de frappe", bundle: .main)
        case .takePhoto: String(localized: "game.guide.action.take_photo", defaultValue: "Immortaliser ce moment", bundle: .main)
        case .keepOrSpend: String(localized: "game.guide.action.keep_or_spend", defaultValue: "Voir mon trésor", bundle: .main)
        case .doEasyMissionOrFreeze: String(localized: "game.guide.action.do_easy_mission_or_freeze", defaultValue: "Voir mes missions", bundle: .main)
        case .relightFlame: String(localized: "game.guide.action.relight_flame", defaultValue: "Rallumer la Flamme", bundle: .main)
        case .doEasiestMission: String(localized: "game.guide.action.do_easiest_mission", defaultValue: "Voir la mission la plus facile", bundle: .main)
        case .prestigeOrStay: String(localized: "game.guide.action.prestige_or_stay", defaultValue: "Voir mon niveau", bundle: .main)
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
                what: String(localized: "game.guide.moment.first_level.what", defaultValue: "Ton premier niveau est gagné.", bundle: .main),
                means: String(localized: "game.guide.moment.first_level.means", defaultValue: "Tes points remplissent l’anneau : quand il est plein, tu montes d’un niveau.", bundle: .main),
                next: String(localized: "game.guide.moment.first_level.next", defaultValue: "Encore \(points) pour le niveau \(nextLevel).", bundle: .main),
                short: String(localized: "game.guide.moment.first_level.short", defaultValue: "Niveau \(GameCopy.formatCount(level)) : encore \(points) pour le suivant.", bundle: .main),
                action: action
            )
        case .newTier(let tier, let nextTierLevel):
            let name = GameCopy.tierName(tier)
            return GuideCopy(
                what: String(localized: "game.guide.moment.new_tier.what", defaultValue: "Tu entres dans \(name) !", bundle: .main),
                means: String(localized: "game.guide.moment.new_tier.means", defaultValue: "Les paliers jalonnent ta route : dix niveaux chacun jusqu’au 100, puis cent.", bundle: .main),
                next: nextTierLevel.map {
                    String(localized: "game.guide.moment.new_tier.next", defaultValue: "Le palier suivant s’ouvre au niveau \(GameCopy.formatCount($0)).", bundle: .main)
                } ?? String(localized: "game.guide.moment.new_tier.next_last", defaultValue: "Tu es au dernier palier.", bundle: .main),
                short: String(localized: "game.guide.moment.new_tier.short", defaultValue: "Palier \(name) atteint.", bundle: .main),
                action: action
            )
        case .missionsUnlocked:
            return GuideCopy(
                what: String(localized: "game.guide.moment.missions_unlocked.what", defaultValue: "Les missions sont débloquées.", bundle: .main),
                means: String(localized: "game.guide.moment.missions_unlocked.means", defaultValue: "Trois missions par jour, et un coffre à ouvrir quand elles sont faites.", bundle: .main),
                next: String(localized: "game.guide.moment.missions_unlocked.next", defaultValue: "Ouvre ta première mission.", bundle: .main),
                short: String(localized: "game.guide.moment.missions_unlocked.short", defaultValue: "Tes missions du jour t’attendent.", bundle: .main),
                action: action
            )
        case .firstMintPossible(let price, let levelsLost, let gloryGain):
            let cost = GameCopy.points(price)
            let glory = GameCopy.formatCount(gloryGain)
            let means = levelsLost == 0
                ? String(localized: "game.guide.moment.first_mint_possible.means_free", defaultValue: "Frapper coûte \(cost), sans te faire perdre un niveau, et rapporte +\(glory) de Gloire.", bundle: .main)
                : String(localized: "game.guide.moment.first_mint_possible.means", defaultValue: "Frapper coûte \(cost), soit \(GameCopy.levels(levelsLost)), et rapporte +\(glory) de Gloire.", bundle: .main)
            return GuideCopy(
                what: String(localized: "game.guide.moment.first_mint_possible.what", defaultValue: "Tu peux frapper ta première Meesh.", bundle: .main),
                means: means,
                next: String(localized: "game.guide.moment.first_mint_possible.next", defaultValue: "Frappe maintenant, ou grimpe d’abord.", bundle: .main),
                short: String(localized: "game.guide.moment.first_mint_possible.short", defaultValue: "Une Meesh se frappe pour \(cost).", bundle: .main),
                action: action
            )
        case .firstMint(let levelBefore, let levelAfter, let tailwindUntilLevel):
            let before = GameCopy.formatCount(levelBefore)
            let after = GameCopy.formatCount(levelAfter)
            let until = GameCopy.formatCount(tailwindUntilLevel)
            return GuideCopy(
                what: String(localized: "game.guide.moment.first_mint.what", defaultValue: "Tchak ! Ta première Meesh est frappée.", bundle: .main),
                means: String(localized: "game.guide.moment.first_mint.means", defaultValue: "Ton niveau est passé de \(before) à \(after) : c’est la règle. Le Vent arrière est actif.", bundle: .main),
                next: String(localized: "game.guide.moment.first_mint.next", defaultValue: "Reprends tes niveaux plus vite : tes points comptent 25 % de plus jusqu’au niveau \(until).", bundle: .main),
                short: String(localized: "game.guide.moment.first_mint.short", defaultValue: "Niveau \(before) → \(after). Le Vent arrière t’aide jusqu’au niveau \(until).", bundle: .main),
                action: action
            )
        case .badgeExtinguished(let missingActions):
            let count = GameCopy.actions(missingActions)
            return GuideCopy(
                what: String(localized: "game.guide.moment.badge_extinguished.what", defaultValue: "Un badge s’est éteint.", bundle: .main),
                means: String(localized: "game.guide.moment.badge_extinguished.means", defaultValue: "Il est devenu une empreinte : rien n’est perdu pour toujours.", bundle: .main),
                next: String(localized: "game.guide.moment.badge_extinguished.next", defaultValue: "Encore \(count) pour le rallumer.", bundle: .main),
                short: String(localized: "game.guide.moment.badge_extinguished.short", defaultValue: "Un badge s’est éteint : \(count) pour le rallumer.", bundle: .main),
                action: action
            )
        case .priceRises(let nextPrice):
            let cost = GameCopy.points(nextPrice)
            return GuideCopy(
                what: String(localized: "game.guide.moment.price_rises.what", defaultValue: "Les Meeshes deviennent plus rares.", bundle: .main),
                means: String(localized: "game.guide.moment.price_rises.means", defaultValue: "Plus on en frappe, plus la suivante coûte.", bundle: .main),
                next: String(localized: "game.guide.moment.price_rises.next", defaultValue: "La prochaine coûte \(cost).", bundle: .main),
                short: String(localized: "game.guide.moment.price_rises.short", defaultValue: "La prochaine Meesh coûte \(cost).", bundle: .main),
                action: action
            )
        case .newRank(let rank, let division, _, let gloryMissing):
            let name = GameCopy.rankLabel(rank, division5: division)
            return GuideCopy(
                what: String(localized: "game.guide.moment.new_rank.what", defaultValue: "Nouveau rang : \(name).", bundle: .main),
                means: String(localized: "game.guide.moment.new_rank.means", defaultValue: "Ta Gloire a passé un seuil, et elle ne redescend pas.", bundle: .main),
                next: gloryMissing.map {
                    String(localized: "game.guide.moment.new_rank.next", defaultValue: "Encore \(GameCopy.formatCount($0)) de Gloire pour la division suivante. Immortalise ce moment.", bundle: .main)
                } ?? String(localized: "game.guide.moment.new_rank.next_top", defaultValue: "C’est le rang le plus haut. Immortalise ce moment.", bundle: .main),
                short: String(localized: "game.guide.moment.new_rank.short", defaultValue: "Tu es \(name).", bundle: .main),
                action: action
            )
        case .treasuryTier(let tier, let nextTierMissing):
            let name = GameCopy.treasuryName(tier)
            return GuideCopy(
                what: String(localized: "game.guide.moment.treasury_tier.what", defaultValue: "Ton trésor atteint le palier \(name).", bundle: .main),
                means: String(localized: "game.guide.moment.treasury_tier.means", defaultValue: "Ton trésor est visible sur ton profil.", bundle: .main),
                next: nextTierMissing.map {
                    String(localized: "game.guide.moment.treasury_tier.next", defaultValue: "Garde \(GameCopy.meeshes($0)) de plus pour le palier suivant, ou dépense.", bundle: .main)
                } ?? String(localized: "game.guide.moment.treasury_tier.next_top", defaultValue: "Garde-le, ou dépense tes Meeshes.", bundle: .main),
                short: String(localized: "game.guide.moment.treasury_tier.short", defaultValue: "Trésor : palier \(name).", bundle: .main),
                action: action
            )
        case .flameAtRisk(let days):
            let count = GameCopy.days(days)
            return GuideCopy(
                what: String(localized: "game.guide.moment.flame_at_risk.what", defaultValue: "Ta Flamme est en danger.", bundle: .main),
                means: String(localized: "game.guide.moment.flame_at_risk.means", defaultValue: "Elle s’éteint à minuit si tu ne fais aucun geste : \(count) de série à sauver.", bundle: .main),
                next: String(localized: "game.guide.moment.flame_at_risk.next", defaultValue: "Fais une mission facile, ou achète un gel.", bundle: .main),
                short: String(localized: "game.guide.moment.flame_at_risk.short", defaultValue: "Ta Flamme s’éteint à minuit : un geste suffit.", bundle: .main),
                action: action
            )
        case .flameOut(_, let relightPrice, let canRelight):
            let price = GameCopy.meeshes(relightPrice)
            return GuideCopy(
                what: String(localized: "game.guide.moment.flame_out.what", defaultValue: "Ta Flamme s’est éteinte.", bundle: .main),
                means: String(localized: "game.guide.moment.flame_out.means", defaultValue: "Le Bonus de Flamme repart à zéro.", bundle: .main),
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
                means: String(localized: "game.guide.moment.return_after_absence.means", defaultValue: "Tu étais parti \(count) : ton rang, ton trésor et ta Gloire sont restés là où tu les as laissés.", bundle: .main),
                next: String(localized: "game.guide.moment.return_after_absence.next", defaultValue: "Commence par la mission la plus facile du jour.", bundle: .main),
                short: String(localized: "game.guide.moment.return_after_absence.short", defaultValue: "Bon retour : commence par la mission la plus facile.", bundle: .main),
                action: action
            )
        case .level100(let canPrestige):
            return GuideCopy(
                what: String(localized: "game.guide.moment.level_100.what", defaultValue: "Niveau 100 : le Prestige s’ouvre !", bundle: .main),
                means: String(localized: "game.guide.moment.level_100.means", defaultValue: "Le Prestige remet ton niveau à 1 et te donne une étoile et un trophée. Il est facultatif.", bundle: .main),
                next: canPrestige
                    ? String(localized: "game.guide.moment.level_100.next", defaultValue: "Passe en Prestige, ou continue de monter.", bundle: .main)
                    : String(localized: "game.guide.moment.level_100.next_stay", defaultValue: "Continue de monter autant que tu veux.", bundle: .main),
                short: String(localized: "game.guide.moment.level_100.short", defaultValue: "Le Prestige s’ouvre.", bundle: .main),
                action: action
            )
        }
    }

    // MARK: - Intégration

    static func step(_ step: OnboardingStep) -> GuideCopy {
        let action = actionLabel(step.action)
        switch step.key {
        case .welcome:
            let what = String(localized: "game.guide.step.welcome.what", defaultValue: "Salut, c’est Mee ! Avec Meo, on t’explique le jeu en sept cartes.", bundle: .main)
            return GuideCopy(
                what: what,
                means: String(localized: "game.guide.step.welcome.means", defaultValue: "Chaque geste utile rapporte des points : écrire, parler, publier, réagir, inviter.", bundle: .main),
                next: String(localized: "game.guide.step.welcome.next", defaultValue: "Fais ton premier geste, je compte tes points.", bundle: .main),
                short: what,
                action: action
            )
        case .firstPoints:
            let what = String(localized: "game.guide.step.first_points.what", defaultValue: "Bravo, tes premiers points !", bundle: .main)
            return GuideCopy(
                what: what,
                means: String(localized: "game.guide.step.first_points.means", defaultValue: "Les points font le niveau : ils remplissent ton anneau.", bundle: .main),
                next: String(localized: "game.guide.step.first_points.next", defaultValue: "Regarde ton anneau se remplir.", bundle: .main),
                short: what,
                action: action
            )
        case .levels:
            let what = String(localized: "game.guide.step.levels.what", defaultValue: "Vingt paliers, et des niveaux que ton rang ouvre.", bundle: .main)
            return GuideCopy(
                what: what,
                means: String(localized: "game.guide.step.levels.means", defaultValue: "Chaque niveau demande un peu plus de points que le précédent.", bundle: .main),
                next: String(localized: "game.guide.step.levels.next", defaultValue: "Les missions s’ouvrent au niveau 5.", bundle: .main),
                short: what,
                action: action
            )
        case .missions:
            let what = String(localized: "game.guide.step.missions.what", defaultValue: "Chaque jour, trois missions et un coffre.", bundle: .main)
            return GuideCopy(
                what: what,
                means: String(localized: "game.guide.step.missions.means", defaultValue: "Fais-les pour ouvrir le coffre et nourrir ta Flamme.", bundle: .main),
                next: String(localized: "game.guide.step.missions.next", defaultValue: "Une Flamme grandit tant que tu reviens.", bundle: .main),
                short: what,
                action: action
            )
        case .flame:
            let what = String(localized: "game.guide.step.flame.what", defaultValue: "Ta Flamme grandit chaque jour où tu agis.", bundle: .main)
            return GuideCopy(
                what: what,
                means: String(localized: "game.guide.step.flame.means", defaultValue: "Chaque jour de série ajoute 2 % à tes récompenses de mission, jusqu’à 50 %. Un gel couvre un jour manqué.", bundle: .main),
                next: String(localized: "game.guide.step.flame.next", defaultValue: "Tes points peuvent devenir des Meeshes.", bundle: .main),
                short: what,
                action: action
            )
        case .mint:
            let what = String(localized: "game.guide.step.mint.what", defaultValue: "À partir de 1 221 points, on frappe une Meesh.", bundle: .main)
            return GuideCopy(
                what: what,
                means: String(localized: "game.guide.step.mint.means", defaultValue: "Les points dépensés quittent ton niveau, mais ton rang ne baisse jamais : chaque frappe ajoute de la Gloire.", bundle: .main),
                next: String(localized: "game.guide.step.mint.next", defaultValue: "La Gloire donne le rang.", bundle: .main),
                short: what,
                action: action
            )
        case .rank:
            let what = String(localized: "game.guide.step.rank.what", defaultValue: "Ton rang ne baisse jamais.", bundle: .main)
            return GuideCopy(
                what: what,
                means: String(localized: "game.guide.step.rank.means", defaultValue: "Frapper, battre des records, décrocher des succès : tout ajoute de la Gloire.", bundle: .main),
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
                 title: String(localized: "game.rules.1.title", defaultValue: "Chaque geste rapporte", bundle: .main),
                 body: String(localized: "game.rules.1.body", defaultValue: "Écrire, parler, publier, réagir, inviter : chaque action utile donne des points. Une publication rapporte selon qui peut la voir : public, communauté ou amis. Les limites comptent tes gestes, jamais tes points : bonus, Flamme et événements augmentent ce que chaque geste rapporte.", bundle: .main)),
            Rule(index: 2,
                 title: String(localized: "game.rules.2.title", defaultValue: "Les points font le niveau", bundle: .main),
                 body: String(localized: "game.rules.2.body", defaultValue: "Un million de points pour le niveau 100, et une étape par dizaine : sans elle, le niveau attend. Vingt paliers. Les niveaux montent jusqu’à 499 ; le rang Ambassadeur ouvre jusqu’à 1 000, et le rang Oracle les ouvre sans limite. Chaque niveau demande un peu plus que le précédent.", bundle: .main)),
            Rule(index: 3,
                 title: String(localized: "game.rules.3.title", defaultValue: "On frappe des Meeshes", bundle: .main),
                 body: String(localized: "game.rules.3.body", defaultValue: "À partir de 1 221 points, on frappe une Meesh à la main. Le prix monte avec le nombre de Meeshes déjà frappées.", bundle: .main)),
            Rule(index: 4,
                 title: String(localized: "game.rules.4.title", defaultValue: "Frapper fait redescendre", bundle: .main),
                 body: String(localized: "game.rules.4.body", defaultValue: "Les points dépensés quittent le niveau. Les badges qu’ils tenaient peuvent s’éteindre.", bundle: .main)),
            Rule(index: 5,
                 title: String(localized: "game.rules.5.title", defaultValue: "Le rang ne baisse jamais", bundle: .main),
                 body: String(localized: "game.rules.5.body", defaultValue: "Chaque frappe, chaque record, chaque succès ajoute de la Gloire. La Gloire donne le rang.", bundle: .main)),
            Rule(index: 6,
                 title: String(localized: "game.rules.6.title", defaultValue: "Le trésor se garde ou se dépense", bundle: .main),
                 body: String(localized: "game.rules.6.body", defaultValue: "Garder ses Meeshes fait monter le trésor. Les dépenser protège la Flamme ou offre des cosmétiques.", bundle: .main)),
            Rule(index: 7,
                 title: String(localized: "game.rules.7.title", defaultValue: "Chaque jour compte", bundle: .main),
                 body: String(localized: "game.rules.7.body", defaultValue: "Trois missions, un coffre, une Flamme qui grandit tant qu’on revient.", bundle: .main)),
            Rule(index: 8,
                 title: String(localized: "game.rules.8.title", defaultValue: "On garde une trace", bundle: .main),
                 body: String(localized: "game.rules.8.body", defaultValue: "Chaque grand moment se photographie avec Mee et Meo dans le carnet de progression.", bundle: .main)),
        ]
    }
}
