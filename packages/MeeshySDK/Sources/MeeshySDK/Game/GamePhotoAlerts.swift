import Foundation

// MARK: - Les alertes d'immortalisation (#10173, § 5.16.1)
//
// MIROIR de `packages/shared/utils/game/photo-alert-policy.ts` et `photo-alerts.ts`,
// rejoué sur la loi `photo-alert` de `game.vectors.json`.
//
// Une loi décide quelle étape ANNONCER, une seule à la fois : l'étape la plus
// marquante atteinte (`announce`), l'étape ouverte de sa piste que la
// proposition retiendrait (`propose`, déléguée à `GamePhotoCatchUpLaw.offer`),
// et toutes les étapes atteintes à accuser (`reached`). Le rythme du jeu reste à
// décider (#9964) : il se règle dans `PhotoAlertPolicy.standard`, en un seul endroit.

/// La politique des alertes, paramétrable ; ses défauts sont prudents et ne changent rien au carnet.
public struct PhotoAlertPolicy: Equatable, Sendable {
    /// Ce qui se photographie : chaque étape, ou le rang au PASSAGE seulement (division V et Mythe).
    public enum Photographs: String, Sendable { case everyStep = "every-step", rankPassage = "rank-passage" }
    /// Le réglage « Me proposer d'immortaliser » : chaque étape, les grands moments, jamais.
    public enum Invitations: String, Sendable { case everyStep = "every-step", bigMoments = "big-moments", never }
    /// D20 : l'arriéré d'avant la ligne de base verrouille les étapes nouvelles (a) ou se range à part (b).
    public enum Backlog: String, Sendable { case locks, apart }

    public struct InApp: Equatable, Sendable {
        public let perDay: Int
        public let minGapMinutes: Int
        /// Aucune invitation PASSIVE pendant les premières minutes d'une session.
        public let sessionGraceMinutes: Int

        public init(perDay: Int, minGapMinutes: Int, sessionGraceMinutes: Int) {
            self.perDay = perDay
            self.minGapMinutes = minGapMinutes
            self.sessionGraceMinutes = sessionGraceMinutes
        }
    }

    public struct Push: Equatable, Sendable {
        public let perDay: Int
        public let delayMinutes: Int
        public let nightFromHour: Int
        public let nightToHour: Int

        public init(perDay: Int, delayMinutes: Int, nightFromHour: Int, nightToHour: Int) {
            self.perDay = perDay
            self.delayMinutes = delayMinutes
            self.nightFromHour = nightFromHour
            self.nightToHour = nightToHour
        }
    }

    public let photographs: Photographs
    public let invitations: Invitations
    public let backlog: Backlog
    public let inApp: InApp
    public let push: Push

    public init(photographs: Photographs, invitations: Invitations, backlog: Backlog, inApp: InApp, push: Push) {
        self.photographs = photographs
        self.invitations = invitations
        self.backlog = backlog
        self.inApp = inApp
        self.push = push
    }

    /// `PHOTO_ALERT_POLICY`.
    public static let standard = PhotoAlertPolicy(
        photographs: .everyStep,
        invitations: .everyStep,
        backlog: .locks,
        inApp: InApp(perDay: 1, minGapMinutes: 240, sessionGraceMinutes: 10),
        push: Push(perDay: 1, delayMinutes: 60, nightFromHour: 21, nightToHour: 9)
    )
}

/// Le rythme dans l'app : instants en millisecondes depuis l'époque, journées locales `AAAA-MM-JJ`.
public struct PhotoAlertPacing: Equatable, Sendable {
    public enum Surface: String, Sendable { case gesture, passive }

    public struct Shown: Equatable, Sendable {
        public let at: Int
        public let dayKey: String

        public init(at: Int, dayKey: String) {
            self.at = at
            self.dayKey = dayKey
        }
    }

    public let now: Int
    public let dayKey: String
    public let sessionStartedAt: Int?
    public let surface: Surface
    public let shown: [Shown]

    public init(now: Int, dayKey: String, sessionStartedAt: Int?, surface: Surface, shown: [Shown]) {
        self.now = now
        self.dayKey = dayKey
        self.sessionStartedAt = sessionStartedAt
        self.surface = surface
        self.shown = shown
    }
}

public enum PhotoAlertPace: String, Sendable {
    case allowed
    /// Plafond du jour ou écart minimal atteint : l'étape va au carnet en silence.
    case silent
    /// Une invitation passive attend la fin du délai de grâce de la session.
    case wait
}

public struct PhotoAlert: Equatable, Sendable {
    public let announce: String
    public let propose: String
    public let reached: [String]

    public init(announce: String, propose: String, reached: [String]) {
        self.announce = announce
        self.propose = propose
        self.reached = reached
    }
}

/// Une étape du registre partagé (`GamePhotoMoment`).
public struct PhotoMomentRecord: Equatable, Sendable {
    public let stepId: String
    public let presentedAt: String?
    public let notifiedAt: String?

    public init(stepId: String, presentedAt: String?, notifiedAt: String?) {
        self.stepId = stepId
        self.presentedAt = presentedAt
        self.notifiedAt = notifiedAt
    }
}

public enum GamePhotoAlerts {

    private static let minute = 60_000

