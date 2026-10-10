import Foundation
import MeeshySDK

// MARK: - Ce que disent les concepts de Progression (#9564)
//
// Une SEULE source de texte par concept : la carte de la première page dit « à quoi ça sert » (`why`) et « comment
// ça marche » (`how`) ; la fiche reprend ces deux phrases sous « C’est quoi ? » et les DÉVELOPPE par deux conseils
// (`tip1`, `tip2`) — jamais deux formulations du même concept. Les clés `game.concept.<clé>.name|why|how|tip.1|tip.2`,
// `game.fiche.*` sont celles du catalogue du web
// (`apps/web/src/lib/interface-catalogs/catalog-game-<langue>.ts`), dans les sept langues, phrase pour phrase : une
// demande porteur n'est jamais un écart de plateforme. Chaque accesseur est une CLÉ LITTÉRALE, que la garde du
// catalogue sait lire. Les nombres arrivent déjà formatés (`GameCopy.formatCount`).
enum ConceptText {

    /// Le nom du concept, tel que la carte, la fiche et le tableau de bord le disent.
    static func name(_ concept: ProgressionConcept) -> String {
        switch concept {
        case .level: String(localized: "game.concept.level.name", defaultValue: "Niveau", bundle: .main)
        case .points: String(localized: "game.concept.points.name", defaultValue: "Points", bundle: .main)
        case .meesh: String(localized: "game.concept.meesh.name", defaultValue: "Meeshes", bundle: .main)
        case .glory: String(localized: "game.concept.glory.name", defaultValue: "Gloire", bundle: .main)
        case .flame: String(localized: "game.concept.flame.name", defaultValue: "Flamme", bundle: .main)
        case .missions: String(localized: "game.concept.missions.name", defaultValue: "Missions du jour", bundle: .main)
        case .league: String(localized: "game.concept.league.name", defaultValue: "Ligue", bundle: .main)
        case .season: String(localized: "game.concept.season.name", defaultValue: "Saison", bundle: .main)
        case .prestige: String(localized: "game.concept.prestige.name", defaultValue: "Prestige", bundle: .main)
        case .elans: String(localized: "game.concept.elans.name", defaultValue: "Élans", bundle: .main)
        case .badges: String(localized: "game.concept.badges.name", defaultValue: "Badges", bundle: .main)
        case .defis: String(localized: "game.concept.defis.name", defaultValue: "Défis", bundle: .main)
        case .succes: String(localized: "game.concept.succes.name", defaultValue: "Succès", bundle: .main)
        case .showcase: String(localized: "game.concept.showcase.name", defaultValue: "Vitrine", bundle: .main)
        case .atlas: String(localized: "game.concept.atlas.name", defaultValue: "Atlas", bundle: .main)
        }
    }

    /// À quoi ça sert — UNE phrase, lisible à 13 ans. La carte la dit, la fiche la reprend sous « C’est quoi ? ».
    static func why(_ concept: ProgressionConcept) -> String {
        switch concept {
        case .level: String(localized: "game.concept.level.why", defaultValue: "Ton niveau montre le chemin que tu as parcouru sur Meeshy.", bundle: .main)
        case .points: String(localized: "game.concept.points.why", defaultValue: "Les points font monter ton niveau et servent à frapper des Meeshes.", bundle: .main)
        case .meesh: String(localized: "game.concept.meesh.why", defaultValue: "La Meesh est la pièce rare de Meeshy : elle se garde ou se dépense.", bundle: .main)
        case .glory: String(localized: "game.concept.glory.why", defaultValue: "La Gloire donne ton rang, et ton rang ne baisse jamais.", bundle: .main)
        case .flame: String(localized: "game.concept.flame.why", defaultValue: "Ta Flamme compte tes jours d’affilée et augmente tes gains de mission.", bundle: .main)
        case .missions: String(localized: "game.concept.missions.why", defaultValue: "Les missions te donnent un but chaque jour, et des points en plus.", bundle: .main)
        case .league: String(localized: "game.concept.league.why", defaultValue: "La ligue te mesure chaque semaine à 29 autres joueurs.", bundle: .main)
        case .season: String(localized: "game.concept.season.why", defaultValue: "La saison est un parcours de huit semaines, avec une coupe au bout.", bundle: .main)
        case .prestige: String(localized: "game.concept.prestige.why", defaultValue: "Le Prestige récompense ceux qui atteignent le niveau 100.", bundle: .main)
        case .elans: String(localized: "game.concept.elans.why", defaultValue: "Un élan multiplie les points de tes prochains gestes.", bundle: .main)
        case .badges: String(localized: "game.concept.badges.why", defaultValue: "Un badge montre ce que tu fais le plus sur Meeshy.", bundle: .main)
        case .defis: String(localized: "game.concept.defis.why", defaultValue: "Les défis sont des paliers à franchir, l’un après l’autre.", bundle: .main)
        case .succes: String(localized: "game.concept.succes.why", defaultValue: "Un succès marque un moment rare de ton histoire sur Meeshy.", bundle: .main)
        case .showcase: String(localized: "game.concept.showcase.why", defaultValue: "Ta vitrine expose les trophées que tu as gagnés.", bundle: .main)
        case .atlas: String(localized: "game.concept.atlas.why", defaultValue: "L’Atlas garde un tampon pour chaque langue dans laquelle tu as échangé.", bundle: .main)
        }
    }

