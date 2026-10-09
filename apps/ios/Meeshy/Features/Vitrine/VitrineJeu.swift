#if DEBUG
import Foundation
import MeeshySDK

/// Une célébration du jeu que la vitrine rejoue à la demande (#9805), pour les images et les films de l'App Store.
///
/// Chacune vit sur la FICHE d'un concept (`ProgressionConceptPage`) et s'y joue quand l'état servi change — jamais au
/// premier rendu. La scène ouvre donc la fiche au repos, puis fait arriver le changement par le chemin RÉEL du modèle :
/// la lecture servie (`load(forceNetwork:)`, celle d'un retour de geste ou d'un tirer-pour-rafraîchir) ou le geste
/// lui-même (`mint()`, `claimChest()`). Seule la passerelle est fictive (`VitrineJeuServeur`).
nonisolated enum VitrineCelebration: String, CaseIterable, Sendable {
    /// L'écu monte d'une marche (`RankBlasonStage`, héro du niveau).
    case rang
    /// Le coffre du jour s'ouvre (`ChestStage`, fiche des missions).
    case coffre
    /// Mee et Meo frappent une Meesh (`MintStrikeScene`, héro de frappe).
    case frappe
    /// L'anneau se remplit et le niveau roule (`GameHeroView`, `GameTimeline.levelGainDuration`).
    case niveau
    /// Une médaille se rallume, la matière remonte du bas (`BadgeStage`, étagère des badges).
    case badge

    /// La fiche que la scène ouvre : celle qui porte la pièce de jeu de la célébration.
    var concept: ProgressionConcept {
        switch self {
        case .rang, .niveau: .level
        case .coffre: .missions
        case .frappe: .meesh
        case .badge: .badges
        }
    }

    /// La durée de la chorégraphie, lue sur la planche des durées : le script filme entre les deux marqueurs.
    var duree: TimeInterval {
        switch self {
        case .rang: GameTimeline.rankDuration
        case .coffre: GameTimeline.chestDuration
        case .frappe: GameTimeline.strikeDuration
        case .niveau: GameTimeline.levelGainDuration
        case .badge: GameTimeline.badgeDuration
        }
    }
}

extension VitrineScene {
    nonisolated var celebration: VitrineCelebration? {
        switch self {
        case .jeuRang: .rang
        case .jeuCoffre: .coffre
        case .jeuFrappe: .frappe
        case .jeuNiveau: .niveau
        case .jeuBadge: .badge
        case .amour, .groupe, .global, .lien, .progression, .imagine, .interactionFrappe: nil
        }
    }
}

/// Ce que la passerelle fictive sert : la charge AVANT la célébration, celle d'APRÈS, et les réponses des deux gestes.
nonisolated struct VitrineJeuScenario: Sendable {
    let avant: APIEngagementProgress
    let apres: APIEngagementProgress
    let coffre: ChestClaimResponse?
    let frappe: APIMeeshMintResult?
}

/// Les deux états de chaque célébration, BÂTIS PAR LA LOI (`GameLevelWire`, `GameGlory`, `GameMint`, `GameOptimistic`) :
/// aucun chiffre n'est écrit à la main, sinon un réglage de la loi ferait mentir la vitrine sans que rien ne rougisse.
/// Le profil est celui du kit (compteurs, jalons, Flamme) ; le jeu s'y greffe.
enum VitrineJeuScenarios {
    private static let score = 121_800
    private static let gloire = 1_730
    /// La prochaine pièce est la n° 100 : une édition Or.
    private static let frappees = 99
    private static let enPoche = 23
    /// À quelques points du palier suivant : l'écran dit « encore 30 points », puis la marche se franchit.
    private static let ecartAvant = 30
    private static let ecartApres = 90
    private static let recompense = DailyChest(points: 140, fragment: true, freeze: false)
    /// Le compteur d'avant éteint la médaille Argent (50) des messages texte : « −4 ».
    private static let axeDuBadge = EngagementAxisKey.textMessage
    private static let compteurEteint = 46

    static func pour(_ celebration: VitrineCelebration, base: APIEngagementProgress) -> VitrineJeuScenario {
        switch celebration {
        case .rang: rang(base)
        case .niveau: niveau(base)
        case .coffre: coffre(base)
        case .frappe: frappe(base)
        case .badge: badge(base)
        }
    }

