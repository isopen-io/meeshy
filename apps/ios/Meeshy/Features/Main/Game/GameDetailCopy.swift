import Foundation
import MeeshySDK

// MARK: - Ce que disent les précisions d'un élément (#9564, amendement n° 2)
//
// MIROIR des clés `game.detail.*` du catalogue du web
// (`apps/web/src/lib/interface-catalogs/catalog-game-concept-<langue>.ts`, #9563) : la MÊME phrase, dans les sept
// langues, sur les deux plateformes. Dix-huit familles d'élément ont deux phrases (`game.detail.<famille>.what` et
// `.how`), trente-sept données en ont une (`game.detail.fact.<donnée>`). Chaque accesseur est une CLÉ LITTÉRALE, que
// la garde du catalogue sait lire ; aucun texte n'est écrit de ce côté. Les noms déjà au catalogue (rangs, paliers,
// formes, ligues) sont réutilisés par le modèle, jamais reformulés ici.
enum GameDetailText {

    // MARK: Le cadre de la feuille

    /// Le titre de la seconde phrase d'une famille qu'on OBTIENT.

    static var obtainLabel: String { String(localized: "game.detail.obtain_label", defaultValue: "Comment l’obtenir", bundle: .main) }

    /// Le titre de la seconde phrase d'une famille qui DONNE quelque chose.
    static var givesLabel: String { String(localized: "game.detail.gives_label", defaultValue: "Ce que ça donne", bundle: .main) }

    static var earned: String { String(localized: "game.detail.earned", defaultValue: "Obtenu", bundle: .main) }

    /// « Obtenu le … » — la date est celle que la passerelle sert, déjà mise en forme.
    static func earnedOn(_ date: String) -> String {
        String(localized: "game.detail.earned_on", defaultValue: "Obtenu le \(date)", bundle: .main)
    }

    static var locked: String { String(localized: "game.detail.locked", defaultValue: "Pas encore obtenu", bundle: .main) }

    /// « Il manque … » — ce qu'il reste à réunir.
    static func missing(_ missing: String) -> String {
        String(localized: "game.detail.missing", defaultValue: "Il manque \(missing)", bundle: .main)
    }

    /// Le lien vers la fiche du concept, hors de cette fiche.
    static var seeFiche: String { String(localized: "game.detail.see_fiche", defaultValue: "Voir la fiche", bundle: .main) }

    /// Ce que VoiceOver dit d'un élément qui se touche : son nom, et que son toucher ouvre ses précisions.
    static func open(_ name: String) -> String {
        String(localized: "game.detail.open", defaultValue: "\(name) : voir les précisions", bundle: .main)
    }

    static var rarity: String { String(localized: "game.detail.rarity", defaultValue: "Rareté", bundle: .main) }

    /// Le nom du groupe de l'en-tête de la première page : le blason de rang et le compteur de Meeshes.
    static var headerGroup: String { String(localized: "game.detail.header_group", defaultValue: "Mon rang et mes Meeshes", bundle: .main) }


    // MARK: Les familles d'élan

    static var elanActive: String { String(localized: "game.detail.elan.active", defaultValue: "Active ces jours-ci", bundle: .main) }

    static var elanIdle: String { String(localized: "game.detail.elan.idle", defaultValue: "Pas active ces jours-ci", bundle: .main) }

    /// « 10 points par geste » — ce qu'un geste de la famille rapporte.
    static func elanPoints(_ points: String) -> String {
        String(localized: "game.detail.elan.points", defaultValue: "\(points) par geste", bundle: .main)
    }


    // MARK: Une ligne du classement de la ligue

    /// Ce qu'on voit d'un autre joueur : son pseudonyme et ses points de la semaine, rien d'autre.
    static var playerWhat: String { String(localized: "game.detail.player.what", defaultValue: "C’est un joueur de ton groupe. Tu ne vois que son pseudonyme et ses points de la semaine.", bundle: .main) }


    // MARK: C’est quoi

