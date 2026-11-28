import Foundation
import Combine
import MeeshySDK

// MARK: - La file des invitations à immortaliser, côté app (#20775, tranche iOS de #20643)
//
// Miroir de `createPhotoAlerts` (`apps/web/src/lib/game-photo/alerts.ts`, #10174). La LOI vit dans le SDK
// (`GamePhotoAlertQueue`) ; ce modèle fait ce qu'elle laisse à l'hôte : ranger la mémoire d'un compte, lire le
// carnet de l'appareil quand une étape neuve se présente, tenir UNE invitation en attente, et accuser sa
// présentation (`POST /me/game/photo-moments/presented`). Il ne dessine rien : la bannière et la feuille le lisent.

/// La mémoire appareil des invitations d'un compte.
protocol PhotoAlertMemoryStoring: AnyObject {
    func memory(for userId: String) -> PhotoAlertMemory
    /// `false` : le disque a refusé ; la mémoire tient alors pour la séance.
    @discardableResult
    func store(_ memory: PhotoAlertMemory, for userId: String) -> Bool
}

/// `MeeshyGame/<id>/photo-alerts.json` : la mémoire part avec le dossier du jeu du compte (#10482).
final class GamePhotoAlertMemoryFile: PhotoAlertMemoryStoring {
    nonisolated deinit {}

    static let fileName = "photo-alerts.json"

    private let base: URL?

    init(base: URL? = nil) {
        self.base = base
    }

    func url(for userId: String) -> URL {
        GamePhotoNotebook.accountFolder(userId: userId, base: base).appendingPathComponent(Self.fileName)
    }

    func memory(for userId: String) -> PhotoAlertMemory {
        PhotoAlertMemory.read(try? Data(contentsOf: url(for: userId)))
    }

    @discardableResult
    func store(_ memory: PhotoAlertMemory, for userId: String) -> Bool {
        guard let data = try? JSONEncoder().encode(memory) else { return false }
        let target = url(for: userId)
        do {
            try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: target, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            return true
        } catch {
            return false
        }
    }
}

/// L'invitation qui attend un geste : l'étape ANNONCÉE, l'étape PROPOSÉE (l'ouverte de sa piste), et la décision
/// de la loi, qui dit aussi ce qui s'accuse.
nonisolated struct PendingPhotoInvitation: Equatable, Identifiable, Sendable {
    let userId: String
    let announce: PhotoMoment
    let propose: PhotoMoment
    let alert: PhotoAlert

    var id: String { "\(userId)|\(alert.announce)|\(alert.propose)" }
}

@MainActor
final class GamePhotoInvitations: ObservableObject {
    nonisolated deinit {}

    /// Ce qu'une lecture du jeu a fait de la file.
    nonisolated enum Outcome: Equatable, Sendable {
        /// Première lecture du compte sur l'appareil : la situation se pose, sans invitation.
        case baseline
        case none
        /// Le délai de grâce de la séance court : l'étape attendra la lecture suivante.
        case wait
        /// Une invitation attend déjà un geste : la suivante attend, la situation n'avance pas.
        case busy
        case alert
    }

    static let shared = GamePhotoInvitations()

    @Published private(set) var pending: PendingPhotoInvitation?
    /// La pastille du carnet, pour le compte lu en dernier.
    @Published private(set) var hasNotice = false

    private let memories: PhotoAlertMemoryStoring
    private let notebook: @MainActor (String) -> GamePhotoNotebooking
    private let acknowledge: @MainActor ([String]) -> Void
    private let now: () -> Date
    private let sessionStartedAt: Date?
    /// La séance tient même si le disque refuse : la dernière mémoire écrite reste lisible ici.
    private var session: [String: PhotoAlertMemory] = [:]
    private var acknowledged: Set<String> = []
    private var deciding = false

    init(
        memories: PhotoAlertMemoryStoring = GamePhotoAlertMemoryFile(),
        notebook: @escaping @MainActor (String) -> GamePhotoNotebooking = { userId in GamePhotoNotebook.standard(userId: userId) },
        acknowledge: @escaping @MainActor ([String]) -> Void = GamePhotoInvitations.acknowledgeOnServer,
        now: @escaping () -> Date = { Date() },
        sessionStartedAt: Date? = Date()
    ) {
        self.memories = memories
        self.notebook = notebook
        self.acknowledge = acknowledge
        self.now = now
        self.sessionStartedAt = sessionStartedAt
    }

    // MARK: - Les lectures du jeu

    @discardableResult
    func observe(userId: String, game: GameBlock) async -> Outcome {
        await observe(userId: userId, standing: PhotoCatchUpStanding(game: game), photo: game.photo)
    }

