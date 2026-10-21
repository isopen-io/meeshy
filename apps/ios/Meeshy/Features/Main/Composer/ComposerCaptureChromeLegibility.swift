import SwiftUI

/// **Le chrome du viseur reste lisible sur un cadre clair** (#9777) — la croix, le flash, la
/// bascule, les zooms, « Filtres / Cadres » et le nom du cadre sont BLANCS : posés sur un
/// Photomaton, une Carte postale ou un Faire-part, ils disparaissaient. Sous un cadre, un voile
/// sombre passe derrière la rangée haute et le bas de la capture, assez dense pour que le blanc
/// garde 4,5:1 (WCAG AA) même sur un fond blanc pur. Sans cadre, rien ne change.
nonisolated enum ComposerCaptureChromeLegibility {
    static let minimumContrast: Double = 4.5
    static let veilOpacity: Double = 0.55
    /// Le fondu du voile, AU-DELÀ des contrôles : ils restent posés sur sa partie pleine.
    static let feather: CGFloat = 28

    static func veilOpacity(framed: Bool) -> Double {
        framed ? veilOpacity : 0
    }

    /// Luminance relative WCAG d'une composante sRGB (0…1).
    static func linear(_ channel: Double) -> Double {
        channel <= 0.04045 ? channel / 12.92 : pow((channel + 0.055) / 1.055, 2.4)
    }

    /// Le contraste de l'encre BLANCHE sur un fond gris `background` (0…1) recouvert d'un voile noir d'opacité `veil`.
    static func whiteInkContrast(background: Double, veil: Double) -> Double {
        let seen = background * (1 - veil)
        return (1.0 + 0.05) / (linear(seen) + 0.05)
    }
}

/// Le voile derrière un bord du chrome : plein sous les contrôles, fondu au-delà.
struct ComposerCaptureChromeVeil: View {
    let edge: VerticalEdge
    let opacity: Double

    var body: some View {
        let dense = Color.black.opacity(opacity)
        let fade = LinearGradient(colors: [dense, .clear],
                                  startPoint: edge == .top ? .top : .bottom,
                                  endPoint: edge == .top ? .bottom : .top)
            .frame(height: ComposerCaptureChromeLegibility.feather)
        VStack(spacing: 0) {
            if edge == .bottom { fade }
            dense
            if edge == .top { fade }
        }
        .padding(edge == .top ? Edge.Set.bottom : Edge.Set.top, -ComposerCaptureChromeLegibility.feather)
        .ignoresSafeArea(edges: edge == .top ? Edge.Set.top : Edge.Set.bottom)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