    /// « C'est quoi » — la phrase de la famille. Une donnée et une ligne de classement n'en ont pas ici : `nil`.
    static func what(_ kind: GameElementKind) -> String? {
        switch kind {
        case .badge: String(localized: "game.detail.badge.what", defaultValue: "Un badge montre combien de fois tu as fait un geste.", bundle: .main)
        case .achievement: String(localized: "game.detail.succes.what", defaultValue: "Un succès marque un moment rare de ton histoire sur Meeshy.", bundle: .main)
        case .challenge: String(localized: "game.detail.defi.what", defaultValue: "Un défi est un palier à franchir dans une famille de gestes.", bundle: .main)
        case .trophy: String(localized: "game.detail.trophy.what", defaultValue: "Un trophée garde la trace d’une victoire. Il ne rapporte rien : il se montre.", bundle: .main)
        case .stamp: String(localized: "game.detail.stamp.what", defaultValue: "Un tampon prouve que tu as vraiment échangé dans cette langue.", bundle: .main)
        case .seasonStep: String(localized: "game.detail.step.what", defaultValue: "Une étape de saison est une récompense gratuite sur le parcours.", bundle: .main)
        case .seal: String(localized: "game.detail.seal.what", defaultValue: "Le Sceau est un objet à collectionner. Il ne change rien au jeu.", bundle: .main)
        case .leagueGem: String(localized: "game.detail.gem.what", defaultValue: "La gemme dit dans quelle ligue tu joues cette semaine.", bundle: .main)
        case .prestigeStar: String(localized: "game.detail.star.what", defaultValue: "Une étoile de Prestige se pose sur ton anneau de niveau, pour toujours.", bundle: .main)
        case .rank: String(localized: "game.detail.rank.what", defaultValue: "Ton blason montre ton rang. Un rang ne baisse jamais.", bundle: .main)
        case .flameForm: String(localized: "game.detail.flame.what", defaultValue: "La forme de ta Flamme grandit avec ta série de jours.", bundle: .main)
        case .freeze: String(localized: "game.detail.freeze.what", defaultValue: "Un gel protège ta Flamme : il couvre un jour où tu n’as rien fait.", bundle: .main)
        case .mission: String(localized: "game.detail.mission.what", defaultValue: "Une mission est un petit but à atteindre aujourd’hui.", bundle: .main)
        case .chest: String(localized: "game.detail.chest.what", defaultValue: "Le coffre du jour s’ouvre quand tes missions sont faites.", bundle: .main)
        case .coin: String(localized: "game.detail.coin.what", defaultValue: "La Meesh est la pièce rare de Meeshy. Chaque pièce porte son numéro.", bundle: .main)
        case .levelRing: String(localized: "game.detail.ring.what", defaultValue: "L’anneau montre ton niveau : il se remplit avec tes points.", bundle: .main)
        case .treasuryTier: String(localized: "game.detail.treasury.what", defaultValue: "Ton trésor grandit avec les Meeshes que tu gardes.", bundle: .main)
        case .elanFamily: String(localized: "game.detail.elan.what", defaultValue: "Une famille regroupe des gestes qui se ressemblent.", bundle: .main)
        case .fact, .player: nil
        }
    }

    // MARK: Comment l’obtenir, ou ce que ça donne