    @discardableResult
    func observe(userId: String, standing: PhotoCatchUpStanding, photo: GamePhotoBlock?) async -> Outcome {
        let memory = read(userId)
        switch GamePhotoAlertQueue.observe(memory: memory, standing: standing, photo: photo) {
        case .baseline(let next):
            write(next, for: userId)
            return .baseline
        case .unchanged(let next):
            if let next { write(next, for: userId) } else { hasNotice = memory.hasNotice }
            return .none
        case .reached(let reached):
            guard pending == nil, !deciding else { return .busy }
            deciding = true
            let outcome = await decide(userId: userId, reached: reached, standing: standing, photo: photo)
            deciding = false
            return outcome
        }
    }

    private func decide(userId: String, reached: [String], standing: PhotoCatchUpStanding, photo: GamePhotoBlock?) async -> Outcome {
        let paced = pacing(read(userId))
        if GamePhotoAlerts.pacing(paced, policy: photo?.policy ?? .standard) == .wait { return .wait }
        let entries = await notebook(userId).list()
        let decision = GamePhotoAlertQueue.decide(
            memory: read(userId),
            reached: reached,
            standing: standing,
            photo: photo,
            notebookKept: entries.filter { $0.status == .kept }.map(\.momentId),
            notebookKnown: entries.map(\.momentId),
            pacing: paced
        )
        if let next = decision.memory { write(next, for: userId) }
        switch decision {
        case .wait:
            return .wait
        case .none:
            return .none
        case .alert(let alert, _):
            guard let announce = Self.moment(alert.announce, standing: standing),
                  let propose = Self.moment(alert.propose, standing: standing) else { return .none }
            pending = PendingPhotoInvitation(userId: userId, announce: announce, propose: propose, alert: alert)
            return .alert
        }
    }

    // MARK: - Les gestes

    /// L'invitation est à l'écran : rythme, pastille, et accusé — une fois par invitation.
    func displayed(_ invitation: PendingPhotoInvitation) {
        guard pending == invitation, acknowledged.insert(invitation.id).inserted else { return }
        let at = Self.milliseconds(now())
        let result = GamePhotoAlertQueue.displayed(
            memory: read(invitation.userId), alert: invitation.alert, at: at, dayKey: GamePhotoAlertQueue.dayKey(at: at))
        write(result.memory, for: invitation.userId)
        acknowledge(result.acknowledge)
    }

    /// « Immortaliser » : rend l'invitation et libère la file.
    func consume() -> PendingPhotoInvitation? {
        let taken = pending
        pending = nil
        return taken
    }

    /// « Plus tard » : libère la file ; le moment proposé attend au carnet.
    @discardableResult
    func later() -> Task<Void, Never>? {
        guard let invitation = pending else { return nil }
        pending = nil
        let book = notebook(invitation.userId)
        return Task { [book] in _ = await book.postpone(invitation.propose) }
    }

    /// La visite du carnet éteint la pastille.
    func carnetVisited(userId: String) {
        write(GamePhotoAlertQueue.carnetVisited(read(userId)), for: userId)
    }

    // MARK: - La mémoire

    private func read(_ userId: String) -> PhotoAlertMemory {
        session[userId] ?? memories.memory(for: userId)
    }

    private func write(_ memory: PhotoAlertMemory, for userId: String) {
        session[userId] = memory
        hasNotice = memory.hasNotice
        memories.store(memory, for: userId)
    }

    private func pacing(_ memory: PhotoAlertMemory) -> PhotoAlertPacing {
        let at = Self.milliseconds(now())
        return PhotoAlertPacing(
            now: at,
            dayKey: GamePhotoAlertQueue.dayKey(at: at),
            sessionStartedAt: sessionStartedAt.map { Self.milliseconds($0) },
            surface: .passive,
            shown: memory.shown
        )
    }

    // MARK: - Les appuis

    /// Le moment complet d'une étape franchie ; `nil` : la situation ne la porte pas.
    static func moment(_ stepId: String, standing: PhotoCatchUpStanding) -> PhotoMoment? {
        GamePhotoCatchUp.stepsReached(standing).first { $0.id == stepId }?.moment
    }

    nonisolated static func milliseconds(_ date: Date) -> Int {
        Int((date.timeIntervalSince1970 * 1000).rounded())
    }

    /// L'accusé, par lots de `GamePhotoRegistry.presentedBatches` ; un `requestId` par lot, une fois.
    nonisolated static func acknowledgeOnServer(_ stepIds: [String]) {
        let service: GamePhotoRegistryProviding = GameService.shared
        for batch in GamePhotoRegistry.presentedBatches(stepIds) {
            let requestId = UUID().uuidString
            Task { _ = try? await service.acknowledgePhotoMomentsPresented(batch, requestId: requestId) }
        }
    }
}
