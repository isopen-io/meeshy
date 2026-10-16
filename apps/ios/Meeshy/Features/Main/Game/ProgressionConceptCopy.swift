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
        case .points: String(localized: "game.concept.points.why", defaultValue: "Gagnées, elles font ton niveau ; en poche, elles paient tes Meeshes.", bundle: .main)
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
        case .level: String(localized: "game.concept.level.how", defaultValue: "Tes étincelles remplissent l’anneau : plein, tu montes d’un niveau.", bundle: .main)
        case .points: String(localized: "game.concept.points.how", defaultValue: "Chaque geste utile en rapporte : écrire, parler, publier, réagir.", bundle: .main)
        case .meesh: String(localized: "game.concept.meesh.how", defaultValue: "Tu la frappes avec tes étincelles en poche. Son prix monte par paliers.", bundle: .main)
        case .glory: String(localized: "game.concept.glory.how", defaultValue: "Chaque frappe, chaque record et chaque succès en ajoute.", bundle: .main)
        case .flame: String(localized: "game.concept.flame.how", defaultValue: "Un geste par jour la fait grandir. Un gel couvre un jour manqué.", bundle: .main)
        case .missions: String(localized: "game.concept.missions.how", defaultValue: "Trois missions par jour. Quand elles sont faites, tu ouvres le coffre.", bundle: .main)
        case .league: String(localized: "game.concept.league.how", defaultValue: "Tes étincelles de la semaine font ton rang ; les premiers montent.", bundle: .main)
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

    static func chipRecordLevel(_ a: String) -> String {
        String(localized: "game.concept.chip.record_level", defaultValue: "Record : niveau \(a)", bundle: .main)
    }

    static var chipMintReady: String { String(localized: "game.concept.chip.mint_ready", defaultValue: "Prête à frapper", bundle: .main) }

    static func chipMinted(_ a: String) -> String {
        String(localized: "game.concept.chip.minted", defaultValue: "\(a) frappées", bundle: .main)
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

    static var factPrismHour: String { String(localized: "game.concept.fact.prism_hour", defaultValue: "Heure Prisme", bundle: .main) }

    static var factStars: String { String(localized: "game.concept.fact.stars", defaultValue: "Étoiles", bundle: .main) }

    static var factConvertible: String { String(localized: "game.concept.fact.convertible", defaultValue: "Points à convertir", bundle: .main) }

    static var factMinted: String { String(localized: "game.concept.fact.minted", defaultValue: "Frappées en tout", bundle: .main) }

    static var factNextPrice: String { String(localized: "game.concept.fact.next_price", defaultValue: "Prix de la prochaine", bundle: .main) }

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

    static var factCloses: String { String(localized: "game.concept.fact.closes", defaultValue: "Fermeture", bundle: .main) }

    static var factFriends: String { String(localized: "game.concept.fact.friends", defaultValue: "Entre amis", bundle: .main) }

    static var factWeek: String { String(localized: "game.concept.fact.week", defaultValue: "Semaine", bundle: .main) }

    static var factSteps: String { String(localized: "game.concept.fact.steps", defaultValue: "Étapes", bundle: .main) }

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

    // MARK: - Quatre questions par concept, deux soldes nommés, un manque qui dit sa cible (#10540)
    //
    // Les clés sont celles du web (`catalog-game-concept-<langue>.ts`), phrase pour phrase, dans les sept langues.

    /// Ce que c’est — la première phrase de « C’est quoi ? ».
    static func what(_ concept: ProgressionConcept) -> String {
        switch concept {
        case .level: String(localized: "game.concept.level.what", defaultValue: "Ton niveau est le chiffre au centre de ton anneau. Il se lit sur tes points en poche : 10 000 points pour le niveau 10, un million pour le niveau 100.", bundle: .main)
        case .points: String(localized: "game.concept.points.what", defaultValue: "Tu as deux soldes. Tes points en poche sont ton total du moment. Tes points à convertir sont la part de ce total que la frappe peut reprendre. Les deux sont comptés à part : ils peuvent être différents.", bundle: .main)
        case .meesh: String(localized: "game.concept.meesh.what", defaultValue: "Une Meesh est une pièce que tu frappes toi-même. Chaque pièce porte son numéro : une sur cent est en or, une sur mille en prisme.", bundle: .main)
        case .glory: String(localized: "game.concept.glory.what", defaultValue: "La Gloire est un compteur qui ne redescend jamais. Elle donne ton rang, parmi onze.", bundle: .main)
        case .flame: String(localized: "game.concept.flame.what", defaultValue: "Ta Flamme est ta série de jours : elle grandit chaque jour où tu fais au moins un geste, et change de forme en grandissant.", bundle: .main)
        case .missions: String(localized: "game.concept.missions.what", defaultValue: "Chaque jour, trois missions : de petits buts à atteindre dans la journée. Un coffre les accompagne.", bundle: .main)
        case .league: String(localized: "game.concept.league.what", defaultValue: "La ligue est un classement de la semaine, dans un groupe de 30 joueurs d’activité comparable. Il y a huit ligues.", bundle: .main)
        case .season: String(localized: "game.concept.season.what", defaultValue: "Une saison est un parcours de huit semaines, avec un thème et des étapes gratuites.", bundle: .main)
        case .prestige: String(localized: "game.concept.prestige.what", defaultValue: "Le Prestige est un nouveau tour, offert au niveau 100. Il est facultatif et se fait cinq fois au plus.", bundle: .main)
        case .elans: String(localized: "game.concept.elans.what", defaultValue: "Un élan est un multiplicateur de points. Il s’allume quand tu es actif dans plusieurs familles de gestes ces jours-ci.", bundle: .main)
        case .badges: String(localized: "game.concept.badges.what", defaultValue: "Un badge compte un geste précis : un message vocal, une story, une amitié nouée. Il y en a vingt.", bundle: .main)
        case .defis: String(localized: "game.concept.defis.what", defaultValue: "Un défi est un palier chiffré dans une famille de gestes : un nombre à atteindre.", bundle: .main)
        case .succes: String(localized: "game.concept.succes.what", defaultValue: "Un succès est une distinction qui se décroche une seule fois, avec sa date et sa rareté.", bundle: .main)
        case .showcase: String(localized: "game.concept.showcase.what", defaultValue: "Ta vitrine est l’étagère de tes trophées : coupes de ligue, de saison, de Prestige et de Flamme.", bundle: .main)
        case .atlas: String(localized: "game.concept.atlas.what", defaultValue: "L’Atlas est ton passeport des langues : un tampon par langue dans laquelle tu as vraiment échangé.", bundle: .main)
        }
    }

    /// Comment s’en servir — la section « Comment m’en servir » de la fiche.
    static func use(_ concept: ProgressionConcept) -> String {
        switch concept {
        case .level: String(localized: "game.concept.level.use", defaultValue: "Il ouvre les missions au niveau 5, la ligue au 10, le duo au 20 et le Prestige au 100. De 10 à 100, chaque dizaine demande aussi une étape. Frapper une Meesh retire des points en poche : ton niveau peut baisser, ton niveau record jamais.", bundle: .main)
        case .points: String(localized: "game.concept.points.use", defaultValue: "Pour monter de niveau, regarde tes points en poche. Pour frapper une Meesh, regarde tes points à convertir : c’est ce solde qui doit atteindre le prix. Une frappe retire son prix des deux soldes.", bundle: .main)
        case .meesh: String(localized: "game.concept.meesh.use", defaultValue: "Garde tes Meeshes : elles remplissent ton trésor, visible sur ton profil. Ou dépense-les : un gel pour ta Flamme, une mission à changer, le Sceau de la saison. Chaque frappe ajoute aussi de la Gloire.", bundle: .main)
        case .glory: String(localized: "game.concept.glory.use", defaultValue: "Ton rang se montre sur ton blason et sur ton profil. Il ouvre aussi les niveaux : jusqu’à 499 sous Ambassadeur, 1000 dès Ambassadeur, sans limite dès Oracle.", bundle: .main)
        case .flame: String(localized: "game.concept.flame.use", defaultValue: "Chaque jour de série ajoute 2 % à tes récompenses de mission, jusqu’à 50 %. Un gel couvre un jour manqué. Éteinte, elle se rallume avec des Meeshes pendant 48 h.", bundle: .main)
        case .missions: String(localized: "game.concept.missions.use", defaultValue: "Ouvre une mission pour voir où tu en es. Tu peux en changer une par jour avec une Meesh. Les trois faites, ouvre le coffre : des points, de la Gloire, parfois une prime, un fragment d’étoile ou un gel.", bundle: .main)
        case .league: String(localized: "game.concept.league.use", defaultValue: "Regarde ta place et ta zone : les 7 premiers montent d’une ligue, les 5 derniers descendent. Tout repart de zéro chaque lundi. La ligue publique demande ton accord ; la ligue entre amis est toujours ouverte.", bundle: .main)
        case .season: String(localized: "game.concept.season.use", defaultValue: "Gagne des étoiles, puis réclame chaque étape ouverte : des points, un fragment d’étoile, un gel. Le parcours fini donne la coupe de saison. Le Sceau est un objet à collectionner, pris avec des Meeshes.", bundle: .main)
        case .prestige: String(localized: "game.concept.prestige.use", defaultValue: "Au niveau 100, choisis : passer en Prestige, ou continuer à monter. Passer remet ton niveau à 1 et tes points en poche à 0. Tu gardes ton rang, ta Gloire, tes Meeshes, ta Flamme et tes trophées.", bundle: .main)
        case .elans: String(localized: "game.concept.elans.use", defaultValue: "Regarde quelles familles sont actives, puis fais un geste dans une famille qui manque. Tant que l’élan tient, chaque geste rapporte plus. Après une frappe, le Vent arrière ajoute 25 % jusqu’à ton niveau record.", bundle: .main)
        case .badges: String(localized: "game.concept.badges.use", defaultValue: "Touche un badge pour voir ce qui compte, sa matière et ce qu’il manque pour la prochaine étoile. Une frappe peut éteindre un badge : refais le geste pour le rallumer.", bundle: .main)
        case .defis: String(localized: "game.concept.defis.use", defaultValue: "Ouvre la liste, repère le palier le plus proche et avance vers lui. Chaque palier dit sa rareté.", bundle: .main)
        case .succes: String(localized: "game.concept.succes.use", defaultValue: "Ouvre un succès pour lire ce qu’il demande. Décroché, il ajoute de la Gloire : plus il est rare, plus il en ajoute.", bundle: .main)
        case .showcase: String(localized: "game.concept.showcase.use", defaultValue: "Range tes trophées dans l’ordre que tu veux et choisis qui voit ta vitrine : tout le monde, tes amis ou toi seul. Un trophée ne rapporte rien : il se montre.", bundle: .main)
        case .atlas: String(localized: "game.concept.atlas.use", defaultValue: "Regarde les échanges à moitié faits : il manque un message envoyé ou un message reçu pour poser le tampon. Ton Atlas est privé par défaut : tu choisis qui le voit.", bundle: .main)
        }
    }

    static var ficheUse: String { String(localized: "game.fiche.use", defaultValue: "Comment m’en servir", bundle: .main) }

    static var factHeld: String { String(localized: "game.concept.fact.held", defaultValue: "Points en poche", bundle: .main) }

    static var factToConvert: String { String(localized: "game.fact.to_convert", defaultValue: "À convertir", bundle: .main) }

    static func chipToLevel(level: String, points: String) -> String {
        String(localized: "game.concept.chip.to_level", defaultValue: "Niveau \(level) dans \(points)", bundle: .main)
    }

    static func chipToMeesh(number: String, missing: String) -> String {
        String(localized: "game.concept.chip.to_meesh", defaultValue: "Meesh n° \(number) : il manque \(missing)", bundle: .main)
    }

    static var chipMintCovered: String { String(localized: "game.concept.chip.mint_covered", defaultValue: "Assez pour une Meesh", bundle: .main) }

    static func chipNext(name: String) -> String {
        String(localized: "game.concept.chip.next", defaultValue: "Ensuite : \(name)", bundle: .main)
    }

    static func missingForLevel(level: String) -> String {
        String(localized: "game.fact.missing_for.level", defaultValue: "Il manque pour le niveau \(level)", bundle: .main)
    }

    static func missingForMeesh(number: String) -> String {
        String(localized: "game.fact.missing_for.meesh", defaultValue: "Il manque pour la Meesh n° \(number)", bundle: .main)
    }

    static func missingForRank(rank: String) -> String {
        String(localized: "game.fact.missing_for.rank", defaultValue: "Il manque pour \(rank)", bundle: .main)
    }

    static var missingForPromotion: String { String(localized: "game.fact.missing_for.promotion", defaultValue: "Il manque pour la zone de montée", bundle: .main) }

    static func spendMissingMint(missing: String, number: String) -> String {
        String(localized: "game.spend.missing.mint", defaultValue: "Il manque \(missing) pour la Meesh n° \(number).", bundle: .main)
    }

    static func spendMissingFreeze(missing: String) -> String {
        String(localized: "game.spend.missing.freeze", defaultValue: "Il manque \(missing) pour acheter un gel.", bundle: .main)
    }

    static func spendMissingRelight(missing: String) -> String {
        String(localized: "game.spend.missing.relight", defaultValue: "Il manque \(missing) pour rallumer ta Flamme.", bundle: .main)
    }

    static func spendMissingReroll(missing: String) -> String {
        String(localized: "game.spend.missing.reroll", defaultValue: "Il manque \(missing) pour changer cette mission.", bundle: .main)
    }

    static func spendMissingSeal(missing: String) -> String {
        String(localized: "game.spend.missing.seal", defaultValue: "Il manque \(missing) pour prendre le Sceau.", bundle: .main)
    }

    static func spendMissingUnlock(missing: String) -> String {
        String(localized: "game.spend.missing.unlock", defaultValue: "Il manque \(missing) pour l’ouvrir.", bundle: .main)
    }

    // MARK: - La phrase d’état d’un concept (#10540)
    //
    // MIROIR des clés `game.state.*` du web : `ProgressionConceptModel.state` choisit la phrase, ce fichier la dit.

    static func stateLevelProgress(level: String, done: String, span: String, left: String, next: String) -> String {
        String(localized: "game.state.level.progress", defaultValue: "Niveau \(level) : tu as fait \(done) sur les \(span) de ce niveau. Il en reste \(left) pour le niveau \(next).", bundle: .main)
    }

    static func stateLevelSimple(level: String, left: String, next: String) -> String {
        String(localized: "game.state.level.simple", defaultValue: "Niveau \(level) : il reste \(left) pour le niveau \(next).", bundle: .main)
    }

    static func statePointsMissing(held: String, convertible: String, number: String, price: String, missing: String) -> String {
        String(localized: "game.state.points.missing", defaultValue: "Tu as \(held) en poche et \(convertible). La Meesh n° \(number) coûte \(price) : il manque \(missing).", bundle: .main)
    }

    static func statePointsReady(held: String, convertible: String, number: String, price: String) -> String {
        String(localized: "game.state.points.ready", defaultValue: "Tu as \(held) en poche et \(convertible) : assez pour la Meesh n° \(number), qui coûte \(price).", bundle: .main)
    }

    /// Les étincelles (#10846) : la poche seule, toute convertible, et ce qui manque pour la pièce visée.
    static func statePointsMissingPlain(held: String, number: String, price: String, missing: String) -> String {
        String(localized: "game.state.points.missing_plain",
               defaultValue: "Tu as \(held) en poche, toutes convertibles. La Meesh n° \(number) coûte \(price) : il manque \(missing).",
               bundle: .main)
    }

    static func statePointsReadyPlain(held: String, number: String, price: String) -> String {
        String(localized: "game.state.points.ready_plain", defaultValue: "Tu as \(held) en poche. Tes points à convertir couvrent la Meesh n° \(number), qui coûte \(price).", bundle: .main)
    }

    static func stateMeeshKept(balance: String, minted: String) -> String {
        String(localized: "game.state.meesh.kept", defaultValue: "Tu gardes \(balance). Depuis le début, tu en as frappé \(minted).", bundle: .main)
    }

    static func stateMeeshKeptNone(minted: String) -> String {
        String(localized: "game.state.meesh.kept_none", defaultValue: "Tu ne gardes aucune Meesh. Depuis le début, tu en as frappé \(minted).", bundle: .main)
    }

    static func stateMeeshNextMissing(number: String, price: String, missing: String) -> String {
        String(localized: "game.state.meesh.next_missing", defaultValue: "La Meesh n° \(number) coûte \(price) : il te manque \(missing).", bundle: .main)
    }

    static func stateMeeshNextReady(number: String, price: String) -> String {
        String(localized: "game.state.meesh.next_ready", defaultValue: "Tu peux frapper la Meesh n° \(number) : elle coûte \(price).", bundle: .main)
    }

    static func stateGloryNext(rank: String, glory: String, missing: String, next: String) -> String {
        String(localized: "game.state.glory.next", defaultValue: "Tu es \(rank) avec \(glory) de Gloire. Il en manque \(missing) pour \(next).", bundle: .main)
    }

    static func stateGloryTop(rank: String, glory: String) -> String {
        String(localized: "game.state.glory.top", defaultValue: "Tu es \(rank) avec \(glory) de Gloire : c’est le rang le plus haut.", bundle: .main)
    }

    static var stateFlameNone: String { String(localized: "game.state.flame.none", defaultValue: "Pas de Flamme pour l’instant : un geste aujourd’hui l’allume.", bundle: .main) }

    static func stateFlameLit(days: String, bonus: String, freezes: String) -> String {
        String(localized: "game.state.flame.lit", defaultValue: "Ta Flamme tient depuis \(days) : tes missions rapportent \(bonus) % de plus. Gels en réserve : \(freezes).", bundle: .main)
    }

    static func stateFlameAtRisk(days: String) -> String {
        String(localized: "game.state.flame.at_risk", defaultValue: "Ta Flamme de \(days) est en danger : fais un geste avant minuit pour la garder.", bundle: .main)
    }

    static func stateFlameCovered(days: String) -> String {
        String(localized: "game.state.flame.covered", defaultValue: "Un gel protège ta Flamme de \(days) : fais un geste aujourd’hui pour la continuer.", bundle: .main)
    }

    static var stateFlameOut: String { String(localized: "game.state.flame.out", defaultValue: "Ta Flamme est éteinte. Un geste en allume une nouvelle.", bundle: .main) }

    static func stateFlameStreak(days: String, record: String) -> String {
        String(localized: "game.state.flame.streak", defaultValue: "Ta série est de \(days). Ton record est de \(record).", bundle: .main)
    }

    static func stateMissionsProgress(done: String, total: String, left: String) -> String {
        String(localized: "game.state.missions.progress", defaultValue: "Missions faites : \(done) sur \(total). Il en reste \(left) pour ouvrir le coffre.", bundle: .main)
    }

    static func stateMissionsReady(done: String, total: String) -> String {
        String(localized: "game.state.missions.ready", defaultValue: "Missions faites : \(done) sur \(total). Le coffre est prêt : ouvre-le.", bundle: .main)
    }

    static func stateMissionsClaimed(done: String, total: String) -> String {
        String(localized: "game.state.missions.claimed", defaultValue: "Missions faites : \(done) sur \(total). Le coffre est ouvert : reviens demain.", bundle: .main)
    }

    static var stateLeagueUnplaced: String { String(localized: "game.state.league.unplaced", defaultValue: "Tu n’as pas encore de place en ligue cette semaine. La ligue entre amis reste ouverte.", bundle: .main) }

    static func stateLeaguePlace(league: String, rank: String, size: String, points: String) -> String {
        String(localized: "game.state.league.place", defaultValue: "Ligue \(league) : rang \(rank) sur \(size) avec \(points) cette semaine.", bundle: .main)
    }

    static var stateLeagueZonePromotion: String { String(localized: "game.state.league.zone.promotion", defaultValue: "Tu es dans la zone de montée : garde ta place.", bundle: .main) }

    static func stateLeagueZoneSafe(missing: String) -> String {
        String(localized: "game.state.league.zone.safe", defaultValue: "Tu te maintiens : il manque \(missing) pour la zone de montée.", bundle: .main)
    }

    static func stateLeagueZoneRelegation(missing: String) -> String {
        String(localized: "game.state.league.zone.relegation", defaultValue: "Tu es dans la zone de descente : il manque \(missing) pour la zone de montée.", bundle: .main)
    }

    static func stateSeasonProgress(number: String, week: String, weeks: String, steps: String, total: String, stars: String) -> String {
        String(localized: "game.state.season.progress", defaultValue: "Saison \(number), semaine \(week) sur \(weeks) : étape \(steps) sur \(total). Il manque \(stars) pour l’étape suivante.", bundle: .main)
    }

    static func stateSeasonDone(number: String, week: String, weeks: String, total: String) -> String {
        String(localized: "game.state.season.done", defaultValue: "Saison \(number), semaine \(week) sur \(weeks) : parcours terminé, les \(total) étapes sont ouvertes.", bundle: .main)
    }

    static func stateElansActive(factor: String, families: String) -> String {
        String(localized: "game.state.elans.active", defaultValue: "Élan ×\(factor) en cours, avec \(families) : tes prochains gestes rapportent \(factor) fois plus.", bundle: .main)
    }

    static func stateElansIdle(families: String) -> String {
        String(localized: "game.state.elans.idle", defaultValue: "\(families) ces jours-ci : pas d’élan pour l’instant. Sois actif dans une famille de plus pour en déclencher un.", bundle: .main)
    }

    static func stateCountBadges(done: String, total: String, left: String) -> String {
        String(localized: "game.state.count.badges", defaultValue: "Badges obtenus : \(done) sur \(total). Il en reste \(left) à allumer.", bundle: .main)
    }

    static func stateCountDefis(done: String, total: String, left: String) -> String {
        String(localized: "game.state.count.defis", defaultValue: "Défis franchis : \(done) sur \(total). Il en reste \(left) à franchir.", bundle: .main)
    }

    static func stateCountSucces(done: String, total: String, left: String) -> String {
        String(localized: "game.state.count.succes", defaultValue: "Succès décrochés : \(done) sur \(total). Il en reste \(left) à décrocher.", bundle: .main)
    }

    static func stateCountComplete(done: String, total: String) -> String {
        String(localized: "game.state.count.complete", defaultValue: "Tout est obtenu : \(done) sur \(total).", bundle: .main)
    }

    static func stateShowcaseCount(trophies: String, who: String) -> String {
        String(localized: "game.state.showcase.count", defaultValue: "\(trophies) dans ta vitrine. Visible par : \(who).", bundle: .main)
    }

    static func stateAtlasProgress(stamped: String, total: String, pending: String) -> String {
        String(localized: "game.state.atlas.progress", defaultValue: "Langues tamponnées : \(stamped) sur \(total). Échanges à moitié faits : \(pending).", bundle: .main)
    }
}
