import QuartzCore
import SwiftUI

/// Le cadre sous lequel la carte de story se montre : apparition, glissé de
/// fermeture, glissé de groupe. Fonction pure des valeurs d'animation que le
/// lecteur écrit ; elle ne possède aucun état.
struct StoryViewerCardTransform {
    let isDismissing: Bool
    let appear: StoryViewerAppearance
    let dragOffset: CGFloat
    let groupSlide: CGFloat
    let horizontalDrag: CGFloat
    let screenWidth: CGFloat
    let screenHeight: CGFloat

    // Drag dismiss progress 0–1
    var dragProgress: CGFloat {
        min(max(dragOffset / 350, 0), 1)
    }

    // Combined horizontal offset (programmatic slide + interactive drag)
    /// 1:1 avec le doigt (Lot 3 — l'ancien amorti ×0.5 rendait le cube
    /// inter-groupes « lourd » : un commit exigeait 2× la largeur de course).
    /// La résistance aux bords est déjà dans `horizontalDrag`
    /// (`StoryGroupSwipeDecision.displayedTranslation`).
    var totalSlideX: CGFloat {
        groupSlide + horizontalDrag
    }

    // Depth effect from horizontal movement (slight scale + rotation)
    var slideProgress: CGFloat {
        min(abs(totalSlideX) / screenWidth, 1.0)
    }

    var scale: CGFloat {
        if isDismissing { return 0.12 }
        return appear.scale * (1.0 - dragProgress * 0.35)
    }

    var cornerRadius: CGFloat {
        if isDismissing { return 32 }
        return max(appear.cornerRadius, dragProgress * 36)
    }

    var opacity: Double {
        if isDismissing { return 0 }
        return 1.0 - Double(dragProgress) * 0.3
    }

    var offsetY: CGFloat {
        // La sortie CONTINUE le geste : le doigt allait vers le bas, la carte
        // s'en va vers le bas. Elle partait vers le HAUT, ce qui cassait la
        // continuité du swipe de fermeture (directive user 2026-07-25).
        if isDismissing { return screenHeight * 0.35 }
        // Suivi 1:1 du doigt. L'amorti à 0,5 rendait le retour en arrière
        // infidèle : la carte ne revenait pas sous le doigt, et l'annulation
        // du geste ne se « sentait » pas.
        return dragOffset
    }
}

struct StoryViewerAppearance: Equatable { var scale: CGFloat = 0.92; var cornerRadius: CGFloat = 24 }

/// Le cube qui tourne d'un groupe d'auteur à l'autre (#11192).
///
/// Chaque face reçoit une transformation COMPLÈTE, calculée dans le même repère
/// que sa voisine — les deux faces ont le même cadre de mise en page, l'écran.
/// Ce qui l'impose : `.offset(x:)` suivi de `.rotation3DEffect(anchor:)` faisait
/// pivoter chaque face autour du bord de l'ÉCRAN, l'ancre d'un effet se
/// calculant sur le cadre que `.offset` ne déplace pas. À mi-course les deux
/// faces se chevauchaient sur 30 % de la largeur.
///
/// La géométrie est celle d'un vrai cube de côté `largeur`, centré derrière
/// l'écran : la face à l'angle `θ` y est tournée autour de l'axe vertical du
/// cube, et le cube entier recule exactement de ce dont son arête la plus
/// proche avancerait — l'arête commune reste dans le plan de l'écran, jamais
/// plus haute que lui.
enum StoryGroupCube {
    /// 90° pile donnait une projection SINGULIÈRE (`m11 = cos 90° = 0`,
    /// « ignoring singular matrix ») juste avant le plantage du passage d'un
    /// auteur à l'autre (#10803). À 89,5° la face est déjà de profil.
    static let edgeDegrees = 89.5
    static let cameraDistanceInWidths: CGFloat = 2.2
    static let maximumShade = 0.45
    /// Le commit atteint l'identité AVANT le swap de contenu : la face entrante
    /// est à plat quand la vraie carte la remplace, et le swap est invisible.
    static let commitDuration: TimeInterval = 0.34
    static let swapDelay: TimeInterval = 0.38
    static let commitAnimation = Animation.timingCurve(0.25, 0.8, 0.35, 1, duration: commitDuration)
    /// Amorti critique : un ressort qui dépasse 0 au retour montrerait la face
    /// du côté OPPOSÉ au geste qu'on vient d'annuler.
    static let settleAnimation = Animation.spring(response: 0.3, dampingFraction: 1)

    static func faceDegrees(offsetX: CGFloat, width: CGFloat) -> Double {
        let degrees = Double(offsetX / max(width, 1)) * 90.0
        return min(max(degrees, -edgeDegrees), edgeDegrees)
    }

