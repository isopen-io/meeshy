import SwiftUI

/// **Le voile de lisibilité du plein écran** (#8878) — celui du lecteur de story (#6701),
/// déjà repris par la galerie (#6904) et la scène d'un réel, remonté au SDK pour que
/// chaque visualiseur le monte au lieu de peindre son propre dégradé.
///
/// Deux dégradés pleine largeur ancrés au haut et au bas de l'ÉCRAN, sourds au doigt,
/// muets pour VoiceOver, et qui suivent le chrome au même ressort : sans chrome, pas de
/// voile — l'image immersive est celle qui a été publiée.
public struct FullscreenScrims: View {

    private let topInset: CGFloat
    private let chromeVisible: Bool

    public init(topInset: CGFloat, chromeVisible: Bool) {
        self.topInset = topInset
        self.chromeVisible = chromeVisible
    }

    public nonisolated static func opacity(chromeVisible: Bool) -> Double {
        chromeVisible ? 1 : 0
    }

    public var body: some View {
        VStack {
            LinearGradient(stops: Self.gradientStops(FullscreenScrimMetrics.topStops),
                           startPoint: .top, endPoint: .bottom)
                .frame(height: topInset + FullscreenScrimMetrics.topExtent)
            Spacer()
            LinearGradient(stops: Self.gradientStops(FullscreenScrimMetrics.bottomStops),
                           startPoint: .top, endPoint: .bottom)
                .frame(height: FullscreenScrimMetrics.bottomHeight)
        }
        .opacity(Self.opacity(chromeVisible: chromeVisible))
        .animation(.spring(response: 0.32, dampingFraction: 0.78), value: chromeVisible)
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private static func gradientStops(_ stops: [FullscreenScrimStop]) -> [Gradient.Stop] {
        stops.map { Gradient.Stop(color: Color.black.opacity($0.opacity), location: $0.location) }
    }
}

public extension View {

    /// **Le chrome qui s'efface ne se touche plus** (#6142) : il part en fondu, donc il
    /// reste dans l'arbre pendant la transition — sans cette garde, un tap posé pendant
    /// ces deux dixièmes actionnerait un bouton que l'utilisateur voit disparaître.
    func fullscreenChromeVisibility(_ visible: Bool) -> some View {
        opacity(visible ? 1 : 0)
            .allowsHitTesting(visible)
            .accessibilityHidden(!visible)
            .animation(.easeInOut(duration: 0.2), value: visible)
    }
}