    /// « Comment l'obtenir » ou « ce que ça donne » — la seconde phrase de la famille. Une donnée et une ligne de classement n'en ont pas ici : `nil`.
    static func how(_ kind: GameElementKind) -> String? {
        switch kind {
        case .badge: String(localized: "game.detail.badge.how", defaultValue: "Refais ce geste : à chaque palier, le badge change de matière.", bundle: .main)
        case .achievement: String(localized: "game.detail.succes.how", defaultValue: "Réunis ce qu’il demande : il se décroche d’un coup.", bundle: .main)
        case .challenge: String(localized: "game.detail.defi.how", defaultValue: "Atteins le nombre demandé : le palier suivant s’ouvre.", bundle: .main)
        case .trophy: String(localized: "game.detail.trophy.how", defaultValue: "Finis en haut de ta ligue, termine une saison, passe en Prestige ou tiens ta Flamme.", bundle: .main)
        case .stamp: String(localized: "game.detail.stamp.how", defaultValue: "Envoie un message dans cette langue, et reçois-en un.", bundle: .main)
        case .seasonStep: String(localized: "game.detail.step.how", defaultValue: "Gagne des étoiles avec les missions et le duo, puis réclame l’étape.", bundle: .main)
        case .seal: String(localized: "game.detail.seal.how", defaultValue: "Prends-le avec tes Meeshes pendant la saison.", bundle: .main)
        case .leagueGem: String(localized: "game.detail.gem.how", defaultValue: "Finis parmi les premiers de ton groupe pour monter d’une ligue.", bundle: .main)
        case .prestigeStar: String(localized: "game.detail.star.how", defaultValue: "Atteins le niveau 100, puis passe en Prestige.", bundle: .main)
        case .rank: String(localized: "game.detail.rank.how", defaultValue: "Gagne de la Gloire : frappe des Meeshes, bats tes records, décroche des succès.", bundle: .main)
        case .flameForm: String(localized: "game.detail.flame.how", defaultValue: "Plus elle est grande, plus tes récompenses de mission augmentent.", bundle: .main)
        case .freeze: String(localized: "game.detail.freeze.how", defaultValue: "Achète-le avec tes Meeshes, ou trouve-le dans le coffre du jour.", bundle: .main)
        case .mission: String(localized: "game.detail.mission.how", defaultValue: "Elle rapporte des points et te rapproche du coffre du jour.", bundle: .main)
        case .chest: String(localized: "game.detail.chest.how", defaultValue: "Des points, et parfois un fragment de Meesh ou un gel.", bundle: .main)
        case .coin: String(localized: "game.detail.coin.how", defaultValue: "Frappe-la avec tes points dès que tu en as assez.", bundle: .main)
        case .levelRing: String(localized: "game.detail.ring.how", defaultValue: "Gagne des points : quand l’anneau est plein, tu montes d’un niveau.", bundle: .main)
        case .treasuryTier: String(localized: "game.detail.treasury.how", defaultValue: "Garde tes Meeshes au lieu de les dépenser pour atteindre le palier suivant.", bundle: .main)
        case .elanFamily: String(localized: "game.detail.elan.how", defaultValue: "Chaque geste rapporte des points. Plusieurs familles actives déclenchent un élan.", bundle: .main)
        case .fact, .player: nil
        }
    }

    // MARK: Les données