    /// Une face du cube telle que le lecteur la monte.
    ///
    /// `isFacingViewer` : SwiftUI n'élimine pas les faces vues de DOS. Au tout
    /// début d'un glissé, la face entrante est encore tournée vers l'extérieur
    /// du cube ; dessinée quand même, elle recouvrait en miroir le bord de la
    /// story en cours. Une face de dos se masque, et sa transformation est
    /// remplacée par une transformation INVERSIBLE (#10803) : à l'instant où
    /// elle passe de profil, la vraie projection est dégénérée.
    struct Face {
        let transform: CATransform3D
        let isFacingViewer: Bool
        /// Une face qui se détourne de la lumière s'assombrit : c'est ce qui
        /// fait lire un VOLUME là où il n'y aurait que deux plans inclinés.
        let shade: Double
    }

    /// `offsetX` : position de la face en points écran — `0` au repos, `±largeur`
    /// pour la face voisine qui attend de l'autre côté de l'arête.
    static func face(offsetX: CGFloat, size: CGSize) -> Face {
        let degrees = faceDegrees(offsetX: offsetX, width: size.width)
        let transform = cubeTransform(degrees: degrees, size: size)
        let left = project(CGPoint(x: 0, y: size.height / 2), through: transform)
        let right = project(CGPoint(x: size.width, y: size.height / 2), through: transform)
        let isFacingViewer = right.x > left.x
        return Face(
            transform: isFacingViewer ? transform : CATransform3DMakeScale(0.001, 0.001, 1),
            isFacingViewer: isFacingViewer,
            shade: maximumShade * abs(sin(degrees * .pi / 180))
        )
    }

    /// Un point du plan de la face (z = 0) vu à travers sa transformation.
    static func project(_ point: CGPoint, through transform: CATransform3D) -> CGPoint {
        let w = point.x * transform.m14 + point.y * transform.m24 + transform.m44
        return CGPoint(
            x: (point.x * transform.m11 + point.y * transform.m21 + transform.m41) / w,
            y: (point.x * transform.m12 + point.y * transform.m22 + transform.m42) / w
        )
    }

    private static func cubeTransform(degrees: Double, size: CGSize) -> CATransform3D {
        let half = max(size.width, 1) / 2
        let radians = CGFloat(degrees * .pi / 180)
        let sine = sin(radians)
        let cosine = cos(radians)
        let pushBack = half * (abs(cosine) + abs(sine) - 1)
        var perspective = CATransform3DIdentity
        perspective.m34 = -1 / (half * 2 * cameraDistanceInWidths)
        return [
            CATransform3DMakeTranslation(-half, -size.height / 2, half),
            yRotation(sine: sine, cosine: cosine),
            CATransform3DMakeTranslation(0, 0, -half - pushBack),
            perspective,
            CATransform3DMakeTranslation(half, size.height / 2, 0),
        ].reduce(CATransform3DIdentity, CATransform3DConcat)
    }

    private static func yRotation(sine: CGFloat, cosine: CGFloat) -> CATransform3D {
        var rotation = CATransform3DIdentity
        rotation.m11 = cosine
        rotation.m13 = -sine
        rotation.m31 = sine
        rotation.m33 = cosine
        return rotation
    }
}

enum StoryGroupSwipeOutcome: Equatable {
    case next, previous, cancel
}

/// La loi du relâchement d'un glissé de groupe : progressif et annulable
/// jusqu'au bout (directive porteur 2026-08-30). Le doigt qui REPART vers
/// l'origine annule, à n'importe quel point de la course — l'ancien seuil
/// `dx < -60` validait dès 15 % de la largeur, même en revenant en arrière.
enum StoryGroupSwipeDecision {
    static let commitFraction: CGFloat = 0.5
    /// Un tremblement du doigt au relâchement n'est pas un retour en arrière.
    static let reversalTolerance: CGFloat = 0.04
    static let edgeResistanceInWidths: CGFloat = 0.22

    static func decide(translation: CGFloat,
                       predictedEnd: CGFloat,
                       width: CGFloat,
                       hasNext: Bool,
                       hasPrevious: Bool) -> StoryGroupSwipeOutcome {
        let width = max(width, 1)
        let progress = -translation / width
        let projected = -predictedEnd / width
        let direction = progress != 0 ? progress : projected
        guard direction != 0 else { return .cancel }
        let forward = direction > 0
        let reach = forward ? projected : -projected
        let momentum = forward ? projected - progress : progress - projected
        guard reach >= commitFraction, momentum >= -reversalTolerance else { return .cancel }
        if forward { return hasNext ? .next : .cancel }
        return hasPrevious ? .previous : .cancel
    }

    /// Sans groupe dans le sens du geste, la carte résiste comme un défilement
    /// en butée : elle dit qu'il n'y a rien derrière, sans tourner sur du noir.
    static func displayedTranslation(_ translation: CGFloat, width: CGFloat, hasNeighbor: Bool) -> CGFloat {
        guard !hasNeighbor else { return translation }
        let limit = max(width, 1) * edgeResistanceInWidths
        let resisted = (1 - 1 / (abs(translation) / limit * 0.55 + 1)) * limit
        return translation < 0 ? -resisted : resisted
    }
}
