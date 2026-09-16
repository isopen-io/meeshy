import CoreGraphics

/// **Une scène qui n'est qu'une image se présente comme l'image** (#6636,
/// directive porteur 2026-09-15).
///
/// > « Si rien ne sort des cadres de l'image, il ne faut pas afficher le
/// > canvas : considère le fond du plein écran ! »
///
/// Un fond AJUSTÉ (`fit`) n'occupe qu'une tranche de la scène 9:16, et le
/// canvas habille le reste d'un flou (`StoryLetterboxFill`). Ces bandes sont
/// une SURFACE de composition (#4519) — tant qu'un objet s'y pose. Quand aucun
/// objet n'en sort, la carte n'encadre rien de plus que l'image, et le lecteur
/// peint deux fois le même flou : celui des bandes, et celui du fond plein
/// écran qu'il pose déjà derrière la carte.
///
/// La loi rend un VERDICT. Elle ne mesure pas les objets : leur cadre dépend du
/// rendu (une police, un gabarit de sticker), et le rendu vit dans `MeeshyUI`.
/// Un mesureur injecté le lui donne ; ce que la loi possède, c'est la liste des
/// objets qui COMPTENT et la question posée à chacun.
///
/// **Elle échoue FERMÉE.** Un objet qu'on ne sait pas mesurer, un objet animé
/// par images clés, un fond tourné, un ratio inconnu : la carte reste. Rendre
/// la carte à tort coûte un flou de trop ; la retirer à tort coupe un texte que
/// l'auteur a posé.
///
/// Dans `MeeshySDK` et non `MeeshyUI` pour la raison que `StoryLetterboxFill`
/// documente : un moteur de règles sans état est un atome, et une conformance
/// née sous `defaultIsolation: MainActor` ne se compare plus hors du main actor.
public enum StoryImageOnlyPresentation {

    public enum Verdict: Equatable, Sendable {
        /// La carte 9:16 et ses bandes, telles qu'aujourd'hui.
        case canvas
        /// Le rectangle de l'image dans le repère du canvas — le seul que le
        /// lecteur présente.
        case imageOnly(CGRect)
    }

    /// L'emprise du dessin à main levée, mesurée par celui qui le rasterise.
    public enum DrawingExtent: Equatable, Sendable {
        case none
        case bounds(CGRect)
        /// Un dessin qu'on ne sait pas mesurer (l'ancien `PKDrawing` opaque).
        case unmeasurable
    }

    /// **Ce que le rendu pose sur un calque**, dans le repère du canvas :
    /// `position`, `bounds.size`, `anchorPoint` et la rotation.
    public struct Footprint: Equatable, Sendable {
        public let position: CGPoint
        public let size: CGSize
        public let anchor: CGPoint
        public let rotationDegrees: Double

        public init(position: CGPoint, size: CGSize,
                    anchor: CGPoint = CGPoint(x: 0.5, y: 0.5),
                    rotationDegrees: Double = 0) {
            self.position = position
            self.size = size
            self.anchor = anchor
            self.rotationDegrees = rotationDegrees
        }

        /// **La sémantique de `CALayer.frame`** : la boîte englobante des
        /// bornes tournées autour du point d'ancrage. Un objet tourné dont un
        /// coin sort de l'image a une boîte qui en sort — l'image étant un
        /// rectangle droit, les deux questions ont la même réponse.
        public var frame: CGRect {
            let local = CGRect(x: -size.width * anchor.x, y: -size.height * anchor.y,
                               width: size.width, height: size.height)
            let rotation = CGAffineTransform(rotationAngle: CGFloat(rotationDegrees * .pi / 180))
            return local.applying(rotation).offsetBy(dx: position.x, dy: position.y)
        }
    }

    /// Un point : l'arrondi d'une mesure de texte ne ramène pas la carte.
    public nonisolated static let overflowTolerance: CGFloat = 1

    /// Sous ce seuil, un fond « tourné » est un zéro flottant, pas une pose.
    nonisolated static let backgroundRotationTolerance: Double = 0.01