    /// La phrase d'une donnée (pastille ou ligne d'une fiche, du tableau de bord).
    static func fact(_ key: GameDetailFactKey) -> String {
        switch key {
        case .tier: String(localized: "game.detail.fact.tier", defaultValue: "Dix niveaux font un palier. Chaque palier a son nom et sa couleur.", bundle: .main)
        case .score: String(localized: "game.detail.fact.score", defaultValue: "Ce sont les points que tu as en poche. Ils font ton niveau.", bundle: .main)
        case .levelNext: String(localized: "game.detail.fact.level_next", defaultValue: "Ce sont les points qu’il te manque pour monter d’un niveau.", bundle: .main)
        case .levelRecord: String(localized: "game.detail.fact.level_record", defaultValue: "C’est le plus haut niveau que tu as atteint.", bundle: .main)
        case .tailwind: String(localized: "game.detail.fact.tailwind", defaultValue: "Après une frappe, tes points comptent plus jusqu’à ton niveau record.", bundle: .main)
        case .mintPrice: String(localized: "game.detail.fact.mint_price", defaultValue: "C’est le prix de ta prochaine Meesh. Il monte à chaque frappe.", bundle: .main)
        case .mintMissing: String(localized: "game.detail.fact.mint_missing", defaultValue: "Ce sont les points qu’il te manque pour frapper ta prochaine Meesh.", bundle: .main)
        case .canMint: String(localized: "game.detail.fact.can_mint", defaultValue: "Tu as assez de points : tu peux frapper une Meesh dans sa fiche.", bundle: .main)
        case .factor: String(localized: "game.detail.fact.factor", defaultValue: "Tes prochains gestes rapportent ce nombre de fois plus de points.", bundle: .main)
        case .mintNext: String(localized: "game.detail.fact.mint_next", defaultValue: "Chaque Meesh porte son numéro. Une sur cent est en or, une sur mille en prisme.", bundle: .main)
        case .mintGlory: String(localized: "game.detail.fact.mint_glory", defaultValue: "Chaque frappe ajoute cette Gloire à ton rang.", bundle: .main)
        case .minted: String(localized: "game.detail.fact.minted", defaultValue: "C’est le nombre de Meeshes que tu as frappées depuis le début.", bundle: .main)
        case .glory: String(localized: "game.detail.fact.glory", defaultValue: "La Gloire s’additionne et ne redescend jamais. Elle donne ton rang.", bundle: .main)
        case .gloryMissing: String(localized: "game.detail.fact.glory_missing", defaultValue: "C’est la Gloire qu’il te manque pour le rang suivant.", bundle: .main)
        case .streak: String(localized: "game.detail.fact.streak", defaultValue: "C’est le nombre de jours d’affilée où tu as fait au moins un geste.", bundle: .main)
        case .streakRecord: String(localized: "game.detail.fact.streak_record", defaultValue: "C’est ta plus longue série de jours.", bundle: .main)
        case .flameState: String(localized: "game.detail.fact.flame_state", defaultValue: "Il dit si ta Flamme est allumée, en danger, protégée ou éteinte.", bundle: .main)
        case .missionsDone: String(localized: "game.detail.fact.missions_done", defaultValue: "Trois missions par jour. Une fois faites, elles ouvrent le coffre.", bundle: .main)
        case .leaguePlace: String(localized: "game.detail.fact.league_place", defaultValue: "C’est ta place parmi les joueurs de ton groupe, cette semaine.", bundle: .main)
        case .weekPoints: String(localized: "game.detail.fact.week_points", defaultValue: "Ce sont les points gagnés depuis lundi. Ils repartent de zéro chaque semaine.", bundle: .main)
        case .leagueZone: String(localized: "game.detail.fact.league_zone", defaultValue: "Les premiers montent, les derniers descendent, les autres restent.", bundle: .main)
        case .leagueMissing: String(localized: "game.detail.fact.league_missing", defaultValue: "Ce sont les points qu’il te manque pour entrer dans la zone de montée.", bundle: .main)
        case .leagueCloses: String(localized: "game.detail.fact.league_closes", defaultValue: "La semaine de ligue se ferme dimanche soir. Le classement est alors figé.", bundle: .main)
        case .leagueFriends: String(localized: "game.detail.fact.league_friends", defaultValue: "C’est ta place parmi tes amis acceptés, cette semaine.", bundle: .main)
        case .season: String(localized: "game.detail.fact.season", defaultValue: "Une saison dure huit semaines et porte un numéro.", bundle: .main)
        case .seasonWeek: String(localized: "game.detail.fact.season_week", defaultValue: "C’est la semaine en cours, sur les huit de la saison.", bundle: .main)
        case .seasonSteps: String(localized: "game.detail.fact.season_steps", defaultValue: "Ce sont les étapes que tu as ouvertes sur le parcours de la saison.", bundle: .main)
        case .seasonStars: String(localized: "game.detail.fact.season_stars", defaultValue: "Les étoiles se gagnent avec les missions et le duo. Elles ouvrent les étapes.", bundle: .main)
        case .prestigeGlory: String(localized: "game.detail.fact.prestige_glory", defaultValue: "C’est la Gloire que tu gagnes en passant en Prestige.", bundle: .main)
        case .elanFamilies: String(localized: "game.detail.fact.elan_families", defaultValue: "Ce sont les familles de gestes où tu as été actif ces derniers jours.", bundle: .main)
        case .badgesEarned: String(localized: "game.detail.fact.badges_earned", defaultValue: "C’est le nombre de badges obtenus, sur tous ceux qui existent.", bundle: .main)
        case .defisEarned: String(localized: "game.detail.fact.defis_earned", defaultValue: "Ce sont les paliers franchis, sur ceux que tu peux atteindre.", bundle: .main)
        case .succesEarned: String(localized: "game.detail.fact.succes_earned", defaultValue: "Ce sont les succès décrochés, sur tous ceux qui existent.", bundle: .main)
        case .trophies: String(localized: "game.detail.fact.trophies", defaultValue: "C’est le nombre de trophées rangés dans ta vitrine.", bundle: .main)
        case .showcaseVisibility: String(localized: "game.detail.fact.showcase_visibility", defaultValue: "Tu choisis qui voit ta vitrine : tout le monde, tes amis, ou toi seul.", bundle: .main)
        case .atlasStamps: String(localized: "game.detail.fact.atlas_stamps", defaultValue: "Ce sont les langues où tu as un tampon, sur toutes celles de l’Atlas.", bundle: .main)
        case .atlasPending: String(localized: "game.detail.fact.atlas_pending", defaultValue: "Ce sont les langues où il manque encore un message, envoyé ou reçu.", bundle: .main)
        }
    }

    static var close: String { String(localized: "common.close", defaultValue: "Fermer", bundle: .main) }
}
