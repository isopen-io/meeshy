import CoreLocation
import Foundation
import MeeshySDK

/// Un relevé de l'appareil, seulement si la permission est DÉJÀ donnée : ranger un point ne demande jamais rien.
@MainActor
protocol BloodLocationFixReading: AnyObject {
    func authorizedFix() async -> SharedLocationFix?
}

/// Ce que le relevé doit savoir du compte avant de partir : la fonction ouverte par la passerelle, et un Sang au moins.
struct BloodLocationRecorderContext: Sendable {
    var isEnabled: @concurrent @Sendable () async -> Bool
    var links: @concurrent @Sendable () async -> [RelationLink]

    static let live = BloodLocationRecorderContext(
        isEnabled: { (try? await RelationsService.shared.config())?.bloodLocationEnabled ?? false },
        links: { (try? await RelationsService.shared.links()) ?? [] }
    )
}

/// LE RELEVÉ DU SANG (#18872, #13937) : au retour au premier plan, mon historique reçoit un point si un Sang peut le
/// relire, que je ne suis pas en fantôme, que la permission « pendant l'utilisation » est déjà donnée, et que le pas
/// est un changement (`BloodLocationRecordGate`). Le dernier point rangé vit en mémoire de session, par compte : une
/// position ne s'écrit jamais sur le disque.
@MainActor
final class BloodLocationRecorder {
    static let shared = BloodLocationRecorder()

    private let service: BloodLocationProviding
    private let fixes: BloodLocationFixReading
    private let context: BloodLocationRecorderContext
    private let isGhost: @MainActor (String) -> Bool
    private let account: @MainActor () -> String?
    private let now: @MainActor () -> Date
    private var lastRecorded: [String: BloodLocationPoint] = [:]
    private var lastDeclined: [String: Date] = [:]
    private var isRunning = false

    nonisolated deinit {}

    init(service: BloodLocationProviding = BloodLocationService.shared,
         fixes: BloodLocationFixReading = AuthorizedLocationFix(),
         context: BloodLocationRecorderContext = .live,
         isGhost: @escaping @MainActor (String) -> Bool = { UserDefaultsBloodGhostStore(account: $0).isGhost },
         account: @escaping @MainActor () -> String? = { AuthManager.shared.isAuthenticated ? AuthManager.shared.currentUser?.id : nil },
         now: @escaping @MainActor () -> Date = { Date() }) {
        self.service = service
        self.fixes = fixes
        self.context = context
        self.isGhost = isGhost
        self.account = account
        self.now = now
    }

    /// Range un point si tout le permet ; ne dit rien, n'affiche rien, et ne réessaie qu'au prochain retour.
    func recordIfDue() async {
        guard !isRunning, let account = account(), !account.isEmpty, !isGhost(account) else { return }
        if let declined = lastDeclined[account], now().timeIntervalSince(declined) < BloodLocationRecordGate.minimumInterval { return }
        isRunning = true
        defer { isRunning = false }
        guard let fix = await fixes.authorizedFix(),
              let reading = BloodLocationReading(latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy),
              BloodLocationRecordGate.isDue(reading, at: now(), after: lastRecorded[account]) else { return }
        guard await context.isEnabled(), BloodLocationRecordGate.hasAudience(await context.links()) else {
            lastDeclined[account] = now()
            return
        }
        guard (try? await service.record(reading)) == true else { return }
        lastRecorded[account] = BloodLocationPoint(latitude: reading.latitude, longitude: reading.longitude,
                                                   accuracy: reading.accuracy, recordedAt: now())
    }
}

/// Le relevé de `SharedLocationFixSource`, interrogé seulement si la permission est déjà accordée.
@MainActor
final class AuthorizedLocationFix: BloodLocationFixReading {
    private let manager = CLLocationManager()
    private lazy var source = SharedLocationFixSource()

    nonisolated deinit {}

    func authorizedFix() async -> SharedLocationFix? {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            guard case .fix(let fix) = await source.currentFix() else { return nil }
            return fix
        default:
            return nil
        }
    }
}
