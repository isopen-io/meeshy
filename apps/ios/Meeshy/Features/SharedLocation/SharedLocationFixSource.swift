import Combine
import CoreLocation
import Foundation
import MeeshySDK
import os

/// Les relevés de l'appareil pour mon partage de position (#16983), « pendant l'utilisation » seulement : l'app au
/// premier plan suit l'appareil, l'app en arrière-plan se tait, et le terme serveur borne tout.
///
/// `@MainActor` avec une deinit `nonisolated` (la deinit isolée tue le processus sous iOS < 26, voir
/// `LocationPickerModel`) : le gestionnaire naît sur le main et y rappelle, et chaque rappel du délégué repasse par le
/// main avant de toucher l'état.
@MainActor
final class SharedLocationFixSource: NSObject, CLLocationManagerDelegate, SharedLocationFixProviding {

    private let manager = CLLocationManager()
    private let subject = PassthroughSubject<SharedLocationFix, Never>()
    private var pending: [CheckedContinuation<SharedLocationFixResult, Never>] = []
    private var isFollowing = false
    private var request = 0
    private var patienceTask: Task<Void, Never>?
    private let log = MeeshyLog.logger(.location)

    /// Un relevé plus vieux que ça ne dit plus où l'on est.
    private static let freshness: TimeInterval = 60
    /// Sans réponse de l'appareil (ni relevé, ni refus) au-delà, le partage dit « position indisponible ».
    private static let patience: Duration = .seconds(30)

    override init() {
        super.init()
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        manager.distanceFilter = SharedLocationUpdateGate.minimumDistanceMeters / 2
    }

    nonisolated deinit {}

    var fixes: AnyPublisher<SharedLocationFix, Never> { subject.eraseToAnyPublisher() }

    func currentFix() async -> SharedLocationFixResult {
        if manager.delegate == nil { manager.delegate = self }
        if let recent = manager.location, abs(recent.timestamp.timeIntervalSinceNow) < Self.freshness, let fix = Self.fix(recent) {
            return .fix(fix)
        }
        switch manager.authorizationStatus {
        case .denied, .restricted:
            return .denied
        default:
            return await withCheckedContinuation { continuation in
                pending.append(continuation)
                guard pending.count == 1 else { return }
                ask()
            }
        }
    }

    func follow() {
        if manager.delegate == nil { manager.delegate = self }
        isFollowing = true
        manager.startUpdatingLocation()
    }

    func stopFollowing() {
        isFollowing = false
        manager.stopUpdatingLocation()
    }

    private func ask() {
        request += 1
        let asked = request
        patienceTask = Task { @MainActor [weak self] in
            do { try await Task.sleep(for: Self.patience) } catch { return }
            guard let self, self.request == asked else { return }
            self.resolve(.unavailable)
        }
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        } else {
            manager.requestLocation()
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let last = locations.last, let fix = Self.fix(last) else { return }
        Task { @MainActor [weak self] in self?.received(fix) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        let denied = (error as? CLError)?.code == .denied
        Task { @MainActor [weak self] in self?.failed(denied: denied) }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor [weak self] in self?.authorizationChanged(status) }
    }

    private func received(_ fix: SharedLocationFix) {
        resolve(.fix(fix))
        if isFollowing { subject.send(fix) }
    }

    private func failed(denied: Bool) {
        log.error("sharedLocation.fix.failure denied=\(denied, privacy: .public)")
        resolve(denied ? .denied : .unavailable)
    }

    private func authorizationChanged(_ status: CLAuthorizationStatus) {
        guard !pending.isEmpty else { return }
        switch status {
        case .authorizedWhenInUse, .authorizedAlways: manager.requestLocation()
        case .denied, .restricted: resolve(.denied)
        default: break
        }
    }

    private func resolve(_ result: SharedLocationFixResult) {
        let waiting = pending
        pending = []
        request += 1
        patienceTask?.cancel()
        patienceTask = nil
        waiting.forEach { $0.resume(returning: result) }
    }

    private nonisolated static func fix(_ location: CLLocation) -> SharedLocationFix? {
        guard location.horizontalAccuracy >= 0 else { return nil }
        return SharedLocationFix(
            latitude: location.coordinate.latitude,
            longitude: location.coordinate.longitude,
            accuracy: location.horizontalAccuracy
        )
    }
}