    private static func rang(_ base: APIEngagementProgress) -> VitrineJeuScenario {
        let manque = GameGlory.standing(glory: gloire, mythic: false).gloryMissing ?? 0
        let avant = gloire + manque - 25
        return VitrineJeuScenario(
            avant: charge(base, jeu: bloc(base, score: score, gloire: avant)),
            apres: charge(base, jeu: bloc(base, score: score, gloire: avant + 60)),
            coffre: nil, frappe: nil
        )
    }

    private static func niveau(_ base: APIEngagementProgress) -> VitrineJeuScenario {
        let seuil = bloc(base, score: score, gloire: gloire).level.shown.nextThreshold ?? score
        return VitrineJeuScenario(
            avant: charge(base, jeu: bloc(base, score: seuil - ecartAvant, gloire: gloire)),
            apres: charge(base, jeu: bloc(base, score: seuil + ecartApres, gloire: gloire)),
            coffre: nil, frappe: nil
        )
    }

    private static func coffre(_ base: APIEngagementProgress) -> VitrineJeuScenario {
        let pret = bloc(base, score: score, gloire: gloire, missionsFaites: true)
        let avant = charge(base, jeu: pret)
        let reponse = ChestClaimResponse(status: "claimed", reward: recompense, score: score + recompense.points)
        let ouvert = GameOptimistic.withChestReward(
            GameOptimistic.afterChestOpening(GameState(game: pret, meesh: avant.meesh)),
            reward: reponse.reward, score: reponse.score
        )
        return VitrineJeuScenario(avant: avant, apres: avant.replacing(game: ouvert.game, meesh: ouvert.meesh), coffre: reponse, frappe: nil)
    }

    private static func frappe(_ base: APIEngagementProgress) -> VitrineJeuScenario {
        let jeu = bloc(base, score: score, gloire: gloire)
        let avant = charge(base, jeu: jeu)
        let frappee = GameOptimistic.afterMint(GameState(game: jeu, meesh: avant.meesh))
        let reponse = APIMeeshMintResult(
            status: "minted", balance: frappee.game.treasury.held, mintedLifetime: jeu.mint.number,
            number: jeu.mint.number, edition: jeu.mint.edition, price: jeu.mint.price, gloryGained: jeu.mint.gloryGained,
            levelBefore: jeu.mint.levelBefore, levelAfter: jeu.mint.levelAfter
        )
        return VitrineJeuScenario(avant: avant, apres: avant.replacing(game: frappee.game, meesh: frappee.meesh), coffre: nil, frappe: reponse)
    }

    private static func badge(_ base: APIEngagementProgress) -> VitrineJeuScenario {
        let jeu = bloc(base, score: score, gloire: gloire)
        let eteint = base.counters.map { compteur in
            compteur.axisKey == axeDuBadge.rawValue
                ? APIEngagementProgress.Counter(axisKey: compteur.axisKey, count: compteurEteint, points: compteur.points)
                : compteur
        }
        return VitrineJeuScenario(
            avant: charge(base, jeu: jeu, compteurs: eteint),
            apres: charge(base, jeu: jeu),
            coffre: nil, frappe: nil
        )
    }

    // MARK: - Le bloc `game`, tel que la passerelle le sert

