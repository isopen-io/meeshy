import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// Élit le réel le plus centré dans le viewport du feed et expose son id.
/// Source UNIQUE de "quel réel joue". Call-aware : pendant un appel, aucun
/// réel n'est actif (la session audio appartient à l'appel).
///
/// L'élection est `update()`-driven (appelé au scroll via `onPreferenceChange`)
/// MAIS la call-awareness vit AUSSI hors du scroll : le coordinator s'abonne
/// au flux d'état d'appel (`CallManager.$callState`) pour suspendre la lecture
/// si un appel démarre alors que le feed est immobile (C1). Sinon `update()`
/// ne serait jamais rappelé et le réel continuerait de jouer pendant l'appel.
@MainActor
final class ReelFeedAutoplayCoordinator: ObservableObject {
    @Published private(set) var activeReelId: String?

    private let isCallActive: () -> Bool
    /// Debounce des recalculs d'élection : annulé+reprogrammé à chaque `update()`
    /// pour coalescer le churn de frames au scroll (I2).
    private var debounceTask: Task<Void, Never>?
    private var callStateCancellable: AnyCancellable?

    /// `callStatePublisher` injecte le flux d'état d'appel (true = appel actif).
    /// Défaut : `CallManager.shared.$callState` mappé sur `isActive`, qui émet
    /// la transition inactif→actif même sans scroll. Les tests passent un
    /// publisher déterministe (ou `nil`) pour ne pas toucher le singleton.
    init(
        isCallActive: @escaping () -> Bool = { MediaSessionCoordinator.shared.isCallActive },
        callStatePublisher: AnyPublisher<Bool, Never>? = ReelFeedAutoplayCoordinator.defaultCallStatePublisher
    ) {
        self.isCallActive = isCallActive
        if let callStatePublisher {
            callStateCancellable = callStatePublisher
                .receive(on: DispatchQueue.main)
                .sink { [weak self] active in
                    guard active else { return }
                    // Un appel devient actif sans scroll : couper immédiatement.
                    self?.suspendForCall()
                }
        }
    }

    /// Source par défaut de l'état d'appel : transition de `CallManager.callState`
    /// vers un `Bool` "appel actif". Construite hors-init pour rester `nil` si la
    /// couche appel n'est pas disponible (preview/test sans singleton).
    static var defaultCallStatePublisher: AnyPublisher<Bool, Never> {
        CallManager.shared.$callState
            .map(\.isActive)
            .removeDuplicates()
            .eraseToAnyPublisher()
    }

    func update(frames: [ReelFrame], viewportMinY: CGFloat, viewportMaxY: CGFloat) {
        // Appel actif : pas de réel, et on coupe court sans débounce (réactivité
        // immédiate côté call-awareness — la session appartient à l'appel).
        if isCallActive() {
            clear()
            return
        }
        debounceTask?.cancel()
        debounceTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 100_000_000) // 100 ms
            guard !Task.isCancelled, let self else { return }
            guard !self.isCallActive() else { self.clear(); return }
            let next = mostCenteredReel(frames: frames, viewportMinY: viewportMinY, viewportMaxY: viewportMaxY)
            if next != self.activeReelId { self.activeReelId = next }
        }
    }

    func clear() {
        debounceTask?.cancel()
        debounceTask = nil
        if activeReelId != nil { activeReelId = nil }
    }

    /// Suspension immédiate déclenchée par un passage en appel hors scroll (C1) :
    /// vide l'élection ET stoppe le moteur partagé (les surfaces ne sont pas
    /// re-rendues si le feed est immobile, donc on pause ici aussi).
    private func suspendForCall() {
        clear()
        SharedAVPlayerManager.shared.pause()
    }
}
