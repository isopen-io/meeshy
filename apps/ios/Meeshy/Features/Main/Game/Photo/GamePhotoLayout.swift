import CoreGraphics
import Foundation
import MeeshyUI

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
    /// Le bandeau de parrainage (#7742), en bas de l'image ; `nil` sans lien. Quand il est là, il porte
    /// sa propre Signature : celle du bas de la carte n'est pas peinte, et `signature` n'est que la place qu'elle y tient.
    let banner: CGRect?
    /// La place du carré QR du lien (#9554), en FIN de ligne du bandeau, au pixel entier ; `nil` sans bandeau.
    let qr: CGRect?
}

nonisolated enum GamePhotoLayout {

    /// En fraction de la largeur (tailles) ou de la hauteur (positions verticales).
    private nonisolated struct Proportions {
        let emblemSize: CGFloat
        let emblemTop: CGFloat
        let kickerY: CGFloat
        let titleY: CGFloat
        let dateY: CGFloat
        let birdSize: CGFloat
        let signatureSize: CGFloat
        /// La hauteur du bandeau de parrainage, en fraction de la largeur.
        let bannerHeight: CGFloat
    }

    private static func proportions(_ format: PhotoFormat, referral: Bool) -> Proportions {
        switch (format, referral) {
        case (.story, false):
            Proportions(emblemSize: 0.36, emblemTop: 0.07, kickerY: 0.4, titleY: 0.45, dateY: 0.5, birdSize: 0.26, signatureSize: 0.1, bannerHeight: 0)
        case (.square, false):
            Proportions(emblemSize: 0.3, emblemTop: 0.06, kickerY: 0.49, titleY: 0.58, dateY: 0.65, birdSize: 0.22, signatureSize: 0.07, bannerHeight: 0)
        // Le bandeau prend le bas : 20 % de la largeur dans les deux formats, comme sur le web (#9554) — c'est
        // ce qui donne au carré QR ses 181 pixels. Mee et Meo montent au-dessus de lui ; en carré, le texte
        // monte aussi et les tenants rapetissent.
        case (.story, true):
            Proportions(emblemSize: 0.36, emblemTop: 0.07, kickerY: 0.4, titleY: 0.45, dateY: 0.5, birdSize: 0.26, signatureSize: 0.1, bannerHeight: 0.2)
        case (.square, true):
            Proportions(emblemSize: 0.3, emblemTop: 0.06, kickerY: 0.42, titleY: 0.5, dateY: 0.56, birdSize: 0.15, signatureSize: 0.07, bannerHeight: 0.2)
        }
    }

    private static let margin: CGFloat = 0.05

    /// La carte se compose-t-elle de droite à gauche ? La langue dans laquelle l'app s'affiche décide — celle
    /// des phrases de la carte —, pas la région de l'appareil.
    static func readsRightToLeft(languages: [String] = Bundle.main.preferredLocalizations) -> Bool {
        guard let language = languages.first else { return false }
        return Locale.Language(identifier: language).characterDirection == .rightToLeft
    }

    /// `referral` : la carte porte le bandeau de parrainage en bas (#7742). `rightToLeft` : le bandeau se
    /// retourne en entier (#9554), le carré QR passe à gauche ; le reste de la carte ne bouge pas.
    static func layout(_ format: PhotoFormat, referral: Bool = false, rightToLeft: Bool = false) -> PhotoLayout {
        let width = format.size.width
        let height = format.size.height
        let p = proportions(format, referral: referral)
        let emblem = width * p.emblemSize
        let bird = width * p.birdSize
        let signature = width * p.signatureSize
        let edge = width * margin
        let bannerHeight = width * p.bannerHeight
        let banner = referral
            ? CGRect(x: edge, y: height - edge - bannerHeight, width: width - 2 * edge, height: bannerHeight)
            : nil
        let qr = banner.map {
            GameReferralBannerMetrics(size: $0.size, rightToLeft: rightToLeft).qr.offsetBy(dx: $0.minX, dy: $0.minY)
        }
        let birdTop = (banner?.minY ?? height) - (banner == nil ? edge : edge / 2) - bird
        return PhotoLayout(
            width: width,
            height: height,
            emblem: CGRect(x: (width - emblem) / 2, y: height * p.emblemTop, width: emblem, height: emblem),
            kicker: PhotoTextLine(x: width / 2, y: height * p.kickerY, size: width * 0.04),
            title: PhotoTextLine(x: width / 2, y: height * p.titleY, size: width * 0.075),
            date: PhotoTextLine(x: width / 2, y: height * p.dateY, size: width * 0.035),
            mee: CGRect(x: edge, y: birdTop, width: bird, height: bird),
            meo: CGRect(x: width - edge - bird, y: birdTop, width: bird, height: bird),
            signature: CGRect(x: (width - signature) / 2, y: height - edge - signature, width: signature, height: signature),
            banner: banner,
            qr: qr
        )
    }
}
