import Foundation
import CoreGraphics

/// Pure, `nonisolated` framing solver for the story canvas **container transform**.
/// The canvas keeps fixed intrinsic 9:16 bounds (`CanvasGeometry.aspectFitSize` of the
/// full viewport); this helper computes the `scale`/`offset`/`cornerRadius` a SwiftUI
/// container applies to place it in the free region `[headerInset … viewport.height - bottomInset]`.
/// Shared by composer and reader. No SwiftUI/UIKit/main-actor → unit-testable off-main.
public nonisolated enum StoryCanvasFraming {

    public enum Presentation: Equatable, Sendable { case free, carded, immersive }

    /// Alignement vertical de la carte DANS la région libre quand elle ne la
    /// remplit pas (contrainte largeur active). `.center` = historique ;
    /// `.top` = flush sous le header, le mou entier en bas (directive user
    /// 2026-07-04) ; `.bottom` = collée juste au-dessus du sheet, le mou entier
    /// en haut — une carte PAYSAGE (courte) reste ainsi au ras du sheet et
    /// « remonte » avec lui quand il grandit (directive user 2026-07-20).
    public enum VerticalAlignment: Equatable, Sendable { case center, top, bottom }

    public struct Input: Equatable, Sendable {
        public let viewport: CGSize
        public let headerInset: CGFloat
        public let bottomInset: CGFloat
        /// Horizontal margin (each side) kept around the canvas card so it is always
        /// visually distinguished from the viewport edges. 0 = fit-by-width (legacy).
        public let sideInset: CGFloat
        public let state: Presentation
        public let cardedCornerRadius: CGFloat
        public let verticalAlignment: VerticalAlignment
        /// Ratio (largeur / hauteur) du canvas. Défaut = portrait 9:16 (tous les
        /// call sites historiques inchangés) ; un fond paysage passe le ratio 16:9
        /// pour que la carte cadre exactement le canvas horizontal.
        public let canvasRatio: CGFloat
        public init(viewport: CGSize, headerInset: CGFloat, bottomInset: CGFloat,
                    sideInset: CGFloat = 0,
                    state: Presentation, cardedCornerRadius: CGFloat,
                    verticalAlignment: VerticalAlignment = .center,
                    canvasRatio: CGFloat = CanvasGeometry.portraitRatio) {
            self.viewport = viewport; self.headerInset = headerInset
            self.bottomInset = bottomInset; self.sideInset = sideInset; self.state = state
            self.cardedCornerRadius = cardedCornerRadius
            self.verticalAlignment = verticalAlignment
            self.canvasRatio = canvasRatio
        }
    }

    public struct Result: Equatable, Sendable {
        public let scale: CGFloat
        public let offset: CGSize
        public let cornerRadius: CGFloat
        public init(scale: CGFloat, offset: CGSize, cornerRadius: CGFloat) {
            self.scale = scale; self.offset = offset; self.cornerRadius = cornerRadius
        }
        static let identity = Result(scale: 1, offset: .zero, cornerRadius: 0)
    }

    /// Truth-table helper for `canvasIsCarded`.
    ///
    /// **RETOURNÉE au #4124 (directive porteur 2026-08-28).** La règle disait
    /// « plein écran par défaut, cardée quand un panneau réduit la zone
    /// visible » ; elle dit maintenant l'inverse — **cardée par défaut**, plein
    /// écran seulement là où l'immersion est le sujet :
    ///
    /// > « mettre la scène 9:16 au centre avec coin arrondi et un peu d'espace
    /// > à gauche, haut, bas et droite de l'écran »
    ///
    /// Les deux exceptions ne sont pas des restes : ce sont deux directives
    /// antérieures du même porteur, et elles ne sont pas révoquées.
    ///
    /// - **DESSIN immersif** (2026-07-11) : pendant le dessin le canvas reste
    ///   plein écran, dessinable jusqu'aux angles, bulles flottantes sans sheet.
    ///   Le paramètre était jusqu'ici conservé « pour documenter la table » et
    ///   ne décidait RIEN — tant que le repos ne cardait pas, lui et le repos
    ///   rendaient le même verdict. Il redevient décisif, et il l'emporte même
    ///   band déployée.
    /// - **ÉDITION TEXTE** (2026-07-28) : sortie anticipée, jamais un terme de
    ///   la disjonction. Quand l'éditeur s'ouvre depuis la tuile Texte, la band
    ///   n'est PAS `.hidden` (seulement masquée et non-interactive), donc un
    ///   terme ordinaire serait écrasé par `bandPresent`.
    ///
    /// `bandPresent` et `timelineActive` deviennent de ce fait sans effet
    /// PROPRE — cardé ∪ cardé = cardé. Ils restent au contrat parce qu'ils
    /// nomment les deux raisons HISTORIQUES du cardage : les retirer
    /// obligerait chaque appelant à re-prouver qu'il n'en avait pas besoin, et
    /// perdrait la trace de la règle qu'on vient d'inverser.
    public static func isCarded(bandPresent: Bool, drawingActive: Bool, textActive: Bool, timelineActive: Bool = false) -> Bool {
        guard !textActive, !drawingActive else { return false }
        return true
    }

    /// Présentation du canvas **reader** selon la visibilité du chrome.
    /// - Au repos en mode normal (chrome visible) → `.carded` : carte arrondie
    ///   marginée, distincte du viewport.
    /// - Chrome masqué (long-press « peek » immersif) → `.free` : le canvas épouse
    ///   les bords du viewport (plein bord 9:16, coins droits), contrôleurs cachés.
    /// - Session plein écran (`isFullscreenSession`) → toujours `.free`, même quand
    ///   le chrome ré-apparaît brièvement au touch-and-hold (pas de re-cardage).
    public static func readerPresentation(isFullscreenSession: Bool, chromeVisible: Bool) -> Presentation {
        (isFullscreenSession || !chromeVisible) ? .free : .carded
    }

    /// **La colonne d'une légende : celle du CANVAS, jamais celle du conteneur.**
    ///
    /// Une légende posée sur une scène est un commentaire de CETTE scène ; elle
    /// s'aligne donc sur ses bords, comme la ligne d'auteur d'une carte de réel.
    /// Le conteneur qui l'héberge peut être plus large — le lecteur de stories
    /// déborde volontairement le viewport pour sa pagination — et un
    /// `frame(maxWidth: .infinity)` y résout la largeur du CONTENEUR.
    ///
    /// Mesuré au simulateur le 2026-09-02 (#4762) : conteneur de 491,3 pt à
    /// x = −44,7 sur un écran de 402 pt, légende à `horizontalInset` 20 ⇒ elle
    /// commençait à **−24,7 pt**, hors écran, et « The latest apps » s'affichait
    /// « e latest apps ». La mesure a rendu −24,8.
    ///
    /// > L'ordre `padding` puis `frame` était déjà juste. Ce qui débordait
    /// > n'était pas la vue, c'était la largeur qu'on lui PROPOSAIT — et une
    /// > vue ne peut pas se défendre d'un conteneur trop large.
    ///
    /// - Parameters:
    ///   - viewport: la taille offerte à l'hôte (souvent plus large que la scène).
    ///   - ratio: le ratio du canvas (9:16 en portrait, 16:9 pour un fond paysage).
    ///   - scale: l'échelle de présentation rendue par `resolve` — la carte est
    ///     peinte à `scale`, la légende doit suivre le même rétrécissement.
    public static func captionColumnWidth(viewport: CGSize,
                                          ratio: CGFloat,
                                          scale: CGFloat) -> CGFloat {
        let fit = CanvasGeometry.aspectFitSize(in: viewport, ratio: ratio)
        return max(0, fit.width * max(scale, 0))
    }

    public static func resolve(_ input: Input) -> Result {
        guard input.state == .carded else { return .identity }
        let intrinsic = CanvasGeometry.aspectFitSize(in: input.viewport, ratio: input.canvasRatio)
        guard intrinsic.width > 0, intrinsic.height > 0,
              input.viewport.width > 0, input.viewport.height > 0 else { return .identity }

        let regionTop = max(0, input.headerInset)
        let regionBottom = max(regionTop, input.viewport.height - max(0, input.bottomInset))
        let regionHeight = max(0, regionBottom - regionTop)
        let regionWidth = max(0, input.viewport.width - 2 * max(0, input.sideInset))
        guard regionHeight > 0, regionWidth > 0 else { return .identity }

        // Aspect-fit the (full-width 9:16) canvas inside the inset region — constrained by
        // BOTH the height (below header / above sheet, resized to the sheet opening) AND the
        // width (side margins). Never upscales past intrinsic. So the canvas is always a
        // centred rounded card that (a) starts below the header, (b) never overlaps the sheet
        // when open, (c) grows toward full-but-margined when the sheet collapses — identical
        // for every tool incl. drawing (user spec 2026-06-02).
        let scaleH = regionHeight / intrinsic.height
        let scaleW = regionWidth / intrinsic.width
        let scale = min(1, max(0, min(scaleH, scaleW)))

        // `.top` : la carte colle au bord SUPÉRIEUR de la région (flush sous
        // le header) — le mou vertical éventuel (contrainte largeur active)
        // reste entièrement en bas. `.center` : répartition historique.
        let scaledHeight = intrinsic.height * scale
        let cardCenterY: CGFloat = {
            switch input.verticalAlignment {
            case .center: return regionTop + regionHeight / 2
            case .top:    return regionTop + scaledHeight / 2
            case .bottom: return regionBottom - scaledHeight / 2
            }
        }()
        let offsetY = cardCenterY - input.viewport.height / 2
        // Rounded whenever carded — even near full size (e.g. drawer collapsed). A carded
        // canvas is always a rounded card ("rounded card, always", user 2026-06-02) ; the
        // `.free`/`.immersive` states short-circuit to `.identity` (no rounding) above.
        let corner = input.cardedCornerRadius
        return Result(scale: scale, offset: CGSize(width: 0, height: offsetY), cornerRadius: corner)
    }
}
