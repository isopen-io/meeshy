import SwiftUI

/// Agrège les frames des cartes réel visibles, remontées au niveau du feed.
struct ReelVisibilityPreferenceKey: PreferenceKey {
    static var defaultValue: [ReelFrame] { [] }
    static func reduce(value: inout [ReelFrame], nextValue: () -> [ReelFrame]) {
        value.append(contentsOf: nextValue())
    }
}

extension View {
    /// Chaque carte réel publie sa frame (espace `.global`) pour que le feed
    /// élise le réel le plus centré. iOS 16-compatible (GeometryReader +
    /// PreferenceKey, pas d'API scroll iOS 17).
    func reportReelFrame(id: String, kind: ReelMediaKind) -> some View {
        background(
            GeometryReader { proxy in
                let f = proxy.frame(in: .global)
                Color.clear.preference(
                    key: ReelVisibilityPreferenceKey.self,
                    value: [ReelFrame(id: id, midY: f.midY, height: f.height, kind: kind)]
                )
            }
        )
    }
}