    private static func bloc(_ base: APIEngagementProgress, score: Int, gloire: Int, missionsFaites: Bool = false) -> GameBlock {
        let standing = GameGlory.standing(glory: gloire, mythic: false)
        let plafond = GameGlory.levelCap(forRank: standing.rank)
        let niveau = GameLevelWire.level(score: score, levelCap: plafond, levelRecord: nil, prestige: 0)
        let jours = max(1, base.streak.currentStreakDays)
        return GameBlock(
            level: niveau,
            glory: GameBlock.Glory(
                glory: standing.glory, rank: standing.rank, division: standing.division, division5: standing.division5,
                next: standing.next, gloryMissing: standing.gloryMissing, progress: standing.progress
            ),
            treasury: GameTreasury.standing(held: enPoche),
            mint: GameLevelWire.mint(GameMint.preview(score: score, mintedLifetime: frappees, debitablePoints: score, levelCap: plafond)),
            missions: GameBlock.Missions(
                dayKey: jourDuJour(), prismDay: false, unlocked: niveau.shown.level >= 5,
                items: missions(faites: missionsFaites), rerollAvailable: !missionsFaites
            ),
            chest: GameBlock.Chest(status: missionsFaites ? .ready : .locked, odds: GameChest.odds, reward: nil),
            flame: GameBlock.Flame(
                days: jours, form: GameFlame.form(forDays: jours), bonusPercent: GameFlame.bonusPercent(forDays: jours),
                freezes: 1, maxFreezes: 2, freezePrice: 1, relightPrice: 3, status: .lit, canRelight: false
            ),
            boosts: GameBlock.Boosts(tailwind: GameBoosts.tailwind(level: niveau.shown.level, levelRecord: niveau.shown.record), prismHour: nil),
            // Un joueur de ce niveau a passé l'intégration : aucune carte d'accueil ne couvre la scène.
            guideSeen: GameGuide.onboardingSteps.map { GameGuide.onboardingSeenKey($0.key) }
        )
    }

    private static func missions(faites: Bool) -> [GameBlock.Mission] {
        [
            mission("vitrine-m1", "send-texts", .easy, cible: 5, fait: 5, gain: 30),
            mission("vitrine-m2", "reply-conversations", .medium, cible: 3, fait: faites ? 3 : 2, gain: 60),
            mission("vitrine-m3", "publish-post", .hard, cible: 1, fait: faites ? 1 : 0, gain: 120),
        ]
    }

    private static func mission(_ id: String, _ modele: String, _ difficulte: MissionDifficulty, cible: Int, fait: Int, gain: Int) -> GameBlock.Mission {
        GameBlock.Mission(
            id: id, templateKey: modele, difficulty: difficulte, signal: MissionSignal("axis:content.text_message"),
            prism: false, target: cible, progress: fait, reward: gain, glory: 0,
            completedAt: fait >= cible ? ISO8601DateFormatter().string(from: Date().addingTimeInterval(-3_600)) : nil
        )
    }

    /// La charge du kit, avec le jeu greffé et un solde de Meeshes qui DIT le même trésor que le bloc.
    private static func charge(_ base: APIEngagementProgress, jeu: GameBlock, compteurs: [APIEngagementProgress.Counter]? = nil) -> APIEngagementProgress {
        let solde = APIEngagementProgress.Meesh(
            balance: jeu.treasury.held, mintedLifetime: frappees, debitablePoints: jeu.level.score, floorPoints: 0,
            missingPoints: jeu.mint.missingPoints, mintCost: jeu.mint.price,
            firstMintedAt: base.meesh?.firstMintedAt, lastMintedAt: base.meesh?.lastMintedAt
        )
        return APIEngagementProgress(
            counters: compteurs ?? base.counters,
            milestones: base.milestones,
            streak: base.streak,
            level: .init(engagementScore: jeu.level.score),
            meesh: solde,
            elan: base.elan,
            achievementReach: base.achievementReach,
            game: jeu
        )
    }

    private static func jourDuJour() -> String {
        let format = DateFormatter()
        format.locale = Locale(identifier: "en_US_POSIX")
        format.dateFormat = "yyyy-MM-dd"
        return format.string(from: Date())
    }
}

nonisolated enum VitrineJeuRefus: Error {
    /// Un geste que la scène ne joue pas : la vitrine ne fabrique aucune réponse qu'elle n'a pas prévue.
    case horsScene
}