    /// Comment ça marche — UNE phrase. La carte la dit, la fiche la reprend à la suite du pourquoi.
    static func how(_ concept: ProgressionConcept) -> String {
        switch concept {
        case .level: String(localized: "game.concept.level.how", defaultValue: "Tes points remplissent l’anneau : plein, il te fait monter d’un niveau.", bundle: .main)
        case .points: String(localized: "game.concept.points.how", defaultValue: "Chaque geste utile en rapporte : écrire, parler, publier, réagir.", bundle: .main)
        case .meesh: String(localized: "game.concept.meesh.how", defaultValue: "Tu la frappes avec tes points. Chaque frappe renchérit la suivante.", bundle: .main)
        case .glory: String(localized: "game.concept.glory.how", defaultValue: "Chaque frappe, chaque record et chaque succès en ajoute.", bundle: .main)
        case .flame: String(localized: "game.concept.flame.how", defaultValue: "Un geste par jour la fait grandir. Un gel couvre un jour manqué.", bundle: .main)
        case .missions: String(localized: "game.concept.missions.how", defaultValue: "Trois missions par jour. Quand elles sont faites, tu ouvres le coffre.", bundle: .main)
        case .league: String(localized: "game.concept.league.how", defaultValue: "Tes points de la semaine font ton rang. Les premiers montent de ligue.", bundle: .main)
        case .season: String(localized: "game.concept.season.how", defaultValue: "Les missions et le duo donnent des étoiles, qui ouvrent les étapes.", bundle: .main)
        case .prestige: String(localized: "game.concept.prestige.how", defaultValue: "Ton niveau repart à 1. Tu gagnes une étoile, un trophée et de la Gloire.", bundle: .main)
        case .elans: String(localized: "game.concept.elans.how", defaultValue: "Fais des gestes de plusieurs familles ces jours-ci pour le déclencher.", bundle: .main)
        case .badges: String(localized: "game.concept.badges.how", defaultValue: "Répète un geste : son badge change de matière, du cuivre au prisme.", bundle: .main)
        case .defis: String(localized: "game.concept.defis.how", defaultValue: "Chaque palier atteint ouvre le suivant, un peu plus haut.", bundle: .main)
        case .succes: String(localized: "game.concept.succes.how", defaultValue: "Il se décroche d’un coup, quand tu réunis ce qu’il demande.", bundle: .main)
        case .showcase: String(localized: "game.concept.showcase.how", defaultValue: "Chaque coupe s’y range toute seule. Tu choisis l’ordre et qui la voit.", bundle: .main)
        case .atlas: String(localized: "game.concept.atlas.how", defaultValue: "Envoie un message et reçois-en un dans une langue : le tampon se pose.", bundle: .main)
        }
    }

