import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// =============================================================================
// **Un glyphe posé NU sur un média se lit sur ce qu'il a SOUS LUI** (#6704, #6693).
//
// `MediaChromeScheme.swift` lit la luminance du média ENTIER : c'est juste pour un
// contrôle posé sur du VERRE (la colonne de la galerie, le « … » de la carte Réel),
// pas pour un glyphe nu. Vérification du 2026-09-15 sur une mire de barres vives : la
// moyenne du réel restait sombre pendant que la bande sous le rail était claire —
// J'aime 2,17:1, Enregistrer 2,62:1 — et le voile bas de la page assombrissait le fond
// de Repartager (4,56:1) et de Plus (5,83:1).
//
// Contrastes obtenus sur les luminances locales que la vérification a relevées :
//
// | lecture                                    | J'aime | Enregistrer | Repartager | Plus |
// |--------------------------------------------|--------|-------------|------------|------|
// | le média entier (avant)                    | 2,17   | 2,62        | 4,56       | 5,83 |
// | UNE région pour tout le rail               | 7,37   | 6,10        | 3,51       | 2,74 |
// | la région de CHAQUE glyphe, voile compris  | 7,37   | 6,10        | 3,51       | 5,83 |
//
// Une région commune rend « Plus » illisible : la décision se prend par glyphe, sur la
// part du média rapportée au cadre affiché, voilée comme la surface la voile. Ce
// fichier ne porte AUCUNE règle de teinte : la luminance est
// `CanvasChromeScheme.averageRelativeLuminance(of:)`, la frontière
// `CanvasChromeScheme.scheme(forBareGlyphOver:)`, le plancher `legibleOverCanvas(on:)`.
// =============================================================================

/// Comment la surface cadre son média : entier (`fit`) ou bord à bord (`fill`).
nonisolated enum MediaChromeFraming: Hashable, Sendable {
    case fit
    case fill
}

/// **Le voile noir qu'une surface pose entre son média et ses contrôles**, du haut au
/// bas de son cadre. La surface le PEINT depuis cette valeur et la mesure le COMPOSE
/// depuis la même : le voile mesuré ne peut pas s'écarter du voile affiché.
nonisolated struct MediaChromeVeil: Hashable, Sendable {
    struct Stop: Hashable, Sendable {
        let location: Double
        let opacity: Double
    }

    let stops: [Stop]

    /// Le voile bas du lecteur de Réels : rien sur la moitié haute, noir à 60 % au bord bas.
    static let reelPlayer = MediaChromeVeil(stops: [
        Stop(location: 0, opacity: 0),
        Stop(location: 0.5, opacity: 0),
        Stop(location: 1, opacity: 0.6)
    ])

    func opacity(at y: Double) -> Double {
        guard let premier = stops.first, let dernier = stops.last else { return 0 }
        guard y > premier.location else { return premier.opacity }
        guard y < dernier.location else { return dernier.opacity }
        guard let paire = zip(stops, stops.dropFirst()).first(where: { y <= $0.1.location }) else {
            return dernier.opacity
        }
        let (haut, bas) = paire
        let ecart = bas.location - haut.location
        guard ecart > 0 else { return bas.opacity }
        return haut.opacity + (bas.opacity - haut.opacity) * (y - haut.location) / ecart
    }

    @MainActor var gradient: LinearGradient {
        LinearGradient(stops: stops.map { Gradient.Stop(color: .black.opacity($0.opacity), location: $0.location) },
                       startPoint: .top, endPoint: .bottom)
    }
}

