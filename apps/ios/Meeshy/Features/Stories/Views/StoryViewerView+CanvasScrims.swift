import SwiftUI
import MeeshyUI

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
/// extrait d'abord. Le dessin vit dans le SDK (`FullscreenScrims`, #8878) : la galerie
/// et la scène d'un réel montent le même, ce nom reste celui que les gardes épinglent.
struct StoryReaderScrims: View {
    let topInset: CGFloat
    let chromeVisible: Bool

    static func opacity(chromeVisible: Bool) -> Double {
        FullscreenScrims.opacity(chromeVisible: chromeVisible)
    }

    var body: some View {
        FullscreenScrims(topInset: topInset, chromeVisible: chromeVisible)
    }
}
