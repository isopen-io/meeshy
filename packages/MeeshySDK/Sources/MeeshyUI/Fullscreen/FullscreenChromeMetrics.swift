import SwiftUI

/// **Les cotes du chrome plein écran — une seule table pour tous les visualiseurs** (#8878).
///
/// Galerie de conversation, plein écran audio, story, réel, vidéo, image, photo de profil,
/// lieu : chacun posait sa croix, son menu et ses actions à sa propre taille (32, 36, 40 pt ;
/// glyphes de 14 à 28 pt). Ces cotes dérivent des jetons `MeeshyUI` et de la charte
/// (`docs/product/charte-visuelle-ios.md` § 5 « Bouton-icône sur média », § 6).
public nonisolated enum FullscreenChromeMetrics {

    /// Le disque de verre d'un bouton du chrome — ce qu'on VOIT.
    public static let discDiameter: CGFloat = MeeshyControlSize.regular

    /// La zone tactile — ce qu'on TOUCHE. Elle déborde le disque tout autour.
    public static let tapTarget: CGFloat = MeeshyControlSize.tapTarget

    /// Le glyphe d'un disque, figé : il est borné par le disque (doctrine 82i).
    public static let discGlyphSize: CGFloat = MeeshyIconSize.lg

    /// Le glyphe d'une action FLOTTANTE du rail (story, réel), figé dans sa cellule.
    public static let floatingGlyphSize: CGFloat = MeeshyIconSize.xxl

    /// La largeur d'une cellule flottante : le glyphe et son libellé ou son compteur.
    public static let floatingCellWidth: CGFloat = 56

    /// L'intervalle entre deux actions d'une colonne ou d'un rail.
    public static let railSpacing: CGFloat = MeeshySpacing.sm

    /// La gouttière latérale du chrome.
    public static let edgeInset: CGFloat = MeeshySpacing.lg

    /// La marge au-dessus de la barre haute, sous la zone sûre.
    public static let topInset: CGFloat = MeeshySpacing.sm

    /// L'intervalle entre les éléments de la barre haute.
    public static let barSpacing: CGFloat = MeeshySpacing.sm

    /// La course verticale qui ferme un visualiseur dont l'axe vertical est libre —
    /// la valeur que la galerie et le lecteur vidéo passent déjà à
    /// `MediaStageGestures.resolveDrag(translation:presentation:threshold:)`.
    public static let dismissDragThreshold: CGFloat = 150

    /// Le délai au bout duquel le chrome d'une vidéo EN LECTURE s'efface de lui-même.
    public static let autoHideDelay: Double = 3

    /// Le décalage qui fait jaillir la rangée d'émojis à GAUCHE du bouton qui l'ouvre
    /// (rail de la story, rail du réel).
    public static let reactionStripLeadingOffset: CGFloat = -floatingCellWidth

    /// Le CONTOUR d'une action flottante : le même symbole, agrandi d'autant, derrière le
    /// glyphe (`StoryActionButton` d'avant #8878, restauré le 2026-10-01).
    public static let outlineScale: CGFloat = 1.22

    /// Le HALO qui l'accompagne : une ombre de la teinte du contour.
    public static let outlineGlowRadius: CGFloat = 7

    /// L'opacité de ce halo.
    public static let outlineGlowOpacity: Double = 0.55
}

/// **Les glyphes du chrome plein écran — un verbe, un symbole, partout** (#8878).
public nonisolated enum FullscreenChromeSymbol {
    public static let close = "xmark"
    public static let more = "ellipsis"
    public static let react = "face.smiling"
    public static let reactBadge = "plus"
    public static let like = "heart"
    public static let likeActive = "heart.fill"
    public static let reply = "arrowshape.turn.up.left.fill"
    public static let comments = "bubble.right.fill"
    public static let share = "square.and.arrow.up"
    public static let save = "arrow.down.to.line"
    public static let saved = "checkmark"
    public static let repost = "arrow.2.squarepath"
    public static let compose = "wand.and.stars"
}

/// Un palier d'un voile : l'opacité du noir à une position (0 = bord haut du voile).
public nonisolated struct FullscreenScrimStop: Equatable, Sendable {
    public let opacity: Double
    public let location: CGFloat

    public init(opacity: Double, location: CGFloat) {
        self.opacity = opacity
        self.location = location
    }
}

/// **Le voile de lisibilité** : deux dégradés noirs, ancrés au haut et au bas de l'ÉCRAN,
/// qui détachent le chrome du média. Les valeurs sont celles du lecteur de story (#6701),
/// déjà reprises par la galerie (#6904) et la scène d'un réel.
public nonisolated enum FullscreenScrimMetrics {

    /// La hauteur du voile haut AU-DELÀ de la zone sûre.
    public static let topExtent: CGFloat = 110

    /// La hauteur du voile bas.
    public static let bottomHeight: CGFloat = 240

    public static let topStops: [FullscreenScrimStop] = [
        FullscreenScrimStop(opacity: 0.7, location: 0),
        FullscreenScrimStop(opacity: 0.4, location: 0.5),
        FullscreenScrimStop(opacity: 0, location: 1)
    ]

    public static let bottomStops: [FullscreenScrimStop] = [
        FullscreenScrimStop(opacity: 0, location: 0),
        FullscreenScrimStop(opacity: 0.55, location: 0.45),
        FullscreenScrimStop(opacity: 0.92, location: 1)
    ]
}