    /// Le premier conseil de la fiche, sous « Comment en gagner ».
    static func tip1(_ concept: ProgressionConcept) -> String {
        switch concept {
        case .level: String(localized: "game.concept.level.tip.1", defaultValue: "Fais les missions du jour : elles rapportent beaucoup de points.", bundle: .main)
        case .points: String(localized: "game.concept.points.tip.1", defaultValue: "Publie, commente, réagis : chaque famille de gestes a son barème.", bundle: .main)
        case .meesh: String(localized: "game.concept.meesh.tip.1", defaultValue: "Garde tes Meeshes pour faire monter ton trésor.", bundle: .main)
        case .glory: String(localized: "game.concept.glory.tip.1", defaultValue: "Frappe une Meesh : chaque frappe ajoute de la Gloire.", bundle: .main)
        case .flame: String(localized: "game.concept.flame.tip.1", defaultValue: "Fais au moins un geste chaque jour.", bundle: .main)
        case .missions: String(localized: "game.concept.missions.tip.1", defaultValue: "Commence par la mission la plus facile.", bundle: .main)
        case .league: String(localized: "game.concept.league.tip.1", defaultValue: "Joue un peu chaque jour : les points de la semaine s’additionnent.", bundle: .main)
        case .season: String(localized: "game.concept.season.tip.1", defaultValue: "Finis tes missions du jour pour gagner des étoiles.", bundle: .main)
        case .prestige: String(localized: "game.concept.prestige.tip.1", defaultValue: "Monte jusqu’au niveau 100.", bundle: .main)
        case .elans: String(localized: "game.concept.elans.tip.1", defaultValue: "Varie tes gestes : écris, publie, commente, réagis.", bundle: .main)
        case .badges: String(localized: "game.concept.badges.tip.1", defaultValue: "Choisis un geste que tu aimes et refais-le souvent.", bundle: .main)
        case .defis: String(localized: "game.concept.defis.tip.1", defaultValue: "Regarde le prochain palier et avance vers lui.", bundle: .main)
        case .succes: String(localized: "game.concept.succes.tip.1", defaultValue: "Explore l’application : certains succès se cachent.", bundle: .main)
        case .showcase: String(localized: "game.concept.showcase.tip.1", defaultValue: "Finis en haut de ta ligue pour gagner une coupe.", bundle: .main)
        case .atlas: String(localized: "game.concept.atlas.tip.1", defaultValue: "Écris à quelqu’un dans une autre langue que la tienne.", bundle: .main)
        }
    }

    /// Le second conseil de la fiche.
    static func tip2(_ concept: ProgressionConcept) -> String {
        switch concept {
        case .level: String(localized: "game.concept.level.tip.2", defaultValue: "Garde ta Flamme allumée : elle augmente tes récompenses.", bundle: .main)
        case .points: String(localized: "game.concept.points.tip.2", defaultValue: "Déclenche un élan pour multiplier tes points.", bundle: .main)
        case .meesh: String(localized: "game.concept.meesh.tip.2", defaultValue: "Dépense-les pour protéger ta Flamme ou changer une mission.", bundle: .main)
        case .glory: String(localized: "game.concept.glory.tip.2", defaultValue: "Bats tes records et décroche des succès.", bundle: .main)
        case .flame: String(localized: "game.concept.flame.tip.2", defaultValue: "Garde un gel en réserve pour les jours sans.", bundle: .main)
        case .missions: String(localized: "game.concept.missions.tip.2", defaultValue: "Une mission ne te plaît pas ? Change-la, une fois par jour.", bundle: .main)
        case .league: String(localized: "game.concept.league.tip.2", defaultValue: "Vise les premières places avant dimanche soir.", bundle: .main)
        case .season: String(localized: "game.concept.season.tip.2", defaultValue: "Joue en duo avec un ami : la récompense est doublée.", bundle: .main)
        case .prestige: String(localized: "game.concept.prestige.tip.2", defaultValue: "Passe en Prestige quand tu veux : rien ne t’y oblige.", bundle: .main)
        case .elans: String(localized: "game.concept.elans.tip.2", defaultValue: "Reviens plusieurs jours de suite pour le garder.", bundle: .main)
        case .badges: String(localized: "game.concept.badges.tip.2", defaultValue: "Un badge éteint se rallume : rien n’est perdu.", bundle: .main)
        case .defis: String(localized: "game.concept.defis.tip.2", defaultValue: "Essaie des gestes nouveaux : chacun a ses défis.", bundle: .main)
        case .succes: String(localized: "game.concept.succes.tip.2", defaultValue: "Les plus rares ajoutent le plus de Gloire.", bundle: .main)
        case .showcase: String(localized: "game.concept.showcase.tip.2", defaultValue: "Termine une saison ou passe en Prestige.", bundle: .main)
        case .atlas: String(localized: "game.concept.atlas.tip.2", defaultValue: "Attends sa réponse : il faut un message dans chaque sens.", bundle: .main)
        }
    }