/// **Où un contrôle se pose sur le média** : son rectangle dans le cadre de la surface
/// (normalisé et arrondi à la grille — une mesure par cellule, jamais par image), le
/// ratio de ce cadre, le cadrage du média dedans et le voile entre les deux.
nonisolated struct MediaChromePlacement: Hashable, Sendable {
    static let grid = 64

    private let cells: [Int]
    private let aspectMillis: Int
    let framing: MediaChromeFraming
    let veil: MediaChromeVeil?

    init(region: CGRect, containerAspect: Double, framing: MediaChromeFraming, veil: MediaChromeVeil?) {
        let pas = Double(Self.grid)
        let debut = { (valeur: CGFloat) in
            min(Self.grid - 1, max(0, Int((Double(valeur) * pas).rounded(.down))))
        }
        let fin = { (valeur: CGFloat, plancher: Int) in
            min(Self.grid, max(plancher + 1, Int((Double(valeur) * pas).rounded(.up))))
        }
        let x0 = debut(region.minX)
        let y0 = debut(region.minY)
        self.cells = [x0, y0, fin(region.maxX, x0), fin(region.maxY, y0)]
        self.aspectMillis = max(1, Int((containerAspect * 1000).rounded()))
        self.framing = framing
        self.veil = veil
    }

    /// Le contrôle mesuré dans le cadre de la surface, tous deux dans le même espace.
    init?(control: CGRect, in container: CGRect, framing: MediaChromeFraming, veil: MediaChromeVeil?) {
        guard !control.isNull, !control.isEmpty, !container.isNull,
              container.width > 0, container.height > 0 else { return nil }
        self.init(region: CGRect(x: (control.minX - container.minX) / container.width,
                                 y: (control.minY - container.minY) / container.height,
                                 width: control.width / container.width,
                                 height: control.height / container.height),
                  containerAspect: Double(container.width / container.height),
                  framing: framing, veil: veil)
    }

    var region: CGRect {
        let pas = 1 / Double(Self.grid)
        return CGRect(x: Double(cells[0]) * pas, y: Double(cells[1]) * pas,
                      width: Double(cells[2] - cells[0]) * pas, height: Double(cells[3] - cells[1]) * pas)
    }

    var containerAspect: Double { Double(aspectMillis) / 1000 }

    var signature: String {
        let voile = veil.map { $0.stops.map { "\($0.location):\($0.opacity)" }.joined(separator: ",") } ?? "-"
        return "\(cells.map(String.init).joined(separator: ","))@\(aspectMillis)|\(framing)|\(voile)"
    }

    /// **La part du MÉDIA sous le contrôle**, en coordonnées normalisées de l'image —
    /// rapportée au cadre affiché. Hors du média (bande de letterbox), la frange du bord
    /// le plus proche : c'est elle que le fond flouté de la surface prolonge.
    func mediaRegion(imageAspect: Double) -> CGRect {
        let cadre = containerAspect
        guard imageAspect > 0 else { return region }
        let echelle = framing == .fit ? min(cadre / imageAspect, 1) : max(cadre / imageAspect, 1)
        let largeur = imageAspect * echelle
        let hauteur = echelle
        let origineX = (cadre - largeur) / 2
        let origineY = (1 - hauteur) / 2
        let zone = region
        let u = Self.frange((zone.minX * cadre - origineX) / largeur, (zone.maxX * cadre - origineX) / largeur)
        let v = Self.frange((zone.minY - origineY) / hauteur, (zone.maxY - origineY) / hauteur)
        return CGRect(x: u.lowerBound, y: v.lowerBound,
                      width: u.upperBound - u.lowerBound, height: v.upperBound - v.lowerBound)
    }

    private static func frange(_ debut: Double, _ fin: Double) -> ClosedRange<Double> {
        let minimum = 1 / Double(grid)
        let bas = min(max(debut, 0), 1 - minimum)
        return bas...max(min(fin, 1), bas + minimum)
    }

    /// **La luminance de ce que le contrôle a SOUS LUI** : la part du média rapportée au
    /// cadre, voilée comme la surface la voile, mesurée par la loi du SDK.
    func luminance(of image: UIImage) -> Double? {
        guard let source = image.cgImage, source.width > 0, source.height > 0,
              let espace = CGColorSpace(name: CGColorSpace.sRGB) else { return nil }
        let cote = 16
        guard let contexte = CGContext(data: nil, width: cote, height: cote, bitsPerComponent: 8,
                                       bytesPerRow: cote * 4, space: espace,
                                       bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        let zone = mediaRegion(imageAspect: Double(source.width) / Double(source.height))
        let largeur = Double(cote) / zone.width
        let hauteur = Double(cote) / zone.height
        contexte.interpolationQuality = .medium
        contexte.draw(source, in: CGRect(x: -zone.minX * largeur, y: -(1 - zone.maxY) * hauteur,
                                         width: largeur, height: hauteur))
        if let veil { voiler(contexte, cote: cote, par: veil, espace: espace) }
        return contexte.makeImage().flatMap { CanvasChromeScheme.averageRelativeLuminance(of: UIImage(cgImage: $0)) }
    }

    private func voiler(_ contexte: CGContext, cote: Int, par voile: MediaChromeVeil, espace: CGColorSpace) {
        let haut = Double(region.minY)
        let bas = Double(region.maxY)
        let jalons = [haut] + voile.stops.map(\.location).filter { $0 > haut && $0 < bas } + [bas]
        let couleurs = jalons.map { CGColor(srgbRed: 0, green: 0, blue: 0, alpha: voile.opacity(at: $0)) }
        let positions = jalons.map { CGFloat(($0 - haut) / (bas - haut)) }
        guard let degrade = CGGradient(colorsSpace: espace, colors: couleurs as CFArray, locations: positions) else { return }
        contexte.drawLinearGradient(degrade, start: CGPoint(x: 0, y: cote), end: .zero, options: [])
    }
}

/// **Une mesure** : le média, et la place du contrôle dessus. `key` borne la mesure à une
/// fois par média ET par cellule.
nonisolated struct MediaChromeProbe: Hashable, Sendable {
    let backdrop: MediaChromeBackdrop
    let placement: MediaChromePlacement

    var key: String { "\(backdrop.key)#\(placement.signature)" }
}

/// **Comment une surface pose des glyphes NUS sur son média.**
nonisolated enum MediaChromeStage: Hashable, Sendable {
    /// Chaque glyphe se mesure dans le cadre de la surface.
    case measured(framing: MediaChromeFraming, veil: MediaChromeVeil?)
    /// La surface ne connaît pas le cadre de son média : son rail en DÉCLARE l'empreinte,
    /// et tous ses glyphes partagent une mesure.
    case declared(MediaChromePlacement)

    /// Le lecteur de Réels : le média entier (`.fit`) dans la page, sous le voile bas.
    static let reelPlayer = MediaChromeStage.measured(framing: .fit, veil: .reelPlayer)

    /// **Le lecteur de story.** Le cadre du canvas ne descend pas jusqu'au rail — il vit
    /// dans `StoryViewerView+Canvas.swift` — donc le rail déclare son empreinte sur la
    /// carte, que le fond remplit (`.fill`).
    ///
    /// L'empreinte est CALCULÉE depuis la pose du rail (`StoryViewerView+Canvas.swift`,
    /// Layer 8) sur un iPhone 16 Pro — 402 × 874, zone sûre 62 / 34, carte 9:16 donc
    /// 402 × 715 centrée (y 80 → 795) :
    ///
    /// - en X : colonne de `56` (le bouton) + 2 × `6` de padding = 68 pt, collée à 16 pt
    ///   du bord → 318 → 386, soit **0,79 → 0,96** de la carte ;
    /// - en Y : le rail est borné par `topInset + 100` (barres de progression + en-tête)
    ///   et `safeAreaInsets.bottom + 96` (composer) → 162 → 744 à l'écran, soit
    ///   **0,115 → 0,93** de la carte.
    ///
    /// La première version de cette empreinte (0,78 / 0,25 / 0,22 / 0,70) mesurait une
    /// bande décalée de 13 % vers le bas : elle prenait le composer et manquait le haut
    /// du rail. `MediaChromeRailTests` la garde désormais par ses PROPRIÉTÉS — colonne de
    /// droite, étroite, ouverte sous l'en-tête et fermée au-dessus du composer — et non
    /// par ses quatre nombres, qu'un changement de gabarit doit pouvoir bouger.
    ///
    /// Ce qu'elle ne mesure PAS encore : les voiles de lecture (#6769, Layer 5) que le
    /// rail a SOUS lui. Suivi en #6779 — le halo de polarité opposée tient ce cas comme
    /// plancher, la décision reste fausse d'un cran sur les deux boutons du bas.
    static func storyRail(canvasAspect: Double) -> MediaChromeStage {
        .declared(MediaChromePlacement(region: CGRect(x: 0.79, y: 0.115, width: 0.17, height: 0.815),
                                       containerAspect: canvasAspect, framing: .fill, veil: nil))
    }
}

/// **Le rail d'une surface**, tel que ses glyphes le lisent dans l'environnement.
nonisolated struct MediaChromeRail: Equatable, Sendable {
    static let space = "MediaChromeRail"

    let backdrop: MediaChromeBackdrop?
    let stage: MediaChromeStage
    /// Le cadre de la surface, zone sûre comprise, dans l'espace `space` : le média, lui,
    /// va jusqu'aux bords.
    let container: CGRect?
    /// Le schéma PARTAGÉ par les glyphes d'une empreinte déclarée. `nil` : chaque glyphe
    /// se décide sur sa propre cellule.
    let sharedScheme: ColorScheme?

    func probe(for control: CGRect?) -> MediaChromeProbe? {
        guard let backdrop else { return nil }
        switch stage {
        case .declared(let placement):
            return MediaChromeProbe(backdrop: backdrop, placement: placement)
        case .measured(let framing, let veil):
            guard let control, let container,
                  let placement = MediaChromePlacement(control: control, in: container, framing: framing, veil: veil)
            else { return nil }
            return MediaChromeProbe(backdrop: backdrop, placement: placement)
        }
    }

    static func fullBleed(size: CGSize, insets: EdgeInsets) -> CGRect {
        CGRect(x: -insets.leading, y: -insets.top,
               width: size.width + insets.leading + insets.trailing,
               height: size.height + insets.top + insets.bottom)
    }

    /// Le schéma partagé d'une empreinte déclarée : la mesure de son média, ou — slide sans
    /// média — la couleur du fond, par la loi du fond uni.
    static func sharedScheme(stage: MediaChromeStage, backdrop: MediaChromeBackdrop?,
                             sample: MediaChromeSample?, flatBackground: String?) -> ColorScheme? {
        guard case .declared(let placement) = stage else { return nil }
        guard let backdrop else {
            return CanvasChromeScheme.scheme(background: flatBackground, hasMediaBackground: false)
        }
        return MediaChromeScheme.glyphScheme(for: MediaChromeProbe(backdrop: backdrop, placement: placement),
                                             sample: sample)
    }
}
