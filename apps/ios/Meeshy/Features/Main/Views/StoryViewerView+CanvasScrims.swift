import SwiftUI

/// **Les voiles de lisibilité du lecteur de story** (#6701).
///
/// Deux dégradés noirs, en haut et en bas de l'écran, détachent les contrôles du
/// contenu : barres de progression et ligne auteur en haut, rail et composer en
/// bas. Ils n'existent QUE pour ces contrôles. Quand le chrome s'efface — appui
/// long, lecture immersive — ils s'effacent avec lui, et reviennent avec lui :
/// sans quoi la lecture immersive montrait une image plus sombre que celle qui a
/// été publiée (captures 85 et 87, repères HAUT et BAS dans l'ombre).
///
/// Même ressort que l'en-tête du lecteur : voiles et contrôles partent et
/// reviennent dans le même mouvement.
///
/// Sorti de `StoryViewerView+Canvas.swift`, hors budget : on n'y ajoute pas, on
/// extrait d'abord.
struct StoryReaderScrims: View {
    let topInset: CGFloat
    let chromeVisible: Bool

    /// L'opacité des voiles : pleine sous le chrome, nulle sans lui.
    static func opacity(chromeVisible: Bool) -> Double {
        chromeVisible ? 1 : 0
    }

    var body: some View {
        VStack {
            LinearGradient(
                stops: [
                    .init(color: .black.opacity(0.7), location: 0),
                    .init(color: .black.opacity(0.4), location: 0.5),
                    .init(color: .black.opacity(0.0), location: 1)
                ],
                startPoint: .top, endPoint: .bottom
            )
            .frame(height: topInset + 110)
            Spacer()
            // Scrim bottom plus opaque + plus haut — assure que le caption
            // texte d'une slide (rendu par le canvas à y≈0.95 en design
            // coords) ne déborde plus visuellement sur la zone composer
            // « Commenter... ». Le canvas du reader est positionné au
            // centre du geometry (9:16 fit-to-width), donc un text
            // positioné bas du slide tombe juste au-dessus du composer.
            // Sans ce scrim fort, les deux se superposent — symptôme
            // user-reporté 2026-05-27.
            LinearGradient(
                stops: [
                    .init(color: .black.opacity(0.0), location: 0),
                    .init(color: .black.opacity(0.55), location: 0.45),
                    .init(color: .black.opacity(0.92), location: 1)
                ],
                startPoint: .top, endPoint: .bottom
            )
            .frame(height: 240)
        }
        .opacity(Self.opacity(chromeVisible: chromeVisible))
        .animation(.spring(response: 0.32, dampingFraction: 0.78), value: chromeVisible)
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
