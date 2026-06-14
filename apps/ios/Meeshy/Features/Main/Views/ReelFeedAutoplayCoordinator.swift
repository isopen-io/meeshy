import SwiftUI
import MeeshySDK

/// Élit le réel le plus centré dans le viewport du feed et expose son id.
/// Source UNIQUE de "quel réel joue". Call-aware : pendant un appel, aucun
/// réel n'est actif (la session audio appartient à l'appel).
@MainActor
final class ReelFeedAutoplayCoordinator: ObservableObject {
    @Published private(set) var activeReelId: String?

    private let isCallActive: () -> Bool

    init(isCallActive: @escaping () -> Bool = { MediaSessionCoordinator.shared.isCallActive }) {
        self.isCallActive = isCallActive
    }

    func update(frames: [ReelFrame], viewportMinY: CGFloat, viewportMaxY: CGFloat) {
        if isCallActive() {
            if activeReelId != nil { activeReelId = nil }
            return
        }
        let next = mostCenteredReel(frames: frames, viewportMinY: viewportMinY, viewportMaxY: viewportMaxY)
        if next != activeReelId { activeReelId = next }
    }

    func clear() {
        if activeReelId != nil { activeReelId = nil }
    }
}
