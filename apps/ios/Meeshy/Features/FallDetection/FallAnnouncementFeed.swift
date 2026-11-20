import Combine
import Foundation
import MeeshySDK

/// Une annonce de la chute détectée telle que la SyncPill la fait défiler (#18748). Un ÉVÉNEMENT, pas un état :
/// elle passe, disparaît à son échéance, et ne revient qu'avec un nouvel événement. Jamais un message de conversation.
nonisolated struct FallPillAnnouncement: Equatable, Sendable {
    let userId: String
    let kind: FallAnnouncementKind
    let label: String
    let expiresAt: Date
}

/// Les annonces de chute en cours de défilement. Une personne n'a qu'UNE annonce à la fois : la plus récente
/// remplace la précédente, et chacune s'éteint seule après `lifetime`. La SyncPill ne persiste jamais.
@MainActor
final class FallAnnouncementFeed: ObservableObject {

    static let shared = FallAnnouncementFeed()
    /// Le temps de quelques tours de pastille : assez pour être lue, jamais assez pour devenir un état.
    static let lifetime: TimeInterval = 12

    @Published private(set) var current: [FallPillAnnouncement] = []

    private let now: () -> Date
    private var expiry: Task<Void, Never>?

    nonisolated deinit {}

    init(now: @escaping () -> Date = { Date() }) {
        self.now = now
    }

    func post(userId: String, kind: FallAnnouncementKind, label: String) {
        let announcement = FallPillAnnouncement(
            userId: userId, kind: kind, label: label, expiresAt: now().addingTimeInterval(Self.lifetime)
        )
        current = current.filter { $0.userId != userId } + [announcement]
        scheduleExpiry()
    }

    /// Ce qui a passé son échéance s'éteint — le minuteur l'appelle.
    func expireDue() {
        let instant = now()
        let kept = current.filter { $0.expiresAt > instant }
        if kept != current { current = kept }
        scheduleExpiry()
    }

    func reset() {
        expiry?.cancel()
        expiry = nil
        if !current.isEmpty { current = [] }
    }

    /// Les entrées de la SyncPill, une par annonce vivante.
    var entries: [SyncPillEntry] { current.map(Self.entry(for:)) }

    static func entry(for announcement: FallPillAnnouncement) -> SyncPillEntry {
        SyncPillEntry(
            id: "fall.\(announcement.userId)",
            label: announcement.label,
            iconName: FallDetectionWording.iconName(for: announcement.kind),
            dotStyle: announcement.kind == .detected ? .error : .success,
            source: nil,
            showsActivityDots: false
        )
    }

    private func scheduleExpiry() {
        expiry?.cancel()
        guard let next = current.map(\.expiresAt).min() else {
            expiry = nil
            return
        }
        let delay = max(0, next.timeIntervalSince(now()))
        expiry = Task { [weak self] in
            do {
                try await Task.sleep(for: .seconds(delay))
            } catch {
                return
            }
            self?.expireDue()
        }
    }
}
