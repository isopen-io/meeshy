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
        case .level: String(localized: "game.concept.level.name", defaultValue: "La Lumière", bundle: .main)
        case .points: String(localized: "game.concept.points.name", defaultValue: "Étincelles", bundle: .main)
        case .meesh: String(localized: "game.concept.meesh.name", defaultValue: "L’Héritage", bundle: .main)
        case .glory: String(localized: "game.concept.glory.name", defaultValue: "Le Rang", bundle: .main)
        case .flame: String(localized: "game.concept.flame.name", defaultValue: "La Flamme", bundle: .main)
        case .missions: String(localized: "game.concept.missions.name", defaultValue: "Le Rêve", bundle: .main)
        case .league: String(localized: "game.concept.league.name", defaultValue: "La Joute", bundle: .main)
        case .season: String(localized: "game.concept.season.name", defaultValue: "Le Voyage", bundle: .main)
        case .prestige: String(localized: "game.concept.prestige.name", defaultValue: "La Renaissance", bundle: .main)
        case .elans: String(localized: "game.concept.elans.name", defaultValue: "Élans", bundle: .main)
        case .badges: String(localized: "game.concept.badges.name", defaultValue: "Médailles", bundle: .main)
        case .defis: String(localized: "game.concept.defis.name", defaultValue: "Défis", bundle: .main)
        case .succes: String(localized: "game.concept.succes.name", defaultValue: "Hauts faits", bundle: .main)
        case .showcase: String(localized: "game.concept.showcase.name", defaultValue: "Trophées", bundle: .main)
        case .atlas: String(localized: "game.concept.atlas.name", defaultValue: "L’Atlas", bundle: .main)
        }
    }

    /// À quoi ça sert — UNE phrase, lisible à 13 ans. La carte la dit, la fiche la reprend sous « C’est quoi ? ».
    static func why(_ concept: ProgressionConcept) -> String {
        switch concept {
        case .level: String(localized: "game.concept.level.why", defaultValue: "Ta lumière dit le chemin que tu as parcouru sur Meeshy.", bundle: .main)
        case .points: String(localized: "game.concept.points.why", defaultValue: "Tes étincelles forment ta lumière ; son éclat, c’est ton niveau.", bundle: .main)
        case .meesh: String(localized: "game.concept.meesh.why", defaultValue: "Les Meeshes que tu gardes forment l’héritage que tu laisses à ta lignée.", bundle: .main)
        case .glory: String(localized: "game.concept.glory.why", defaultValue: "Ta gloire te donne ton nom, et ce nom ne recule jamais.", bundle: .main)
        case .flame: String(localized: "game.concept.flame.why", defaultValue: "Ta Flamme dit tes jours d’affilée, et elle nourrit tes rêves.", bundle: .main)
        case .missions: String(localized: "game.concept.missions.why", defaultValue: "Chaque nuit, tes aïeux t’envoient un rêve à réaliser.", bundle: .main)
        case .league: String(localized: "game.concept.league.why", defaultValue: "Chaque semaine, la joute te mesure à 29 autres héros.", bundle: .main)
        case .season: String(localized: "game.concept.season.why", defaultValue: "Le voyage dure huit semaines en terre de langue, avec une coupe au bout.", bundle: .main)
        case .prestige: String(localized: "game.concept.prestige.why", defaultValue: "La renaissance s’offre à ceux dont la lumière atteint le niveau 100.", bundle: .main)
        case .elans: String(localized: "game.concept.elans.why", defaultValue: "Un élan multiplie les étincelles de tes prochains gestes.", bundle: .main)
        case .badges: String(localized: "game.concept.badges.why", defaultValue: "Une médaille montre ce que tu pratiques le plus sur Meeshy.", bundle: .main)
        case .defis: String(localized: "game.concept.defis.why", defaultValue: "Les défis sont des paliers à franchir, l’un après l’autre.", bundle: .main)
        case .succes: String(localized: "game.concept.succes.why", defaultValue: "Un haut fait marque un moment rare de ta légende.", bundle: .main)
        case .showcase: String(localized: "game.concept.showcase.why", defaultValue: "Tes trophées gardent la trace de tes victoires.", bundle: .main)
        case .atlas: String(localized: "game.concept.atlas.why", defaultValue: "L’Atlas garde un tampon pour chaque langue dans laquelle tu as échangé.", bundle: .main)
        }
    }

    /// Comment ça marche — UNE phrase. La carte la dit, la fiche la reprend à la suite du pourquoi.
    static func how(_ concept: ProgressionConcept) -> String {
        switch concept {
        case .level: String(localized: "game.concept.level.how", defaultValue: "Tes étincelles nourrissent l’anneau : plein, ta lumière gagne un niveau.", bundle: .main)
        case .points: String(localized: "game.concept.points.how", defaultValue: "Chaque vrai échange en fait jaillir : écrire, parler, publier, réagir.", bundle: .main)
        case .meesh: String(localized: "game.concept.meesh.how", defaultValue: "Frapper une Meesh fige une part de ta lumière dans une pièce.", bundle: .main)
        case .glory: String(localized: "game.concept.glory.how", defaultValue: "Frappes, nouveaux niveaux et hauts faits font grandir ta gloire.", bundle: .main)
        case .flame: String(localized: "game.concept.flame.how", defaultValue: "Un geste par jour l’entretient ; une Veilleuse la garde un jour.", bundle: .main)
        case .missions: String(localized: "game.concept.missions.how", defaultValue: "Trois actes par rêve. Quand ils sont réalisés, l’Offrande apparaît.", bundle: .main)
        case .league: String(localized: "game.concept.league.how", defaultValue: "Tes étincelles de la semaine font ta place ; les premiers montent.", bundle: .main)
        case .season: String(localized: "game.concept.season.how", defaultValue: "Chaque acte réalisé te fait avancer de quelques pas, de halte en halte.", bundle: .main)
        case .prestige: String(localized: "game.concept.prestige.how", defaultValue: "Ta lumière redevient Étincelle et ta légende entre dans un nouvel Âge.", bundle: .main)
        case .elans: String(localized: "game.concept.elans.how", defaultValue: "Fais des gestes de plusieurs familles ces jours-ci pour le déclencher.", bundle: .main)
        case .badges: String(localized: "game.concept.badges.how", defaultValue: "Répète un geste : sa médaille change de matière, du cuivre au prisme.", bundle: .main)
        case .defis: String(localized: "game.concept.defis.how", defaultValue: "Chaque palier atteint ouvre le suivant, un peu plus haut.", bundle: .main)
        case .succes: String(localized: "game.concept.succes.how", defaultValue: "Il s’accomplit d’un coup, quand tu réunis ce qu’il demande.", bundle: .main)
        case .showcase: String(localized: "game.concept.showcase.how", defaultValue: "Chaque coupe s’y range toute seule. Tu choisis l’ordre et qui la voit.", bundle: .main)
        case .atlas: String(localized: "game.concept.atlas.how", defaultValue: "Envoie un message et reçois-en un dans une langue : le tampon se pose.", bundle: .main)
        }
    }

    /// Le premier conseil de la fiche, sous « Comment en gagner ».
    static func tip1(_ concept: ProgressionConcept) -> String {
        switch concept {
        case .level: String(localized: "game.concept.level.tip.1", defaultValue: "Réalise le rêve de chaque nuit : ses actes font jaillir beaucoup d’étincelles.", bundle: .main)
        case .points: String(localized: "game.concept.points.tip.1", defaultValue: "Publie, commente, réagis : chaque geste fait jaillir les siennes.", bundle: .main)
        case .meesh: String(localized: "game.concept.meesh.tip.1", defaultValue: "Garde tes Meeshes : ton héritage passe d’un contenant au suivant.", bundle: .main)
        case .glory: String(localized: "game.concept.glory.tip.1", defaultValue: "Frappe une Meesh : chaque frappe fait grandir ta gloire.", bundle: .main)
        case .flame: String(localized: "game.concept.flame.tip.1", defaultValue: "Fais au moins un geste chaque jour.", bundle: .main)
        case .missions: String(localized: "game.concept.missions.tip.1", defaultValue: "Commence par l’acte le plus facile.", bundle: .main)
        case .league: String(localized: "game.concept.league.tip.1", defaultValue: "Joue un peu chaque jour : les étincelles de la semaine s’additionnent.", bundle: .main)
        case .season: String(localized: "game.concept.season.tip.1", defaultValue: "Réalise les actes de ton rêve pour avancer de quelques pas.", bundle: .main)
        case .prestige: String(localized: "game.concept.prestige.tip.1", defaultValue: "Porte ta lumière jusqu’au niveau 100.", bundle: .main)
        case .elans: String(localized: "game.concept.elans.tip.1", defaultValue: "Varie tes gestes : écris, publie, commente, réagis.", bundle: .main)
        case .badges: String(localized: "game.concept.badges.tip.1", defaultValue: "Choisis un geste que tu aimes et refais-le souvent.", bundle: .main)
        case .defis: String(localized: "game.concept.defis.tip.1", defaultValue: "Regarde le prochain palier et avance vers lui.", bundle: .main)
        case .succes: String(localized: "game.concept.succes.tip.1", defaultValue: "Explore l’application : certains hauts faits se cachent.", bundle: .main)
        case .showcase: String(localized: "game.concept.showcase.tip.1", defaultValue: "Finis en haut de ta joute pour gagner une coupe.", bundle: .main)
        case .atlas: String(localized: "game.concept.atlas.tip.1", defaultValue: "Écris à quelqu’un dans une autre langue que la tienne.", bundle: .main)
        }
    }

    /// Le second conseil de la fiche.
    static func tip2(_ concept: ProgressionConcept) -> String {
        switch concept {
        case .level: String(localized: "game.concept.level.tip.2", defaultValue: "Garde ta Flamme allumée : elle nourrit tes rêves.", bundle: .main)
        case .points: String(localized: "game.concept.points.tip.2", defaultValue: "Déclenche un élan pour multiplier tes étincelles.", bundle: .main)
        case .meesh: String(localized: "game.concept.meesh.tip.2", defaultValue: "Dépense-les pour veiller sur ta Flamme ou changer un acte de ton rêve.", bundle: .main)
        case .glory: String(localized: "game.concept.glory.tip.2", defaultValue: "Porte ta lumière plus haut que jamais et accomplis des hauts faits.", bundle: .main)
        case .flame: String(localized: "game.concept.flame.tip.2", defaultValue: "Garde une Veilleuse pour les jours sans.", bundle: .main)
        case .missions: String(localized: "game.concept.missions.tip.2", defaultValue: "Un acte ne te plaît pas ? Change-le, une fois par jour.", bundle: .main)
        case .league: String(localized: "game.concept.league.tip.2", defaultValue: "Vise les premières places avant dimanche soir.", bundle: .main)
        case .season: String(localized: "game.concept.season.tip.2", defaultValue: "Fais alliance avec un ami : la récompense double.", bundle: .main)
        case .prestige: String(localized: "game.concept.prestige.tip.2", defaultValue: "Renais quand tu veux : rien ne t’y oblige.", bundle: .main)
        case .elans: String(localized: "game.concept.elans.tip.2", defaultValue: "Reviens plusieurs jours de suite pour le garder.", bundle: .main)
        case .badges: String(localized: "game.concept.badges.tip.2", defaultValue: "Une médaille éteinte se rallume : rien n’est perdu.", bundle: .main)
        case .defis: String(localized: "game.concept.defis.tip.2", defaultValue: "Essaie des gestes nouveaux : chacun a ses défis.", bundle: .main)
        case .succes: String(localized: "game.concept.succes.tip.2", defaultValue: "Les plus rares font le plus grandir ta gloire.", bundle: .main)
        case .showcase: String(localized: "game.concept.showcase.tip.2", defaultValue: "Achève un voyage ou renais.", bundle: .main)
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

    static var linkLeague: String { String(localized: "game.concept.link.league", defaultValue: "Les places de la joute", bundle: .main) }

    static var linkSeason: String { String(localized: "game.concept.link.season", defaultValue: "Le chemin du voyage", bundle: .main) }

    static var linkPrestige: String { String(localized: "game.concept.link.prestige", defaultValue: "Page de la renaissance", bundle: .main) }

    static var linkShowcase: String { String(localized: "game.concept.link.showcase", defaultValue: "Ranger mes trophées", bundle: .main) }

    static var linkAtlas: String { String(localized: "game.concept.link.atlas", defaultValue: "Voir mes tampons", bundle: .main) }

    static var linkBadges: String { String(localized: "game.concept.link.badges", defaultValue: "Toutes les médailles", bundle: .main) }

    static var linkDefis: String { String(localized: "game.concept.link.defis", defaultValue: "Tous les défis", bundle: .main) }

    static var linkSucces: String { String(localized: "game.concept.link.succes", defaultValue: "Tous les hauts faits", bundle: .main) }

    static func ratio(_ a: String, _ b: String) -> String {
        String(localized: "game.concept.ratio", defaultValue: "\(a) / \(b)", bundle: .main)
    }

    static func valueFactor(_ a: String) -> String {
        String(localized: "game.concept.value.factor", defaultValue: "×\(a)", bundle: .main)
    }

    static var valueNoElan: String { String(localized: "game.concept.value.no_elan", defaultValue: "Pas encore d’élan", bundle: .main) }

    static func chipRecordLevel(_ a: String) -> String {
        String(localized: "game.concept.chip.record_level", defaultValue: "Au plus haut : niveau \(a)", bundle: .main)
    }

    static var chipMintReady: String { String(localized: "game.concept.chip.mint_ready", defaultValue: "Prête à frapper", bundle: .main) }

    static func chipMinted(_ a: String) -> String {
        String(localized: "game.concept.chip.minted", defaultValue: "\(a) frappées", bundle: .main)
    }

    static var chipTopRank: String { String(localized: "game.concept.chip.top_rank", defaultValue: "Rang le plus haut", bundle: .main) }

    static func chipFreezesOf(_ a: String, _ b: String) -> String {
        String(localized: "game.concept.chip.freezes_of", defaultValue: "Veilleuses : \(a) / \(b)", bundle: .main)
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
        String(localized: "game.concept.chip.glory_on_pass", defaultValue: "+\(a) de gloire", bundle: .main)
    }

    static var chipPersonal: String { String(localized: "game.concept.chip.personal", defaultValue: "Acte personnel", bundle: .main) }

    static var factTier: String { String(localized: "game.concept.fact.tier", defaultValue: "État de ta lumière", bundle: .main) }

    static var factNextLevel: String { String(localized: "game.concept.fact.next_level", defaultValue: "Prochain niveau", bundle: .main) }

    static var factRecord: String { String(localized: "game.concept.fact.record", defaultValue: "Au plus haut", bundle: .main) }

    static var factPrismHour: String { String(localized: "game.concept.fact.prism_hour", defaultValue: "Heure Prisme", bundle: .main) }

    /// Le Voyage compte des pas, la Renaissance des renaissances : « étoile » n'appartient qu'au ciel des aïeux (épopée § 4, #11173).
    static var factStrides: String { String(localized: "game.fact.strides", defaultValue: "Pas", bundle: .main) }

    static var factRebirths: String { String(localized: "game.fact.rebirths", defaultValue: "Renaissances", bundle: .main) }

    static var factConvertible: String { String(localized: "game.concept.fact.convertible", defaultValue: "Étincelles", bundle: .main) }

    static var factMinted: String { String(localized: "game.concept.fact.minted", defaultValue: "Frappées depuis toujours", bundle: .main) }

    static var factNextPrice: String { String(localized: "game.concept.fact.next_price", defaultValue: "Prix de la prochaine", bundle: .main) }

    static var factBalance: String { String(localized: "game.concept.fact.balance", defaultValue: "Tu as", bundle: .main) }

    static var factCost: String { String(localized: "game.concept.fact.cost", defaultValue: "Il faut", bundle: .main) }

    static var factAfter: String { String(localized: "game.concept.fact.after", defaultValue: "Après", bundle: .main) }

    static var factRequired: String { String(localized: "game.concept.fact.required", defaultValue: "Requis", bundle: .main) }

    static func factCoin(_ a: String, _ b: String) -> String {
        String(localized: "game.concept.fact.coin", defaultValue: "n° \(a) · \(b)", bundle: .main)
    }

    static var factTreasury: String { String(localized: "game.concept.fact.treasury", defaultValue: "Héritage", bundle: .main) }

    static var factNextTreasury: String { String(localized: "game.concept.fact.next_treasury", defaultValue: "Contenant suivant", bundle: .main) }

    static var factRank: String { String(localized: "game.concept.fact.rank", defaultValue: "Rang", bundle: .main) }

    static var factNextRank: String { String(localized: "game.concept.fact.next_rank", defaultValue: "Prochain rang", bundle: .main) }

    static var factStreak: String { String(localized: "game.concept.fact.streak", defaultValue: "Flamme", bundle: .main) }

    static var factBonus: String { String(localized: "game.concept.fact.bonus", defaultValue: "Bonus sur tes rêves", bundle: .main) }

    static func factPercent(_ a: String) -> String {
        String(localized: "game.concept.fact.percent", defaultValue: "+\(a) %", bundle: .main)
    }

    static var factFreezes: String { String(localized: "game.concept.fact.freezes", defaultValue: "Veilleuses", bundle: .main) }

    static var factFreezePrice: String { String(localized: "game.concept.fact.freeze_price", defaultValue: "Prix d’une Veilleuse", bundle: .main) }

    static var factRelightPrice: String { String(localized: "game.concept.fact.relight_price", defaultValue: "Prix pour rallumer", bundle: .main) }

    static var factState: String { String(localized: "game.concept.fact.state", defaultValue: "État", bundle: .main) }

    static var factDone: String { String(localized: "game.concept.fact.done", defaultValue: "Terminées", bundle: .main) }

    static var factChest: String { String(localized: "game.concept.fact.chest", defaultValue: "Coffre", bundle: .main) }

    static var factWeekPoints: String { String(localized: "game.concept.fact.week_points", defaultValue: "Étincelles de la semaine", bundle: .main) }

    static var factZone: String { String(localized: "game.concept.fact.zone", defaultValue: "Zone", bundle: .main) }

    static var factCloses: String { String(localized: "game.concept.fact.closes", defaultValue: "Fermeture", bundle: .main) }

    static var factFriends: String { String(localized: "game.concept.fact.friends", defaultValue: "Entre amis", bundle: .main) }

    static var factWeek: String { String(localized: "game.concept.fact.week", defaultValue: "Semaine", bundle: .main) }

    static var factSteps: String { String(localized: "game.concept.fact.steps", defaultValue: "Haltes", bundle: .main) }

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

    static var chipChestLocked: String { String(localized: "game.concept.chip.chest.locked", defaultValue: "Offrande voilée", bundle: .main) }

    static var chipChestReady: String { String(localized: "game.concept.chip.chest.ready", defaultValue: "Offrande prête", bundle: .main) }

    static var chipChestClaimed: String { String(localized: "game.concept.chip.chest.claimed", defaultValue: "Offrande ouverte", bundle: .main) }

    // MARK: - Quatre questions par concept, deux soldes nommés, un manque qui dit sa cible (#10540)
    //
    // Les clés sont celles du web (`catalog-game-concept-<langue>.ts`), phrase pour phrase, dans les sept langues.

    /// Ce que c’est — la première phrase de « C’est quoi ? ».
    static func what(_ concept: ProgressionConcept) -> String {
        switch concept {
        case .level: String(localized: "game.concept.level.what", defaultValue: "Ton niveau est le chiffre au centre de ton anneau. Il se lit sur ta lumière : 10 000 étincelles pour le niveau 10, un million pour le niveau 100. Frapper une Meesh en fige une part, donc fait baisser ton niveau ; ce que tu as reçu reste reçu.", bundle: .main)
        case .points: String(localized: "game.concept.points.what", defaultValue: "Chaque vrai échange fait jaillir des étincelles : ensemble, elles forment ta lumière. Plus elle grandit, plus elle brille, et son éclat, c’est ton niveau.", bundle: .main)
        case .meesh: String(localized: "game.concept.meesh.what", defaultValue: "Une Meesh, c’est ta lumière figée dans une pièce numérotée, que tu frappes toi-même. Une sur cent est d’or, une sur mille de prisme.", bundle: .main)
        case .glory: String(localized: "game.concept.glory.what", defaultValue: "Ta gloire grandit et ne recule jamais. Elle te donne ton rang, parmi onze : de Murmure à Légende, puis le Mythe.", bundle: .main)
        case .flame: String(localized: "game.concept.flame.what", defaultValue: "Ta Flamme est le feu que tes aïeux te confient : elle grandit chaque jour où tu fais au moins un geste, et change de forme en grandissant, de la Braise au Soleil.", bundle: .main)
        case .missions: String(localized: "game.concept.missions.what", defaultValue: "Chaque nuit, un rêve en trois actes : de petits buts à réaliser dans la journée, de plus en plus riches en gloire. L’Offrande l’accompagne.", bundle: .main)
        case .league: String(localized: "game.concept.league.what", defaultValue: "La joute est le classement de la semaine : trente héros de lumière semblable s’y mesurent sous leur nom de joute. Il y a huit cercles, du Quartz au Prisme.", bundle: .main)
        case .season: String(localized: "game.concept.season.what", defaultValue: "Un voyage dure huit semaines, dans une terre de langue, avec quarante haltes et leurs présents gratuits.", bundle: .main)
        case .prestige: String(localized: "game.concept.prestige.what", defaultValue: "La renaissance ouvre un nouvel Âge de ta légende, offert au niveau 100, quand ta lumière est devenue Galaxie. Elle est facultative : cinq renaissances au plus mènent au Sixième Âge.", bundle: .main)
        case .elans: String(localized: "game.concept.elans.what", defaultValue: "Un élan est un multiplicateur d’étincelles. Il s’allume quand tu es actif dans plusieurs familles de gestes ces jours-ci.", bundle: .main)
        case .badges: String(localized: "game.concept.badges.what", defaultValue: "Une médaille suit un geste précis : un message vocal, une story, une amitié nouée. Il y en a vingt.", bundle: .main)
        case .defis: String(localized: "game.concept.defis.what", defaultValue: "Un défi est un palier chiffré dans une famille de gestes : un nombre à atteindre.", bundle: .main)
        case .succes: String(localized: "game.concept.succes.what", defaultValue: "Un haut fait est une distinction qui s’accomplit une seule fois, avec sa date et sa rareté.", bundle: .main)
        case .showcase: String(localized: "game.concept.showcase.what", defaultValue: "L’étagère de tes trophées : coupes de joute et de voyage, trophées de renaissance et de Flamme.", bundle: .main)
        case .atlas: String(localized: "game.concept.atlas.what", defaultValue: "L’Atlas est ton passeport des langues : les terres que ta voix a traversées, un tampon par langue vraiment échangée.", bundle: .main)
        }
    }

    /// Comment s’en servir — la section « Comment m’en servir » de la fiche.
    static func use(_ concept: ProgressionConcept) -> String {
        switch concept {
        case .level: String(localized: "game.concept.level.use", defaultValue: "Ta lumière ouvre le rêve au niveau 5, la joute au 10, l’alliance au 20 et la renaissance au 100. Tous les dix niveaux, de 10 à 100, tes aïeux demandent une épreuve. Frapper une Meesh fige une part de ta lumière et fait baisser ton niveau, mais la joute et l’alliance, une fois ouvertes, le restent.", bundle: .main)
        case .points: String(localized: "game.concept.points.use", defaultValue: "Ta lumière frappe les Meeshes de ton héritage. Frapper une Meesh en fige une part dans la pièce : ta lumière, donc ton niveau, baisse d’autant. Ce que tu as reçu reste reçu.", bundle: .main)
        case .meesh: String(localized: "game.concept.meesh.use", defaultValue: "Garde tes Meeshes : elles remplissent ton héritage, de la Bourse à la Réserve, visible sur ton profil. Ou dépense-les : une Veilleuse pour ta Flamme, un acte à changer, le Sceau du voyage. Chaque frappe fait aussi grandir ta gloire.", bundle: .main)
        case .glory: String(localized: "game.concept.glory.use", defaultValue: "Ton rang se montre sur ton blason et sur ton profil. Il ouvre aussi ta lumière : jusqu’au niveau 499 sous Ambassadeur, 1000 dès Ambassadeur, sans limite dès Oracle.", bundle: .main)
        case .flame: String(localized: "game.concept.flame.use", defaultValue: "Chaque jour de Flamme ajoute 2 % aux étincelles de tes rêves, jusqu’à 50 %. Une Veilleuse la garde un jour d’absence. Éteinte, elle se rallume avec des Meeshes pendant 48 h.", bundle: .main)
        case .missions: String(localized: "game.concept.missions.use", defaultValue: "Ouvre un acte pour voir où tu en es. Tu peux en changer un par jour avec une Meesh. Les trois réalisés, ouvre l’Offrande : des étincelles, de la gloire, parfois une prime, un fragment d’étoile ou une Veilleuse.", bundle: .main)
        case .league: String(localized: "game.concept.league.use", defaultValue: "Regarde ta place et ta zone : les 7 premiers gravissent le cercle suivant, les 5 derniers redescendent. Tout repart de zéro chaque lundi. La joute publique demande ton accord ; la Joute des amis reste toujours ouverte.", bundle: .main)
        case .season: String(localized: "game.concept.season.use", defaultValue: "Avance de quelques pas, puis réclame chaque halte atteinte : des étincelles, un fragment d’étoile, une Veilleuse. Le voyage fini donne la coupe du voyage. Le Sceau du voyage est un objet à collectionner, pris avec des Meeshes.", bundle: .main)
        case .prestige: String(localized: "game.concept.prestige.use", defaultValue: "Au niveau 100, choisis : renaître, ou continuer à briller. Renaître remet ton niveau à 1 et ta lumière à zéro. Tu gardes tes étincelles reçues depuis toujours, ta plus haute lumière, ton rang, ta gloire, tes Meeshes, ta Flamme et tes trophées ; ta joute et ton alliance restent ouvertes.", bundle: .main)
        case .elans: String(localized: "game.concept.elans.use", defaultValue: "Regarde quelles familles sont actives, puis fais un geste dans une famille qui manque. Tant que l’élan tient, chaque geste fait jaillir plus d’étincelles.", bundle: .main)
        case .badges: String(localized: "game.concept.badges.use", defaultValue: "Touche une médaille pour voir ce qu’elle suit, sa matière et ce qu’il manque pour la prochaine étoile. Une frappe n’en éteint aucune : une médaille dit ton total réel.", bundle: .main)
        case .defis: String(localized: "game.concept.defis.use", defaultValue: "Ouvre la liste, repère le palier le plus proche et avance vers lui. Chaque palier dit sa rareté.", bundle: .main)
        case .succes: String(localized: "game.concept.succes.use", defaultValue: "Ouvre un haut fait pour lire ce qu’il demande. Accompli, il fait grandir ta gloire : plus il est rare, plus elle grandit.", bundle: .main)
        case .showcase: String(localized: "game.concept.showcase.use", defaultValue: "Range tes trophées dans l’ordre que tu veux et choisis qui les voit : tout le monde, tes amis ou toi seul. Un trophée ne rapporte rien : il se montre.", bundle: .main)
        case .atlas: String(localized: "game.concept.atlas.use", defaultValue: "Regarde les échanges à moitié faits : il manque un message envoyé ou un message reçu pour poser le tampon. Ton Atlas est privé par défaut : tu choisis qui le voit.", bundle: .main)
        }
    }

    static var ficheUse: String { String(localized: "game.fiche.use", defaultValue: "Comment m’en servir", bundle: .main) }

    static var factHeld: String { String(localized: "game.concept.fact.held", defaultValue: "Ta lumière", bundle: .main) }

    static var factToConvert: String { String(localized: "game.fact.to_convert", defaultValue: "Ta lumière", bundle: .main) }

    static func chipToLevel(level: String, points: String) -> String {
        String(localized: "game.concept.chip.to_level", defaultValue: "Niveau \(level) dans \(points)", bundle: .main)
    }

    static func chipToMeesh(number: String, missing: String) -> String {
        String(localized: "game.concept.chip.to_meesh", defaultValue: "Meesh n° \(number) : il manque \(missing)", bundle: .main)
    }

    static var chipMintCovered: String { String(localized: "game.concept.chip.mint_covered", defaultValue: "De quoi frapper une Meesh", bundle: .main) }

    static func chipNext(name: String) -> String {
        String(localized: "game.concept.chip.next", defaultValue: "Ensuite : \(name)", bundle: .main)
    }

    static func missingForLevel(level: String) -> String {
        String(localized: "game.fact.missing_for.level", defaultValue: "Jusqu’au niveau \(level)", bundle: .main)
    }

    static func missingForMeesh(number: String) -> String {
        String(localized: "game.fact.missing_for.meesh", defaultValue: "Jusqu’à la Meesh n° \(number)", bundle: .main)
    }

    static func missingForRank(rank: String) -> String {
        String(localized: "game.fact.missing_for.rank", defaultValue: "Jusqu’à \(rank)", bundle: .main)
    }

    static var missingForPromotion: String { String(localized: "game.fact.missing_for.promotion", defaultValue: "Jusqu’à la zone de montée", bundle: .main) }

    static func spendMissingMint(missing: String, number: String) -> String {
        String(localized: "game.spend.missing.mint", defaultValue: "Il manque \(missing) à ta lumière pour frapper la Meesh n° \(number).", bundle: .main)
    }

    static func spendMissingFreeze(missing: String) -> String {
        String(localized: "game.spend.missing.freeze", defaultValue: "Il manque \(missing) pour prendre une Veilleuse.", bundle: .main)
    }

    static func spendMissingRelight(missing: String) -> String {
        String(localized: "game.spend.missing.relight", defaultValue: "Il manque \(missing) pour rallumer ta Flamme.", bundle: .main)
    }

    static func spendMissingReroll(missing: String) -> String {
        String(localized: "game.spend.missing.reroll", defaultValue: "Il manque \(missing) pour changer cet acte.", bundle: .main)
    }

    static func spendMissingSeal(missing: String) -> String {
        String(localized: "game.spend.missing.seal", defaultValue: "Il manque \(missing) pour prendre le Sceau du voyage.", bundle: .main)
    }

    static func spendMissingUnlock(missing: String) -> String {
        String(localized: "game.spend.missing.unlock", defaultValue: "Il manque \(missing) pour l’ouvrir.", bundle: .main)
    }

    // MARK: - La phrase d’état d’un concept (#10540)
    //
    // MIROIR des clés `game.state.*` du web : `ProgressionConceptModel.state` choisit la phrase, ce fichier la dit.

    static func stateLevelProgress(level: String, done: String, span: String, left: String, next: String) -> String {
        String(localized: "game.state.level.progress", defaultValue: "Ta lumière brille au niveau \(level) : \(done) sur les \(span) de ce niveau, \(left) jusqu’au niveau \(next).", bundle: .main)
    }

    static func stateLevelSimple(level: String, left: String, next: String) -> String {
        String(localized: "game.state.level.simple", defaultValue: "Ta lumière brille au niveau \(level) : \(left) jusqu’au niveau \(next).", bundle: .main)
    }

    static func statePointsMissing(held: String, convertible: String, number: String, price: String, missing: String) -> String {
        String(localized: "game.state.points.missing", defaultValue: "Ta lumière compte \(held), soit \(convertible). La Meesh n° \(number) en figera \(price) : il manque \(missing).", bundle: .main)
    }

    static func statePointsReady(held: String, convertible: String, number: String, price: String) -> String {
        String(localized: "game.state.points.ready", defaultValue: "Ta lumière compte \(held), soit \(convertible) : assez pour frapper la Meesh n° \(number), qui en figera \(price).", bundle: .main)
    }

    /// Les étincelles (#10846) : la poche seule, toute convertible, et ce qui manque pour la pièce visée.
    static func statePointsMissingPlain(held: String, number: String, price: String, missing: String) -> String {
        String(localized: "game.state.points.missing_plain",
               defaultValue: "Ta lumière compte \(held). La Meesh n° \(number) en figera \(price) : il manque \(missing).",
               bundle: .main)
    }

    static func statePointsReadyPlain(held: String, number: String, price: String) -> String {
        String(localized: "game.state.points.ready_plain", defaultValue: "Ta lumière compte \(held) : de quoi frapper la Meesh n° \(number), qui en figera \(price).", bundle: .main)
    }

    static func stateMeeshKept(balance: String, minted: String) -> String {
        String(localized: "game.state.meesh.kept", defaultValue: "Ton héritage garde \(balance). Depuis toujours, tu en as frappé \(minted).", bundle: .main)
    }

    static func stateMeeshKeptNone(minted: String) -> String {
        String(localized: "game.state.meesh.kept_none", defaultValue: "Ton héritage ne garde aucune Meesh. Depuis toujours, tu en as frappé \(minted).", bundle: .main)
    }

    static func stateMeeshNextMissing(number: String, price: String, missing: String) -> String {
        String(localized: "game.state.meesh.next_missing", defaultValue: "La Meesh n° \(number) figera \(price) de ta lumière : il manque \(missing).", bundle: .main)
    }

    static func stateMeeshNextReady(number: String, price: String) -> String {
        String(localized: "game.state.meesh.next_ready", defaultValue: "Tu peux frapper la Meesh n° \(number) : elle figera \(price) de ta lumière.", bundle: .main)
    }

    static func stateGloryNext(rank: String, glory: String, missing: String, next: String) -> String {
        String(localized: "game.state.glory.next", defaultValue: "On t’appelle \(rank), avec \(glory) de gloire : \(missing) de plus jusqu’à \(next).", bundle: .main)
    }

    static func stateGloryTop(rank: String, glory: String) -> String {
        String(localized: "game.state.glory.top", defaultValue: "On t’appelle \(rank), avec \(glory) de gloire : c’est le plus haut rang.", bundle: .main)
    }

    static var stateFlameNone: String { String(localized: "game.state.flame.none", defaultValue: "Pas de Flamme pour l’instant : un geste aujourd’hui l’allume.", bundle: .main) }

    static func stateFlameLit(days: String, bonus: String, freezes: String) -> String {
        String(localized: "game.state.flame.lit", defaultValue: "Ta Flamme brûle depuis \(days) : elle nourrit tes rêves de \(bonus) % de plus. Veilleuses : \(freezes).", bundle: .main)
    }

    static func stateFlameAtRisk(days: String) -> String {
        String(localized: "game.state.flame.at_risk", defaultValue: "Ta Flamme de \(days) vacille : fais un geste avant minuit pour la garder.", bundle: .main)
    }

    static func stateFlameCovered(days: String) -> String {
        String(localized: "game.state.flame.covered", defaultValue: "Une Veilleuse garde ta Flamme de \(days) : fais un geste aujourd’hui pour la nourrir.", bundle: .main)
    }

    static var stateFlameOut: String { String(localized: "game.state.flame.out", defaultValue: "Ta Flamme est éteinte. Un geste en allume une nouvelle.", bundle: .main) }

    static func stateFlameStreak(days: String, record: String) -> String {
        String(localized: "game.state.flame.streak", defaultValue: "Ta Flamme brûle depuis \(days). Ta plus longue Flamme : \(record).", bundle: .main)
    }

    static func stateMissionsProgress(done: String, total: String, left: String) -> String {
        String(localized: "game.state.missions.progress", defaultValue: "Le rêve de cette nuit : \(done) sur \(total) actes, et \(left) à réaliser pour voir l’Offrande.", bundle: .main)
    }

    static func stateMissionsReady(done: String, total: String) -> String {
        String(localized: "game.state.missions.ready", defaultValue: "Le rêve de cette nuit : \(done) sur \(total) actes. L’Offrande est là : ouvre-la.", bundle: .main)
    }

    static func stateMissionsClaimed(done: String, total: String) -> String {
        String(localized: "game.state.missions.claimed", defaultValue: "Le rêve de cette nuit : \(done) sur \(total) actes. L’Offrande est ouverte : un nouveau rêve viendra cette nuit.", bundle: .main)
    }

    static var stateLeagueUnplaced: String { String(localized: "game.state.league.unplaced", defaultValue: "Tu n’as pas encore de place dans la joute cette semaine. La Joute des amis reste ouverte.", bundle: .main) }

    static func stateLeaguePlace(league: String, rank: String, size: String, points: String) -> String {
        String(localized: "game.state.league.place", defaultValue: "Joute de \(league) : place \(rank) sur \(size), avec \(points) cette semaine.", bundle: .main)
    }

    static var stateLeagueZonePromotion: String { String(localized: "game.state.league.zone.promotion", defaultValue: "Tu es dans la zone de montée : garde ta place.", bundle: .main) }

    static func stateLeagueZoneSafe(missing: String) -> String {
        String(localized: "game.state.league.zone.safe", defaultValue: "Tu tiens ta place : \(missing) jusqu’à la zone de montée.", bundle: .main)
    }

    static func stateLeagueZoneRelegation(missing: String) -> String {
        String(localized: "game.state.league.zone.relegation", defaultValue: "Tu es dans la zone de descente : \(missing) jusqu’à la zone de montée.", bundle: .main)
    }

    static func stateSeasonProgress(number: String, week: String, weeks: String, steps: String, total: String, stars: String) -> String {
        String(localized: "game.state.season.progress", defaultValue: "Voyage \(number), semaine \(week) sur \(weeks) : halte \(steps) sur \(total), et \(stars) jusqu’à la suivante.", bundle: .main)
    }

    static func stateSeasonDone(number: String, week: String, weeks: String, total: String) -> String {
        String(localized: "game.state.season.done", defaultValue: "Voyage \(number), semaine \(week) sur \(weeks) : voyage accompli, les \(total) haltes sont atteintes.", bundle: .main)
    }

    static func stateElansActive(factor: String, families: String) -> String {
        String(localized: "game.state.elans.active", defaultValue: "Élan ×\(factor) en cours, avec \(families) : tes prochains gestes rapportent \(factor) fois plus.", bundle: .main)
    }

    static func stateElansIdle(families: String) -> String {
        String(localized: "game.state.elans.idle", defaultValue: "\(families) ces jours-ci : pas d’élan pour l’instant. Sois actif dans une famille de plus pour en déclencher un.", bundle: .main)
    }

    static func stateCountBadges(done: String, total: String, left: String) -> String {
        String(localized: "game.state.count.badges", defaultValue: "Médailles obtenues : \(done) sur \(total), et \(left) à allumer.", bundle: .main)
    }

    static func stateCountDefis(done: String, total: String, left: String) -> String {
        String(localized: "game.state.count.defis", defaultValue: "Défis franchis : \(done) sur \(total), et \(left) à franchir.", bundle: .main)
    }

    static func stateCountSucces(done: String, total: String, left: String) -> String {
        String(localized: "game.state.count.succes", defaultValue: "Hauts faits accomplis : \(done) sur \(total), et \(left) à accomplir.", bundle: .main)
    }

    static func stateCountComplete(done: String, total: String) -> String {
        String(localized: "game.state.count.complete", defaultValue: "Tout est obtenu : \(done) sur \(total).", bundle: .main)
    }

    static func stateShowcaseCount(trophies: String, who: String) -> String {
        String(localized: "game.state.showcase.count", defaultValue: "\(trophies) sur ton étagère. Visible par : \(who).", bundle: .main)
    }

    static func stateAtlasProgress(stamped: String, total: String, pending: String) -> String {
        String(localized: "game.state.atlas.progress", defaultValue: "Langues tamponnées : \(stamped) sur \(total). Échanges à moitié faits : \(pending).", bundle: .main)
    }
}