    /// Les « grands moments » : passage de rang, Mythe, niveau 100, Prestige, Meesh d'or ou prisme, Flamme 100 et 365.
    public static func isBigMoment(_ momentId: String) -> Bool {
        let parts = momentId.split(separator: ":", omittingEmptySubsequences: false).map(String.init)
        switch parts.first {
        case "rank":
            return parts.count == 3 && (parts[2] == "5" || momentId == "rank:mythe:0") && !parts[1].isEmpty
                && parts[1].allSatisfy { $0.isASCII && $0.isLowercase }
        case "level-100": return momentId == "level-100:0"
        case "prestige": return momentId.hasPrefix("prestige:")
        case "flame": return momentId == "flame:100" || momentId == "flame:365"
        case "meesh":
            guard parts.count == 2, !parts[1].isEmpty, parts[1].allSatisfy({ $0.isASCII && $0.isNumber }),
                  let number = Int(parts[1]) else { return false }
            return number > 0 && number % 100 == 0
        default: return false
        }
    }

    public static func pacing(_ pacing: PhotoAlertPacing, policy: PhotoAlertPolicy = .standard) -> PhotoAlertPace {
        let today = pacing.shown.filter { $0.dayKey == pacing.dayKey }.count
        if today >= policy.inApp.perDay { return .silent }
        if let last = pacing.shown.map(\.at).max(), pacing.now - last < policy.inApp.minGapMinutes * minute { return .silent }
        guard pacing.surface == .passive, let started = pacing.sessionStartedAt else { return .allowed }
        return pacing.now < started + policy.inApp.sessionGraceMinutes * minute ? .wait : .allowed
    }

    public static func alert(
        reached: [String],
        standing: PhotoCatchUpStanding,
        kept: [String],
        presented: [String],
        baseline: PhotoCatchUpStanding?,
        policy: PhotoAlertPolicy = .standard,
        treasuryPeak: TreasuryTierKey? = nil,
        pacing: PhotoAlertPacing? = nil
    ) -> PhotoAlert? {
        guard let baseline else { return nil }
        let current = atPeak(standing, treasuryPeak)
        let steps = GamePhotoCatchUpLaw.stepsReached(current, policy: policy).map(\.id)
        let photographable = Set(steps)
        let backlog = Set(GamePhotoCatchUpLaw.stepsReached(baseline, policy: policy).map(\.id))
        let keptSet = Set(kept)
        let presentedSet = Set(presented)
        let latestDay = reached.compactMap(GamePhotoMomentsV2.day(ofMomentId:)).max().map { "day:\($0)" }

        func isCandidate(_ id: String) -> Bool {
            if id == "start" || keptSet.contains(id) || presentedSet.contains(id) || backlog.contains(id) { return false }
            if GamePhotoCatchUpLaw.track(of: id) != nil { return photographable.contains(id) }
            return GamePhotoMomentsV2.day(ofMomentId: id) == nil || id == latestDay
        }

        var seen = Set<String>()
        let candidates = reached.filter { seen.insert($0).inserted }.filter(isCandidate)
        let announced = candidates.filter { invited($0, policy: policy) }
        guard let first = announced.first else { return nil }
        if let pacing, Self.pacing(pacing, policy: policy) != .allowed { return nil }

        func rank(_ id: String) -> (Int, Int) {
            (GamePhotoCatchUpLaw.priority(id), -(steps.firstIndex(of: id) ?? -1))
        }
        let announce = announced.dropFirst().reduce(first) { best, id in rank(id) < rank(best) ? id : best }
        let lockedBy = policy.backlog == .apart ? keptSet.union(backlog) : keptSet
        let propose = GamePhotoCatchUpLaw.offer(for: [announce], standing: current, kept: lockedBy, policy: policy) ?? announce
        return PhotoAlert(announce: announce, propose: propose, reached: candidates)
    }

    /// Le résumé groupé du push : les étapes ni présentées ni notifiées, sans le départ ni la réalisation du jour.
    public static func digest(_ moments: [PhotoMomentRecord]) -> (stepIds: [String], count: Int)? {
        var seen = Set<String>()
        let stepIds = moments
            .filter { $0.presentedAt == nil && $0.notifiedAt == nil && $0.stepId != "start" }
            .filter { GamePhotoMomentsV2.day(ofMomentId: $0.stepId) == nil }
            .map(\.stepId)
            .filter { seen.insert($0).inserted }
        return stepIds.isEmpty ? nil : (stepIds, stepIds.count)
    }

    private static func invited(_ momentId: String, policy: PhotoAlertPolicy) -> Bool {
        switch policy.invitations {
        case .everyStep: true
        case .bigMoments: isBigMoment(momentId)
        case .never: false
        }
    }

    private static func atPeak(_ standing: PhotoCatchUpStanding, _ peak: TreasuryTierKey?) -> PhotoCatchUpStanding {
        let tiers = TreasuryTierKey.allCases
        let peakIndex = peak.flatMap { tiers.firstIndex(of: $0) } ?? -1
        let currentIndex = standing.treasuryTier.flatMap { tiers.firstIndex(of: $0) } ?? -1
        guard peakIndex > currentIndex else { return standing }
        return PhotoCatchUpStanding(rank: standing.rank, division: standing.division, levelRecord: standing.levelRecord,
                                    prestige: standing.prestige, minted: standing.minted, treasuryTier: peak,
                                    flameRecord: standing.flameRecord)
    }
}
