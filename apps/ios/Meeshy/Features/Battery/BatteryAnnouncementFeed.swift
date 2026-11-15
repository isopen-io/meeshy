import Combine
import Foundation
import MeeshySDK

/// Une annonce de batterie telle que la SyncPill la fait défiler (#14147). Un ÉVÉNEMENT, pas un état : elle passe,
/// disparaît à son échéance, et ne revient qu'avec un nouvel événement. Jamais un message de conversation.
nonisolated struct BatteryPillAnnouncement: Equatable, Sendable {
    let userId: String
    let kind: BatteryAnnouncementKind?
    let label: String
    let expiresAt: Date
}

/// Les annonces de batterie en cours de défilement. Une personne n'a qu'UNE annonce à la fois : la plus récente
/// remplace la précédente, et chacune s'éteint seule après `lifetime`.
@MainActor
final class BatteryAnnouncementFeed: ObservableObject {

    static let shared = BatteryAnnouncementFeed()
    /// Le temps de quelques tours de pastille : assez pour être lue, jamais assez pour devenir un état.
    static let lifetime: TimeInterval = 12

    @Published private(set) var current: [BatteryPillAnnouncement] = []

    private let now: () -> Date
    private var expiry: Task<Void, Never>?

    nonisolated deinit {}

    init(now: @escaping () -> Date = { Date() }) {
        self.now = now
    }

    func post(userId: String, kind: BatteryAnnouncementKind?, label: String) {
        let announcement = BatteryPillAnnouncement(
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

    static func entry(for announcement: BatteryPillAnnouncement) -> SyncPillEntry {
        SyncPillEntry(
            id: "battery.\(announcement.userId)",
            label: announcement.label,
            iconName: BatteryAnnouncementWording.iconName(for: announcement.kind),
            dotStyle: BatteryAnnouncementWording.dotStyle(for: announcement.kind),
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