    static var sectionAct: String { String(localized: "game.concept.section.act", defaultValue: "À toi de jouer", bundle: .main) }

    static var cardHint: String { String(localized: "game.concept.card.hint", defaultValue: "Ouvre la fiche", bundle: .main) }

    static func cardA11y(_ a: String, _ b: String, _ c: String) -> String {
        String(localized: "game.concept.card.a11y", defaultValue: "\(a), \(b). \(c)", bundle: .main)
    }

    static var guideHint: String { String(localized: "game.concept.guide.hint", defaultValue: "Ouvre le message de Mee en entier", bundle: .main) }

    static var photoOffer: String { String(localized: "game.concept.photo.offer", defaultValue: "Immortaliser ce moment", bundle: .main) }

    static var linkLeague: String { String(localized: "game.concept.link.league", defaultValue: "Classement de la ligue", bundle: .main) }

    static var linkSeason: String { String(localized: "game.concept.link.season", defaultValue: "Parcours de la saison", bundle: .main) }

    static var linkPrestige: String { String(localized: "game.concept.link.prestige", defaultValue: "Page du Prestige", bundle: .main) }

    static var linkShowcase: String { String(localized: "game.concept.link.showcase", defaultValue: "Ranger ma vitrine", bundle: .main) }

    static var linkAtlas: String { String(localized: "game.concept.link.atlas", defaultValue: "Voir mes tampons", bundle: .main) }

    static var linkBadges: String { String(localized: "game.concept.link.badges", defaultValue: "Tous les badges", bundle: .main) }

    static var linkDefis: String { String(localized: "game.concept.link.defis", defaultValue: "Tous les défis", bundle: .main) }

    static var linkSucces: String { String(localized: "game.concept.link.succes", defaultValue: "Tous les succès", bundle: .main) }

    static func ratio(_ a: String, _ b: String) -> String {
        String(localized: "game.concept.ratio", defaultValue: "\(a) / \(b)", bundle: .main)
    }

    static func valueFactor(_ a: String) -> String {
        String(localized: "game.concept.value.factor", defaultValue: "×\(a)", bundle: .main)
    }

    static var valueNoElan: String { String(localized: "game.concept.value.no_elan", defaultValue: "Pas encore d’élan", bundle: .main) }

    static func chipMissing(_ a: String) -> String {
        String(localized: "game.concept.chip.missing", defaultValue: "Encore \(a)", bundle: .main)
    }

    static func chipRecordLevel(_ a: String) -> String {
        String(localized: "game.concept.chip.record_level", defaultValue: "Record : niveau \(a)", bundle: .main)
    }

    static func chipTailwind(_ a: String) -> String {
        String(localized: "game.concept.chip.tailwind", defaultValue: "Vent arrière ×\(a)", bundle: .main)
    }

    static func chipConvertible(_ a: String) -> String {
        String(localized: "game.concept.chip.convertible", defaultValue: "\(a) à convertir", bundle: .main)
    }

    static var chipMintReady: String { String(localized: "game.concept.chip.mint_ready", defaultValue: "Prête à frapper", bundle: .main) }

    static func chipMinted(_ a: String) -> String {
        String(localized: "game.concept.chip.minted", defaultValue: "\(a) frappées", bundle: .main)
    }

    static func chipGloryMissing(_ a: String) -> String {
        String(localized: "game.concept.chip.glory_missing", defaultValue: "Encore \(a) de Gloire", bundle: .main)
    }

    static var chipTopRank: String { String(localized: "game.concept.chip.top_rank", defaultValue: "Rang le plus haut", bundle: .main) }

    static func chipFreezesOf(_ a: String, _ b: String) -> String {
        String(localized: "game.concept.chip.freezes_of", defaultValue: "Gels : \(a) / \(b)", bundle: .main)
    }

    static var chipReroll: String { String(localized: "game.concept.chip.reroll", defaultValue: "1 changement possible", bundle: .main) }

    static var chipPrismDay: String { String(localized: "game.concept.chip.prism_day", defaultValue: "Jour Prisme", bundle: .main) }

    static func chipToUnlock(_ a: String) -> String {
        String(localized: "game.concept.chip.to_unlock", defaultValue: "Encore \(a) à décrocher", bundle: .main)
    }

