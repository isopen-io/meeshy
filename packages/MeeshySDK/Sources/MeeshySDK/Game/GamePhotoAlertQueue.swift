import Foundation

// MARK: - La file des invitations à immortaliser (#20653, tranche iOS de #20643)
//
// MIROIR de `createPhotoAlerts` (`apps/web/src/lib/game-photo/alerts.ts`, #10174), réduit à sa LOI : la mémoire
// appareil d'un compte entre, la mémoire suivante et la décision sortent. Ranger la mémoire, tenir la file de un,
// construire les moments et accuser restent à l'hôte de l'app : le SDK ne lit ni stockage ni réseau.
//
// La mémoire garde la DERNIÈRE SITUATION ANNONCÉE : c'est elle qui rattrape l'étape franchie app fermée, par
// différence des étapes photographiables. La ligne de base SERVIE (`game.photo.baseline`) l'emporte quand elle
// existe ; sinon la première lecture d'un compte sur l'appareil pose la situation SANS alerte.

/// La mémoire appareil d'un compte : dernière situation annoncée, invitations montrées (le rythme), étapes
/// nouvelles depuis la dernière visite du carnet (la pastille).
public struct PhotoAlertMemory: Codable, Equatable, Sendable {
    public let standing: PhotoCatchUpStanding?
    public let shown: [PhotoAlertPacing.Shown]
    public let noticed: [String]

    public init(standing: PhotoCatchUpStanding?, shown: [PhotoAlertPacing.Shown], noticed: [String]) {
        self.standing = standing
        self.shown = shown
        self.noticed = noticed
    }

    public static let empty = PhotoAlertMemory(standing: nil, shown: [], noticed: [])

    /// La pastille du carnet.
    public var hasNotice: Bool { !noticed.isEmpty }

    /// Relue depuis le stockage ; absente ou illisible, elle vaut « vide ».
    public static func read(_ data: Data?) -> PhotoAlertMemory {
        guard let data, let memory = try? JSONDecoder().decode(PhotoAlertMemory.self, from: data) else { return .empty }
        return memory
    }

    private enum CodingKeys: String, CodingKey { case standing, shown, noticed }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let payload = try container.decodeIfPresent(PhotoStandingPayload.self, forKey: .standing)
        if payload != nil, payload?.standing == nil {
            throw DecodingError.dataCorruptedError(forKey: .standing, in: container, debugDescription: "situation illisible")
        }
        standing = payload?.standing
        shown = try container.decodeIfPresent([PhotoAlertPacing.Shown].self, forKey: .shown) ?? []
        noticed = try container.decodeIfPresent([String].self, forKey: .noticed) ?? []
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(standing.map(PhotoStandingPayload.init(standing:)), forKey: .standing)
        try container.encode(shown, forKey: .shown)
        try container.encode(noticed, forKey: .noticed)
    }

    func with(standing: PhotoCatchUpStanding) -> PhotoAlertMemory {
        PhotoAlertMemory(standing: standing, shown: shown, noticed: noticed)
    }
}

public enum GamePhotoAlertQueue {

    /// Le rythme ne garde que les dernières invitations montrées.
    public static let shownKept = 12

    /// Ce qu'une lecture fraîche du jeu fait de la mémoire.
    public enum Observation: Equatable, Sendable {
        /// Première lecture du compte sur l'appareil : la situation se pose, sans alerte.
        case baseline(PhotoAlertMemory)
        /// Aucune étape neuve ; la mémoire à réécrire si la situation a bougé, `nil` sinon.
        case unchanged(PhotoAlertMemory?)
        /// Les étapes franchies depuis la dernière situation annoncée, à décider (`decide`).
        case reached([String])
    }

    public enum Decision: Equatable, Sendable {
        /// Une étape passive attend la fin du délai de grâce : la mémoire n'avance pas.
        case wait
        case none(PhotoAlertMemory)
        case alert(PhotoAlert, PhotoAlertMemory)

