import CoreGraphics
import Foundation

/// LA MISE EN PAGE DU CADRE (#9382) — conception, partie VI : emblème en haut,
/// titre et date, Mee et Meo en bas. Une DONNÉE, en pixels de l'image finale :
/// l'aperçu en direct et l'image composée lisent la MÊME table, donc le cadre
/// qu'on voit au moment de déclencher est celui qu'on obtient. Miroir de
/// `apps/web/src/lib/game-photo/layout.ts`.
///
/// Deux formats : 9:16 pour la story, 1:1 pour le profil. Rien n'est écrit en
/// dur par format hors de cette table : une troisième forme s'ajoute ici.
nonisolated enum PhotoFormat: CaseIterable, Sendable {
    case story
    case square

    var size: CGSize {
        switch self {
        case .story: CGSize(width: 1080, height: 1920)
        case .square: CGSize(width: 1080, height: 1080)
        }
    }
}

nonisolated struct PhotoTextLine: Equatable, Sendable {
    let x: CGFloat
    /// La ligne de base du texte.
    let y: CGFloat
    let size: CGFloat
}

nonisolated struct PhotoLayout: Equatable, Sendable {
    let width: CGFloat
    let height: CGFloat
    let emblem: CGRect
    let kicker: PhotoTextLine
    let title: PhotoTextLine
    let date: PhotoTextLine
    let mee: CGRect
    let meo: CGRect
    let signature: CGRect
}

nonisolated enum GamePhotoLayout {

    /// En fraction de la largeur (tailles) ou de la hauteur (positions verticales).
    private struct Proportions {
        let emblemSize: CGFloat
        let emblemTop: CGFloat
        let kickerY: CGFloat
        let titleY: CGFloat
        let dateY: CGFloat
        let birdSize: CGFloat
        let signatureSize: CGFloat
    }

    private static func proportions(_ format: PhotoFormat) -> Proportions {
        switch format {
        case .story:
            Proportions(emblemSize: 0.36, emblemTop: 0.07, kickerY: 0.4, titleY: 0.45, dateY: 0.5, birdSize: 0.26, signatureSize: 0.1)
        case .square:
            Proportions(emblemSize: 0.3, emblemTop: 0.06, kickerY: 0.49, titleY: 0.58, dateY: 0.65, birdSize: 0.22, signatureSize: 0.07)
        }
    }

    private static let margin: CGFloat = 0.05

    static func layout(_ format: PhotoFormat) -> PhotoLayout {
        let width = format.size.width
        let height = format.size.height
        let p = proportions(format)
        let emblem = width * p.emblemSize
        let bird = width * p.birdSize
        let signature = width * p.signatureSize
        let edge = width * margin
        let birdTop = height - edge - bird
        return PhotoLayout(
            width: width,
            height: height,
            emblem: CGRect(x: (width - emblem) / 2, y: height * p.emblemTop, width: emblem, height: emblem),
            kicker: PhotoTextLine(x: width / 2, y: height * p.kickerY, size: width * 0.04),
            title: PhotoTextLine(x: width / 2, y: height * p.titleY, size: width * 0.075),
            date: PhotoTextLine(x: width / 2, y: height * p.dateY, size: width * 0.035),
            mee: CGRect(x: edge, y: birdTop, width: bird, height: bird),
            meo: CGRect(x: width - edge - bird, y: birdTop, width: bird, height: bird),
            signature: CGRect(x: (width - signature) / 2, y: height - edge - signature, width: signature, height: signature)
        )
    }
}