    static var chipAllDone: String { String(localized: "game.concept.chip.all_done", defaultValue: "Tout est décroché", bundle: .main) }

    static func chipVisible(_ a: String) -> String {
        String(localized: "game.concept.chip.visible", defaultValue: "Vu par : \(a)", bundle: .main)
    }

    static func chipPending(_ a: String) -> String {
        String(localized: "game.concept.chip.pending", defaultValue: "\(a) à moitié faits", bundle: .main)
    }

    static func chipFamiliesOne(_ a: String) -> String {
        String(localized: "game.concept.chip.families.one", defaultValue: "\(a) famille active", bundle: .main)
    }

    static func chipFamiliesOther(_ a: String) -> String {
        String(localized: "game.concept.chip.families.other", defaultValue: "\(a) familles actives", bundle: .main)
    }

    static func chipWindow(_ a: String) -> String {
        String(localized: "game.concept.chip.window", defaultValue: "Sur \(a)", bundle: .main)
    }

    static var chipStanding: String { String(localized: "game.concept.chip.standing", defaultValue: "Avec ton assise", bundle: .main) }

    static func chipWeekOf(_ a: String, _ b: String) -> String {
        String(localized: "game.concept.chip.week_of", defaultValue: "Semaine \(a) sur \(b)", bundle: .main)
    }

    static func chipGloryOnPass(_ a: String) -> String {
        String(localized: "game.concept.chip.glory_on_pass", defaultValue: "+\(a) de Gloire", bundle: .main)
    }

    static var chipPersonal: String { String(localized: "game.concept.chip.personal", defaultValue: "Mission personnelle", bundle: .main) }

    static var factTier: String { String(localized: "game.concept.fact.tier", defaultValue: "Palier", bundle: .main) }

    static var factNextLevel: String { String(localized: "game.concept.fact.next_level", defaultValue: "Prochain niveau", bundle: .main) }

    static var factRecord: String { String(localized: "game.concept.fact.record", defaultValue: "Record", bundle: .main) }

    static var factTailwind: String { String(localized: "game.concept.fact.tailwind", defaultValue: "Vent arrière", bundle: .main) }

    static var factPrismHour: String { String(localized: "game.concept.fact.prism_hour", defaultValue: "Heure Prisme", bundle: .main) }

    static var factStars: String { String(localized: "game.concept.fact.stars", defaultValue: "Étoiles", bundle: .main) }

    static var factConvertible: String { String(localized: "game.concept.fact.convertible", defaultValue: "Points à convertir", bundle: .main) }

    static var factMinted: String { String(localized: "game.concept.fact.minted", defaultValue: "Frappées en tout", bundle: .main) }

    static var factNextPrice: String { String(localized: "game.concept.fact.next_price", defaultValue: "Prix de la prochaine", bundle: .main) }

    static var factMissing: String { String(localized: "game.concept.fact.missing", defaultValue: "Il te manque", bundle: .main) }

    static var factBalance: String { String(localized: "game.concept.fact.balance", defaultValue: "En poche", bundle: .main) }

    static var factCost: String { String(localized: "game.concept.fact.cost", defaultValue: "Coûte", bundle: .main) }

    static var factAfter: String { String(localized: "game.concept.fact.after", defaultValue: "Restera", bundle: .main) }

    static var factRequired: String { String(localized: "game.concept.fact.required", defaultValue: "Requis", bundle: .main) }

    static func factCoin(_ a: String, _ b: String) -> String {
        String(localized: "game.concept.fact.coin", defaultValue: "n° \(a) · \(b)", bundle: .main)
    }

    static var factTreasury: String { String(localized: "game.concept.fact.treasury", defaultValue: "Trésor", bundle: .main) }

    static var factNextTreasury: String { String(localized: "game.concept.fact.next_treasury", defaultValue: "Prochain palier du trésor", bundle: .main) }

    static var factRank: String { String(localized: "game.concept.fact.rank", defaultValue: "Rang", bundle: .main) }

    static var factNextRank: String { String(localized: "game.concept.fact.next_rank", defaultValue: "Prochain rang", bundle: .main) }

    static var factStreak: String { String(localized: "game.concept.fact.streak", defaultValue: "Série", bundle: .main) }

    static var factBonus: String { String(localized: "game.concept.fact.bonus", defaultValue: "Bonus sur les missions", bundle: .main) }

