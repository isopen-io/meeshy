import SwiftUI

// MARK: - Le carré QR du lien de parrainage (#9554)
//
// « Juste un carré QR code pour pouvoir capturer et y aller. » MIROIR de
// `apps/web/src/lib/game-photo/referral-qr.ts` : UNE matrice, des rectangles en pixels ENTIERS, et
// le même carré sur le web et sur iOS.
//
// Le carré se mesure dans les pixels de l'image exportée : un module fait un nombre ENTIER de
// pixels (un module à cheval sur deux pixels se lit mal), deux au moins, et la matrice est centrée
// dans un carré clair qui lui laisse sa marge de silence. Un lien que la place ne rendrait pas
// lisible ne rend pas de carré ; un emplacement sans lien non plus — jamais le QR d'un lien qui
// n'existe pas.
//
// Les deux couleurs sont fixes : un QR se lit sombre sur clair, quel que soit le thème de celui
// qui le montre.

nonisolated public struct GameReferralQRSquare: Equatable, Sendable {

    /// Une suite horizontale de modules sombres, en pixels du carré.
    nonisolated public struct Run: Equatable, Sendable {
        public let x: Int
        public let y: Int
        public let width: Int
        public let height: Int
    }

    public static let quietModules = 4
    public static let minModulePixels = 2

    /// Le côté du carré clair, marge de silence comprise.
    public let side: Int
    /// Le côté de la matrice, en modules.
    public let size: Int
    /// Le côté d'un module, en pixels entiers.
    public let module: Int
    /// Où commence la matrice dans le carré, sur les deux axes.
    public let origin: Int
    public let runs: [Run]

    /// Le carré du lien, dans une place de `side` pixels ; `nil` sans lien, ou quand la place ne
    /// laisse pas deux pixels par module.
    public static func make(link: String?, side: Int) -> GameReferralQRSquare? {
        guard let link, !link.isEmpty, side > 0 else { return nil }
        let room = side / minModulePixels - quietModules * 2
        guard let matrix = GameQRCode.encode(link, maxVersion: (room - 17) / 4) else { return nil }
        let module = side / (matrix.size + quietModules * 2)
        let origin = (side - matrix.size * module) / 2
        let runs = matrix.modules.enumerated().flatMap { y, row in
            Self.runs(of: row, y: y, module: module, origin: origin)
        }
        return GameReferralQRSquare(side: side, size: matrix.size, module: module, origin: origin, runs: runs)
    }

    private static func runs(of row: [Bool], y: Int, module: Int, origin: Int) -> [Run] {
        row.enumerated().reduce(into: [Run]()) { runs, cell in
            guard cell.element else { return }
            let left = origin + cell.offset * module
            if let last = runs.last, last.x + last.width == left {
                runs[runs.count - 1] = Run(x: last.x, y: last.y, width: last.width + module, height: last.height)
            } else {
                runs.append(Run(x: left, y: origin + y * module, width: module, height: module))
            }
        }
    }

    /// Les modules sombres en UN tracé, dans un repère de `side` × `side`.
    public var path: Path {
        Path { path in
            for run in runs {
                path.addRect(CGRect(x: run.x, y: run.y, width: run.width, height: run.height))
            }
        }
    }
}

/// Le carré peint : un fond clair sur toute sa place (la marge de silence en fait partie), puis les
/// modules sombres. La vue fait `side` points de côté — un point par pixel de l'image exportée.
public struct GameReferralQRView: View {

    private let square: GameReferralQRSquare

    public init(square: GameReferralQRSquare) {
        self.square = square
    }

    public var body: some View {
        let side = CGFloat(square.side)
        square.path
            .fill(Color.black)
            .frame(width: side, height: side)
            .background(Color.white)
            .environment(\.layoutDirection, .leftToRight)
    }
}

// MARK: - La géométrie du bandeau
//
// MIROIR de `bannerOf` (`apps/web/src/lib/game-photo/layout.ts`), dans le repère du bandeau : la
// Signature en début de ligne, la phrase, la Flamme, et le carré QR en FIN de ligne — à droite de
// gauche à droite, à gauche en arabe : le bandeau se retourne en entier. Le carré est posé au pixel
// entier : ses modules le sont aussi.

nonisolated public struct GameReferralBannerMetrics: Equatable, Sendable {

    public let size: CGSize
    public let rightToLeft: Bool
    public let signature: CGRect
    /// La place de la phrase ; elle s'ancre sur son début de ligne.
    public let title: CGRect
    public let titleSize: CGFloat
    public let flame: CGRect
    /// La place des jours de la Flamme, centrés sous elle.
    public let flameLabel: CGRect
    public let flameLabelSize: CGFloat
    public let qr: CGRect

    public init(size: CGSize, rightToLeft: Bool = false, hasFlame: Bool = true) {
        let width = size.width.rounded()
        let height = size.height
        let pad = height * 0.14
        let signatureSide = height * 0.4
        let signature = CGRect(x: pad, y: (height - signatureSide) / 2, width: signatureSide, height: signatureSide)
        let qrSide = (height * 0.84).rounded()
        let qrInset = ((height - qrSide) / 2).rounded()
        let qr = CGRect(x: width - qrInset - qrSide, y: qrInset, width: qrSide, height: qrSide)
        let flameSide = height * 0.36
        let flame = CGRect(x: qr.minX - pad * 0.7 - flameSide, y: height * 0.2, width: flameSide, height: flameSide)
        let textStart = signature.maxX + pad * 0.6
        let textEnd = (hasFlame ? flame.minX : qr.minX - pad * 0.7) - height * 0.06
        let title = CGRect(x: textStart, y: 0, width: max(0, textEnd - textStart), height: height)
        let labelSize = height * 0.13
        let labelWidth = flameSide * 1.3
        let flameLabel = CGRect(x: flame.midX - labelWidth / 2, y: height * 0.8 - labelSize, width: labelWidth, height: labelSize * 1.3)

        func placed(_ rect: CGRect) -> CGRect {
            rightToLeft ? CGRect(x: width - rect.minX - rect.width, y: rect.minY, width: rect.width, height: rect.height) : rect
        }
        self.size = size
        self.rightToLeft = rightToLeft
        self.signature = placed(signature)
        self.title = placed(title)
        self.titleSize = height * 0.18
        self.flame = placed(flame)
        self.flameLabel = placed(flameLabel)
        self.flameLabelSize = labelSize
        self.qr = placed(qr)
    }
}
