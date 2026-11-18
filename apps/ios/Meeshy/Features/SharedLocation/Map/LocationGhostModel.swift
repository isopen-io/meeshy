import Combine
import Foundation
import MeeshySDK

/// MON FANTÔME GLOBAL (#19469, planche `Moi-Actions`) : « Masque ma position pour tous, Sang compris ». Hors drapeau
/// Sang, par `PUT /me/location/ghost` (#19203). Le geste s'applique aussitôt ; un refus ou une absence de réseau le
/// défait. La valeur réglée se range dans la MÊME mémoire que celle que l'enregistreur Sang lit
/// (`UserDefaultsBloodGhostStore`) : la face Actions et la carte du Sang disent le même fantôme.
@MainActor
final class LocationGhostModel: ObservableObject {

    @Published private(set) var isGhost: Bool
    @Published private(set) var isBusy = false

    private let service: LocationGhostProviding
    private let store: BloodGhostStoring

    nonisolated deinit {}

    init(service: LocationGhostProviding = LocationGhostService.shared,
         store: BloodGhostStoring = UserDefaultsBloodGhostStore()) {
        self.service = service
        self.store = store
        isGhost = store.isGhost
    }

    /// Renverse le fantôme ; `false` quand la passerelle ne l'a pas réglé et que le geste a été défait.
    @discardableResult
    func toggle() async -> Bool {
        await set(!isGhost)
    }

    @discardableResult
    func set(_ ghost: Bool) async -> Bool {
        guard !isBusy else { return false }
        let previous = isGhost
        isGhost = ghost
        isBusy = true
        defer { isBusy = false }
        do {
            let state = try await service.setGhost(ghost)
            isGhost = state.ghost
            store.isGhost = state.ghost
            return state.ghost == ghost
        } catch {
            isGhost = previous
            return false
        }
    }
}