        /// La mémoire à ranger ; `nil` : rien à réécrire.
        public var memory: PhotoAlertMemory? {
            switch self {
            case .wait: nil
            case .none(let memory), .alert(_, let memory): memory
            }
        }
    }

    public static func observe(memory: PhotoAlertMemory, standing: PhotoCatchUpStanding, photo: GamePhotoBlock?) -> Observation {
        guard let previous = memory.standing else { return .baseline(memory.with(standing: standing)) }
        let policy = photo?.policy ?? .standard
        let before = Set(stepIds(previous, policy: policy))
        let reached = stepIds(standing, policy: policy).filter { !before.contains($0) }
        guard reached.isEmpty else { return .reached(reached) }
        return .unchanged(standing == previous ? nil : memory.with(standing: standing))
    }

    /// `notebookKept` / `notebookKnown` : ce que le carnet de l'APPAREIL a gardé, et tout ce qu'il connaît (en
    /// attente comprises). La situation avance dès qu'une décision est prise, alerte ou non.
    public static func decide(
        memory: PhotoAlertMemory,
        reached: [String],
        standing: PhotoCatchUpStanding,
        photo: GamePhotoBlock?,
        notebookKept: [String],
        notebookKnown: [String],
        pacing: PhotoAlertPacing
    ) -> Decision {
        let policy = photo?.policy ?? .standard
        if GamePhotoAlerts.pacing(pacing, policy: policy) == .wait { return .wait }
        let next = memory.with(standing: standing)
        let alert = GamePhotoAlerts.alert(
            reached: reached,
            standing: standing,
            kept: notebookKept + (photo?.keptStepIds ?? []),
            presented: photo?.presentedStepIds ?? [],
            baseline: photo?.baseline ?? memory.standing,
            policy: policy,
            treasuryPeak: photo?.treasuryPeakTier,
            pacing: pacing
        )
        guard let alert, !notebookKnown.contains(alert.propose) else { return .none(next) }
        return .alert(alert, next)
    }

    /// L'invitation est à l'écran : le rythme, la pastille, et les étapes à accuser (`POST …/presented`).
    public static func displayed(memory: PhotoAlertMemory, alert: PhotoAlert, at: Int, dayKey: String)
        -> (memory: PhotoAlertMemory, acknowledge: [String]) {
        let shown = Array((memory.shown + [PhotoAlertPacing.Shown(at: at, dayKey: dayKey)]).suffix(shownKept))
        let noticed = unique(memory.noticed + [alert.announce, alert.propose])
        return (PhotoAlertMemory(standing: memory.standing, shown: shown, noticed: noticed), unique(alert.reached + [alert.propose]))
    }

    /// La visite du carnet éteint la pastille.
    public static func carnetVisited(_ memory: PhotoAlertMemory) -> PhotoAlertMemory {
        PhotoAlertMemory(standing: memory.standing, shown: memory.shown, noticed: [])
    }

    /// Les moments qu'une célébration remet (D6) : la réalisation du jour cède toujours à une étape de piste.
    public static func admitted(_ momentIds: [String]) -> [String] {
        let tracked = momentIds.contains { GamePhotoCatchUpLaw.track(of: $0) != nil }
        return momentIds.filter { !tracked || GamePhotoMomentsV2.day(ofMomentId: $0) == nil }
    }

    /// La journée locale `AAAA-MM-JJ` d'un instant en millisecondes.
    public static func dayKey(at milliseconds: Int, timeZone: TimeZone = .current) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let parts = calendar.dateComponents([.year, .month, .day], from: Date(timeIntervalSince1970: Double(milliseconds) / 1000))
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    private static func stepIds(_ standing: PhotoCatchUpStanding, policy: PhotoAlertPolicy) -> [String] {
        GamePhotoCatchUpLaw.stepsReached(standing, policy: policy).map(\.id)
    }

    private static func unique(_ ids: [String]) -> [String] {
        var seen = Set<String>()
        return ids.filter { seen.insert($0).inserted }
    }
}