    static func factPercent(_ a: String) -> String {
        String(localized: "game.concept.fact.percent", defaultValue: "+\(a) %", bundle: .main)
    }

    static var factFreezes: String { String(localized: "game.concept.fact.freezes", defaultValue: "Gels en réserve", bundle: .main) }

    static var factFreezePrice: String { String(localized: "game.concept.fact.freeze_price", defaultValue: "Prix d’un gel", bundle: .main) }

    static var factRelightPrice: String { String(localized: "game.concept.fact.relight_price", defaultValue: "Prix pour rallumer", bundle: .main) }

    static var factState: String { String(localized: "game.concept.fact.state", defaultValue: "État", bundle: .main) }

    static var factDone: String { String(localized: "game.concept.fact.done", defaultValue: "Terminées", bundle: .main) }

    static var factChest: String { String(localized: "game.concept.fact.chest", defaultValue: "Coffre", bundle: .main) }

    static var factWeekPoints: String { String(localized: "game.concept.fact.week_points", defaultValue: "Points de la semaine", bundle: .main) }

    static var factZone: String { String(localized: "game.concept.fact.zone", defaultValue: "Zone", bundle: .main) }

    static var factToPromotion: String { String(localized: "game.concept.fact.to_promotion", defaultValue: "Pour monter", bundle: .main) }

    static var factCloses: String { String(localized: "game.concept.fact.closes", defaultValue: "Fermeture", bundle: .main) }

    static var factFriends: String { String(localized: "game.concept.fact.friends", defaultValue: "Entre amis", bundle: .main) }

    static var factWeek: String { String(localized: "game.concept.fact.week", defaultValue: "Semaine", bundle: .main) }

    static var factSteps: String { String(localized: "game.concept.fact.steps", defaultValue: "Étapes", bundle: .main) }

    static var factNextStep: String { String(localized: "game.concept.fact.next_step", defaultValue: "Prochaine étape", bundle: .main) }

    static var factSeal: String { String(localized: "game.concept.fact.seal", defaultValue: "Sceau", bundle: .main) }

    static var factGloryOnPass: String { String(localized: "game.concept.fact.glory_on_pass", defaultValue: "Gloire au passage", bundle: .main) }

    static var factFactor: String { String(localized: "game.concept.fact.factor", defaultValue: "Multiplicateur", bundle: .main) }

    static var factFamilies: String { String(localized: "game.concept.fact.families", defaultValue: "Familles actives", bundle: .main) }

    static var factWindow: String { String(localized: "game.concept.fact.window", defaultValue: "Fenêtre", bundle: .main) }

    static var factRemaining: String { String(localized: "game.concept.fact.remaining", defaultValue: "Restants", bundle: .main) }

    static var factVisible: String { String(localized: "game.concept.fact.visible", defaultValue: "Visible par", bundle: .main) }

    static var factPending: String { String(localized: "game.concept.fact.pending", defaultValue: "À moitié faits", bundle: .main) }

    static var factYes: String { String(localized: "game.concept.fact.yes", defaultValue: "Oui", bundle: .main) }

    static var factNo: String { String(localized: "game.concept.fact.no", defaultValue: "Non", bundle: .main) }

    static var ficheWhat: String { String(localized: "game.fiche.what", defaultValue: "C’est quoi ?", bundle: .main) }

    static var ficheWhere: String { String(localized: "game.fiche.where", defaultValue: "Où j’en suis", bundle: .main) }

    static var ficheEarn: String { String(localized: "game.fiche.earn", defaultValue: "Comment en gagner", bundle: .main) }

    static var ficheMore: String { String(localized: "game.fiche.more", defaultValue: "Aller plus loin", bundle: .main) }

    static func chipNextPrice(_ a: String) -> String {
        String(localized: "game.concept.chip.next_price", defaultValue: "Prochaine : \(a)", bundle: .main)
    }

    static var chipChestLocked: String { String(localized: "game.concept.chip.chest.locked", defaultValue: "Coffre fermé", bundle: .main) }

    static var chipChestReady: String { String(localized: "game.concept.chip.chest.ready", defaultValue: "Coffre prêt", bundle: .main) }

    static var chipChestClaimed: String { String(localized: "game.concept.chip.chest.claimed", defaultValue: "Coffre ouvert", bundle: .main) }

}
