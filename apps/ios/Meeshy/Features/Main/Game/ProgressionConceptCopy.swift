import Foundation
import MeeshySDK

// MARK: - Ce que disent les concepts de Progression (#9564)
//
// Une SEULE source de texte par concept : la carte de la première page dit « à quoi ça sert » (`why`) et « comment
// ça marche » (`how`) ; la fiche reprend ces deux phrases et les DÉVELOPPE (`more`, `tip`) — jamais deux
// formulations du même concept. Les clés `game.concept.<clé>.why` / `.how` sont celles du catalogue du web, phrase
// pour phrase. Chaque accesseur est une CLÉ LITTÉRALE, que la garde du catalogue sait lire ; les sept langues vivent
// dans `Localizable.xcstrings`. Les nombres arrivent déjà formatés (`GameCopy.formatCount`).
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

    /// À quoi ça sert — UNE phrase, lisible à 13 ans.
    static func why(_ concept: ProgressionConcept) -> String {
        switch concept {
        case .level: String(localized: "game.concept.level.why", defaultValue: "Ton niveau montre le chemin que tu as parcouru sur Meeshy.", bundle: .main)
        case .points: String(localized: "game.concept.points.why", defaultValue: "Les points sont ce que tu gagnes en utilisant Meeshy.", bundle: .main)
        case .meesh: String(localized: "game.concept.meesh.why", defaultValue: "Les Meeshes sont les pièces du jeu : elles se gardent ou se dépensent.", bundle: .main)
        case .glory: String(localized: "game.concept.glory.why", defaultValue: "La Gloire fait ton rang. Elle ne redescend jamais.", bundle: .main)
        case .flame: String(localized: "game.concept.flame.why", defaultValue: "Ta Flamme compte les jours d’affilée où tu as fait un geste.", bundle: .main)
        case .missions: String(localized: "game.concept.missions.why", defaultValue: "Les missions te donnent trois petits buts chaque jour.", bundle: .main)
        case .league: String(localized: "game.concept.league.why", defaultValue: "La ligue te compare chaque semaine à des joueurs de ton niveau.", bundle: .main)
        case .season: String(localized: "game.concept.season.why", defaultValue: "La saison est un parcours de huit semaines avec des cadeaux à chaque étape.", bundle: .main)
        case .prestige: String(localized: "game.concept.prestige.why", defaultValue: "Le Prestige est une étoile pour celles et ceux qui ont atteint le niveau 100.", bundle: .main)
        case .elans: String(localized: "game.concept.elans.why", defaultValue: "Un élan multiplie les points que tu gagnes.", bundle: .main)
        case .badges: String(localized: "game.concept.badges.why", defaultValue: "Un badge récompense ce que tu fais souvent.", bundle: .main)
        case .defis: String(localized: "game.concept.defis.why", defaultValue: "Les défis sont des buts à long terme, à ton rythme.", bundle: .main)
        case .succes: String(localized: "game.concept.succes.why", defaultValue: "Un succès marque un grand moment de ton histoire sur Meeshy.", bundle: .main)
        case .showcase: String(localized: "game.concept.showcase.why", defaultValue: "Ta vitrine garde tes trophées et les montre à qui tu veux.", bundle: .main)
        case .atlas: String(localized: "game.concept.atlas.why", defaultValue: "L’Atlas collectionne les langues avec lesquelles tu as vraiment échangé.", bundle: .main)
        }
    }

    /// Comment ça marche — UNE phrase.
    static func how(_ concept: ProgressionConcept) -> String {
        switch concept {
        case .level: String(localized: "game.concept.level.how", defaultValue: "Chaque geste donne des points, et les points font monter le niveau.", bundle: .main)
        case .points: String(localized: "game.concept.points.how", defaultValue: "Écrire, répondre, publier, appeler : chaque geste en rapporte.", bundle: .main)
        case .meesh: String(localized: "game.concept.meesh.how", defaultValue: "Tu échanges des points contre une Meesh : c’est la frappe.", bundle: .main)
        case .glory: String(localized: "game.concept.glory.how", defaultValue: "Tu en gagnes en frappant des Meeshes et en finissant des missions.", bundle: .main)
        case .flame: String(localized: "game.concept.flame.how", defaultValue: "Un geste par jour la garde allumée. Un jour sans rien, et elle s’éteint.", bundle: .main)
        case .missions: String(localized: "game.concept.missions.how", defaultValue: "Finis-en une pour gagner des points. Finis les trois pour ouvrir le coffre.", bundle: .main)
        case .league: String(localized: "game.concept.league.how", defaultValue: "Les points de la semaine font le classement : les premiers montent.", bundle: .main)
        case .season: String(localized: "game.concept.season.how", defaultValue: "Les missions et le duo donnent des étoiles, et les étoiles ouvrent les étapes.", bundle: .main)
        case .prestige: String(localized: "game.concept.prestige.how", defaultValue: "Au niveau 100, tu repars du niveau 1 et tu gagnes une étoile et de la Gloire.", bundle: .main)
        case .elans: String(localized: "game.concept.elans.how", defaultValue: "Fais des choses différentes les mêmes jours : messages, stories, posts, appels.", bundle: .main)
        case .badges: String(localized: "game.concept.badges.how", defaultValue: "Chaque sorte de geste a ses paliers : atteins-en un, le badge s’allume.", bundle: .main)
        case .defis: String(localized: "game.concept.defis.how", defaultValue: "Chaque défi a une condition : remplis-la, il est à toi pour toujours.", bundle: .main)
        case .succes: String(localized: "game.concept.succes.how", defaultValue: "Il se débloque tout seul quand tu réunis ce qu’il demande.", bundle: .main)
        case .showcase: String(localized: "game.concept.showcase.how", defaultValue: "Les coupes de ligue, de saison, de Prestige et de Flamme s’y posent toutes seules.", bundle: .main)
        case .atlas: String(localized: "game.concept.atlas.how", defaultValue: "Un message envoyé et un message reçu dans une langue : tu gagnes son tampon.", bundle: .main)
        }
    }

    /// La suite du « C’est quoi ? » de la fiche : elle développe `why`, elle ne le redit pas.
    static func more(_ concept: ProgressionConcept) -> String {
        switch concept {
        case .level: String(localized: "game.concept.level.more", defaultValue: "Il y a cent niveaux, rangés en dix paliers. Chaque palier a son nom et son anneau.", bundle: .main)
        case .points: String(localized: "game.concept.points.more", defaultValue: "Tes points font ton niveau. Tu peux aussi les changer en Meeshes.", bundle: .main)
        case .meesh: String(localized: "game.concept.meesh.more", defaultValue: "Les Meeshes gardées remplissent ton trésor. Plus tu en as frappé, plus la suivante coûte cher.", bundle: .main)
        case .glory: String(localized: "game.concept.glory.more", defaultValue: "Il y a onze rangs, chacun avec son blason et ses divisions.", bundle: .main)
        case .flame: String(localized: "game.concept.flame.more", defaultValue: "Plus elle dure, plus elle grandit, et plus tes missions rapportent.", bundle: .main)
        case .missions: String(localized: "game.concept.missions.more", defaultValue: "Elles changent chaque jour à minuit et s’ouvrent au niveau 5.", bundle: .main)
        case .league: String(localized: "game.concept.league.more", defaultValue: "Il y a huit ligues, de Quartz à Prisme. Elle s’ouvre au niveau 10.", bundle: .main)
        case .season: String(localized: "game.concept.season.more", defaultValue: "Tout le parcours est gratuit. Finis-le pour gagner la coupe de la saison.", bundle: .main)
        case .prestige: String(localized: "game.concept.prestige.more", defaultValue: "Tu peux gagner cinq étoiles en tout. Rien ne t’y oblige : rester au sommet est aussi un choix.", bundle: .main)
        case .elans: String(localized: "game.concept.elans.more", defaultValue: "Chaque sorte de geste est une famille. Plus tu en tiens en même temps, plus le multiplicateur monte.", bundle: .main)
        case .badges: String(localized: "game.concept.badges.more", defaultValue: "Du cuivre au prisme, la matière du badge dit jusqu’où tu es allé.", bundle: .main)
        case .defis: String(localized: "game.concept.defis.more", defaultValue: "Ils sont rangés par thème : messages, stories, posts, appels et plus encore.", bundle: .main)
        case .succes: String(localized: "game.concept.succes.more", defaultValue: "Chaque succès dit sa condition, et sa rareté quand elle est mesurée.", bundle: .main)
        case .showcase: String(localized: "game.concept.showcase.more", defaultValue: "Tu choisis l’ordre des trophées, et qui peut les voir.", bundle: .main)
        case .atlas: String(localized: "game.concept.atlas.more", defaultValue: "Meeshy traduit pour toi : écris dans ta langue, on te répond dans la sienne.", bundle: .main)
        }
    }

    /// Le conseil de la fiche, sous « Comment ça marche ».
    static func tip(_ concept: ProgressionConcept) -> String {
        switch concept {
        case .level: String(localized: "game.concept.level.tip", defaultValue: "Frapper une Meesh coûte des points : ton niveau peut redescendre, ton record reste.", bundle: .main)
        case .points: String(localized: "game.concept.points.tip", defaultValue: "Certains moments rapportent plus : le Vent arrière et l’Heure Prisme.", bundle: .main)
        case .meesh: String(localized: "game.concept.meesh.tip", defaultValue: "Une Meesh sert à changer une mission, à protéger ta Flamme ou à la rallumer.", bundle: .main)
        case .glory: String(localized: "game.concept.glory.tip", defaultValue: "Ton rang reste, même quand ton niveau redescend.", bundle: .main)
        case .flame: String(localized: "game.concept.flame.tip", defaultValue: "Un gel la protège un jour d’absence. Éteinte, tu peux parfois la rallumer.", bundle: .main)
        case .missions: String(localized: "game.concept.missions.tip", defaultValue: "Une mission ne te plaît pas ? Tu peux en changer une par jour contre 1 Meesh.", bundle: .main)
        case .league: String(localized: "game.concept.league.tip", defaultValue: "Tu joues sous un pseudonyme. La ligue entre amis, elle, est toujours ouverte.", bundle: .main)
        case .season: String(localized: "game.concept.season.tip", defaultValue: "Chaque étape ouverte se réclame d’un toucher, sur la page de la saison.", bundle: .main)
        case .prestige: String(localized: "game.concept.prestige.tip", defaultValue: "Ton rang, ta Gloire, tes Meeshes et ta Flamme restent.", bundle: .main)
        case .elans: String(localized: "game.concept.elans.tip", defaultValue: "L’élan retombe quand une famille reste sans geste trop longtemps.", bundle: .main)
        case .badges: String(localized: "game.concept.badges.tip", defaultValue: "Frapper une Meesh peut éteindre un badge : refais le geste pour le rallumer.", bundle: .main)
        case .defis: String(localized: "game.concept.defis.tip", defaultValue: "Tu ne vois que ceux que tu peux vraiment atteindre.", bundle: .main)
        case .succes: String(localized: "game.concept.succes.tip", defaultValue: "Touche un succès pour le revoir en grand.", bundle: .main)
        case .showcase: String(localized: "game.concept.showcase.tip", defaultValue: "Un visiteur ne voit que le mois du trophée, jamais le jour.", bundle: .main)
        case .atlas: String(localized: "game.concept.atlas.tip", defaultValue: "Ton Atlas est privé par défaut : tu choisis qui le voit.", bundle: .main)
        }
    }

    static var dashboardTitle: String { String(localized: "game.concept.dashboard.title", defaultValue: "Tableau de bord", bundle: .main) }

    static var dashboardSubtitle: String { String(localized: "game.concept.dashboard.subtitle", defaultValue: "Tout ton jeu, d’un coup d’œil", bundle: .main) }

    static var sectionWhat: String { String(localized: "game.concept.section.what", defaultValue: "C’est quoi ?", bundle: .main) }

    static var sectionWhere: String { String(localized: "game.concept.section.where", defaultValue: "Où j’en suis", bundle: .main) }

    static var sectionHow: String { String(localized: "game.concept.section.how", defaultValue: "Comment ça marche", bundle: .main) }

    static var sectionAct: String { String(localized: "game.concept.section.act", defaultValue: "À toi de jouer", bundle: .main) }

    static var sectionMore: String { String(localized: "game.concept.section.more", defaultValue: "Aller plus loin", bundle: .main) }

    static var cardHint: String { String(localized: "game.concept.card.hint", defaultValue: "Ouvre la fiche", bundle: .main) }

    static func cardA11y(_ a: String, _ b: String, _ c: String) -> String {
        String(localized: "game.concept.card.a11y", defaultValue: "\(a), \(b). \(c)", bundle: .main)
    }

    static var guideHint: String { String(localized: "game.concept.guide.hint", defaultValue: "Ouvre le message de Mee en entier", bundle: .main) }

    static var photoOffer: String { String(localized: "game.concept.photo.offer", defaultValue: "Immortaliser ce moment", bundle: .main) }

    static var linkRules: String { String(localized: "game.concept.link.rules", defaultValue: "La règle du jeu", bundle: .main) }

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

    static func chipPrismHour(_ a: String) -> String {
        String(localized: "game.concept.chip.prism_hour", defaultValue: "Heure Prisme ×\(a)", bundle: .main)
    }

    static func chipConvertible(_ a: String) -> String {
        String(localized: "game.concept.chip.convertible", defaultValue: "\(a) à convertir", bundle: .main)
    }

    static func chipNextPrice(_ a: String) -> String {
        String(localized: "game.concept.chip.next_price", defaultValue: "Prochaine : \(a)", bundle: .main)
    }

    static var chipMintReady: String { String(localized: "game.concept.chip.mint_ready", defaultValue: "Prête à frapper", bundle: .main) }

    static func chipMinted(_ a: String) -> String {
        String(localized: "game.concept.chip.minted", defaultValue: "\(a) frappées", bundle: .main)
    }

    static func chipGloryMissing(_ a: String) -> String {
        String(localized: "game.concept.chip.glory_missing", defaultValue: "Encore \(a) de Gloire", bundle: .main)
    }

    static var chipTopRank: String { String(localized: "game.concept.chip.top_rank", defaultValue: "Rang le plus haut", bundle: .main) }

    static func chipFreezes(_ a: String, _ b: String) -> String {
        String(localized: "game.concept.chip.freezes", defaultValue: "Gels : \(a) / \(b)", bundle: .main)
    }

    static var chipChestReady: String { String(localized: "game.concept.chip.chest.ready", defaultValue: "Coffre prêt", bundle: .main) }

    static var chipChestLocked: String { String(localized: "game.concept.chip.chest.locked", defaultValue: "Coffre fermé", bundle: .main) }

    static var chipChestClaimed: String { String(localized: "game.concept.chip.chest.claimed", defaultValue: "Coffre ouvert", bundle: .main) }

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

    static func chipWeek(_ a: String, _ b: String) -> String {
        String(localized: "game.concept.chip.week", defaultValue: "Semaine \(a) sur \(b)", bundle: .main)
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

    static var factBalance: String { String(localized: "game.concept.fact.balance", defaultValue: "Solde", bundle: .main) }

    static var factMinted: String { String(localized: "game.concept.fact.minted", defaultValue: "Frappées en tout", bundle: .main) }

    static var factNextPrice: String { String(localized: "game.concept.fact.next_price", defaultValue: "Prix de la prochaine", bundle: .main) }

    static var factMissing: String { String(localized: "game.concept.fact.missing", defaultValue: "Il te manque", bundle: .main) }

    static var factNextCoin: String { String(localized: "game.concept.fact.next_coin", defaultValue: "Prochaine pièce", bundle: .main) }

    static func factCoin(_ a: String, _ b: String) -> String {
        String(localized: "game.concept.fact.coin", defaultValue: "n° \(a) · \(b)", bundle: .main)
    }

    static var factTreasury: String { String(localized: "game.concept.fact.treasury", defaultValue: "Trésor", bundle: .main) }

    static var factNextTreasury: String { String(localized: "game.concept.fact.next_treasury", defaultValue: "Prochain palier du trésor", bundle: .main) }

    static var factRank: String { String(localized: "game.concept.fact.rank", defaultValue: "Rang", bundle: .main) }

    static var factNextRank: String { String(localized: "game.concept.fact.next_rank", defaultValue: "Prochain rang", bundle: .main) }

    static var factStreak: String { String(localized: "game.concept.fact.streak", defaultValue: "Série", bundle: .main) }

    static var factForm: String { String(localized: "game.concept.fact.form", defaultValue: "Forme", bundle: .main) }

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

    static var factReroll: String { String(localized: "game.concept.fact.reroll", defaultValue: "Changement du jour", bundle: .main) }

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

    static var factUnlocked: String { String(localized: "game.concept.fact.unlocked", defaultValue: "Obtenus", bundle: .main) }

    static var factRemaining: String { String(localized: "game.concept.fact.remaining", defaultValue: "Restants", bundle: .main) }

    static var factTrophies: String { String(localized: "game.concept.fact.trophies", defaultValue: "Trophées", bundle: .main) }

    static var factVisible: String { String(localized: "game.concept.fact.visible", defaultValue: "Visible par", bundle: .main) }

    static var factStamps: String { String(localized: "game.concept.fact.stamps", defaultValue: "Tampons", bundle: .main) }

    static var factPending: String { String(localized: "game.concept.fact.pending", defaultValue: "À moitié faits", bundle: .main) }

    static var factYes: String { String(localized: "game.concept.fact.yes", defaultValue: "Oui", bundle: .main) }

    static var factNo: String { String(localized: "game.concept.fact.no", defaultValue: "Non", bundle: .main) }

    static var factAvailable: String { String(localized: "game.concept.fact.available", defaultValue: "Disponible", bundle: .main) }

    static var factUsed: String { String(localized: "game.concept.fact.used", defaultValue: "Déjà utilisé", bundle: .main) }

}