    public nonisolated static func resolve(effects: StoryEffects,
                                           mediaSize: CGSize?,
                                           canvasSize: CGSize,
                                           drawing: DrawingExtent = .none,
                                           footprint: (MeeshySceneObject) -> Footprint?) -> Verdict {
        guard let image = visibleImageRect(effects: effects, mediaSize: mediaSize,
                                           canvasSize: canvasSize)
        else { return .canvas }
        let enveloppe = image.insetBy(dx: -overflowTolerance, dy: -overflowTolerance)
        guard drawing.staysInside(enveloppe) else { return .canvas }
        let toutTient = effects.sceneObjects
            .filter { !$0.isBackground }
            .allSatisfy { objet in
                guard !isAnimated(objet), let cadre = footprint(objet) else { return false }
                return enveloppe.contains(cadre.frame)
            }
        return toutTient ? .imageOnly(image) : .canvas
    }

    /// L'emprise des traits, dans l'espace design du rasteriseur étiré au
    /// canvas. Le rayon compté est l'épaisseur ENTIÈRE, pas sa moitié : la
    /// pression module la largeur le long du trait, et la marge la couvre.
    public nonisolated static func strokeBounds(_ strokes: [StoryDrawingStroke],
                                                designSize: CGSize,
                                                canvasSize: CGSize) -> DrawingExtent {
        guard designSize.width > 0, designSize.height > 0 else { return .unmeasurable }
        let sx = canvasSize.width / designSize.width
        let sy = canvasSize.height / designSize.height
        let emprises = strokes.flatMap { trait in
            trait.points.map { point in
                let rayon = CGFloat(max(0, trait.width))
                return CGRect(x: (CGFloat(point.x) - rayon) * sx,
                              y: (CGFloat(point.y) - rayon) * sy,
                              width: 2 * rayon * sx, height: 2 * rayon * sy)
            }
        }
        guard let premiere = emprises.first else { return .none }
        return .bounds(emprises.dropFirst().reduce(premiere) { $0.union($1) })
    }

    /// **Le rectangle que le fond peint réellement.** `StoryBackgroundLayer`
    /// ajuste le média dans les bornes du canvas (`.resizeAspect`), puis pose
    /// sur ce contenu l'échelle et le décalage de l'objet de fond, le tout
    /// rogné par le canvas. `nil` quand il n'y a pas de bande à retirer.
    nonisolated static func visibleImageRect(effects: StoryEffects,
                                             mediaSize: CGSize?,
                                             canvasSize: CGSize) -> CGRect? {
        guard let fond = effects.resolvedBackgroundMedia,
              fond.kind == .image || fond.kind == .video,
              !StoryBackgroundFraming.rendersFilled(effects.backgroundTransform?.videoFitMode),
              fond.crop?.isFull ?? true,
              abs(fond.rotation) < backgroundRotationTolerance,
              fond.scale > 0,
              let mediaSize,
              StoryLetterboxFill.bands(media: mediaSize, canvas: canvasSize) != .none
        else { return nil }
        let ajuste = min(canvasSize.width / mediaSize.width,
                         canvasSize.height / mediaSize.height) * CGFloat(fond.scale)
        let taille = CGSize(width: mediaSize.width * ajuste, height: mediaSize.height * ajuste)
        let centre = CGPoint(x: canvasSize.width * CGFloat(fond.x),
                             y: canvasSize.height * CGFloat(fond.y))
        let pose = CGRect(x: centre.x - taille.width / 2, y: centre.y - taille.height / 2,
                          width: taille.width, height: taille.height)
        let scene = CGRect(origin: .zero, size: canvasSize)
        let visible = pose.intersection(scene)
        guard !visible.isNull, visible.width > 0, visible.height > 0 else { return nil }
        let couvreLaScene = visible.insetBy(dx: -overflowTolerance, dy: -overflowTolerance)
            .contains(scene)
        return couvreLaScene ? nil : visible
    }

    /// Une animation par images clés DÉPLACE l'objet : sa pose de départ ne dit
    /// rien de là où il passera.
    nonisolated static func isAnimated(_ objet: MeeshySceneObject) -> Bool {
        switch objet {
        case .text(let o):  return !(o.keyframes ?? []).isEmpty
        case .media(let o): return !(o.keyframes ?? []).isEmpty
        case .audio(let o): return !(o.keyframes ?? []).isEmpty
        case .sticker, .place: return false
        }
    }
}

private extension StoryImageOnlyPresentation.DrawingExtent {
    func staysInside(_ enveloppe: CGRect) -> Bool {
        switch self {
        case .none:              return true
        case .bounds(let rect):  return enveloppe.contains(rect)
        case .unmeasurable:      return false
        }
    }
}