/// La passerelle du jeu, en vitrine : elle sert l'état d'AVANT jusqu'à la célébration, puis celui d'APRÈS.
/// Le geste de la scène (frappe, coffre) fait lui-même basculer la lecture, comme sur la vraie passerelle.
actor VitrineJeuServeur: EngagementProgressProviding, GameServiceProviding {
    private let avant: APIEngagementProgress
    private let apres: APIEngagementProgress
    private let coffre: ChestClaimResponse?
    private let frappe: APIMeeshMintResult?
    private var celebree = false

    init(_ scenario: VitrineJeuScenario) {
        avant = scenario.avant
        apres = scenario.apres
        coffre = scenario.coffre
        frappe = scenario.frappe
    }

    /// Ce qui est arrivé côté serveur (la mission faite, la marche gagnée) : la prochaine lecture le sert.
    func servirLaSuite() {
        celebree = true
    }

    func fetchProgress() async throws -> APIEngagementProgress {
        celebree ? apres : avant
    }

    func mintMeesh(requestId: String) async throws -> APIMeeshMintResult {
        guard let frappe else { throw VitrineJeuRefus.horsScene }
        celebree = true
        return frappe
    }

    func claimChest(requestId: String) async throws -> ChestClaimResponse {
        guard let coffre else { throw VitrineJeuRefus.horsScene }
        celebree = true
        return coffre
    }

    func markGuideSeen(keys: [String], requestId: String) async throws -> GuideSeenResponse {
        GuideSeenResponse(guideSeen: (celebree ? apres : avant).game.map { $0.guideSeen + keys } ?? keys)
    }

    func rerollMission(missionId: String, requestId: String) async throws -> MissionRerollResponse { throw VitrineJeuRefus.horsScene }
    func buyFlameFreeze(requestId: String) async throws -> FlameFreezeResponse { throw VitrineJeuRefus.horsScene }
    func relightFlame(requestId: String) async throws -> FlameRelightResponse { throw VitrineJeuRefus.horsScene }
}

/// Le déroulé d'une scène du jeu : la fiche s'ouvre sur l'état d'avant, attend le clap du tournage (`VitrineTournage`),
/// puis la célébration se joue sans geste, encadrée par deux marqueurs que le script de tournage attend.
@MainActor
enum VitrineJeu {
    /// `ChoreographyClock` s'arrête 50 ms après la fin ; « fin » tombe une fois l'horloge posée.
    static let finDeChoregraphie: Duration = .milliseconds(100)

    private static var enCours: (celebration: VitrineCelebration, serveur: VitrineJeuServeur)?
    private static weak var fiche: ProgressionViewModel?

    /// Prépare la passerelle de la scène et rend la charge d'AVANT, que la vitrine range dans le cache.
    static func preparer(_ celebration: VitrineCelebration, base: APIEngagementProgress) -> APIEngagementProgress {
        let scenario = VitrineJeuScenarios.pour(celebration, base: base)
        enCours = (celebration, VitrineJeuServeur(scenario))
        return scenario.avant
    }

    /// Le modèle de la fiche que la scène ouvre : le VRAI `ProgressionViewModel`, branché sur la passerelle fictive.
    /// `nil` pour toute autre fiche, et hors d'une scène du jeu.
    static func modele(pour concept: ProgressionConcept) -> ProgressionViewModel? {
        guard let enCours, enCours.celebration.concept == concept else { return nil }
        let modele = ProgressionViewModel(service: enCours.serveur, gameService: enCours.serveur)
        fiche = modele
        return modele
    }

    /// La célébration, par le chemin qu'elle prend dans l'app : le geste quand il y en a un, la lecture servie sinon.
    static func jouer(_ celebration: VitrineCelebration, sur modele: ProgressionViewModel, serveur: VitrineJeuServeur) async {
        switch celebration {
        case .frappe:
            await modele.mint()
        case .coffre:
            await modele.claimChest()
        case .rang, .niveau, .badge:
            await serveur.servirLaSuite()
            await modele.load(forceNetwork: true)
        }
    }

    /// Après « prêt » : le clap, « celebration-debut », la célébration, puis « celebration-fin » une fois sa durée passée.
    static func celebrer(_ scene: VitrineScene) async {
        guard let celebration = scene.celebration else { return }
        guard let enCours, let fiche else {
            fatalError("Vitrine « \(scene.rawValue) » : la fiche \(celebration.concept.rawValue) n'a pas reçu le modèle de la scène")
        }
        await VitrineTournage.tourner(scene) {
            let depart = ContinuousClock.now
            await jouer(celebration, sur: fiche, serveur: enCours.serveur)
            try? await Task.sleep(until: depart + .seconds(celebration.duree) + finDeChoregraphie, clock: .continuous)
        }
    }
}
#endif
