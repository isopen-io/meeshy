import SwiftUI

/// **La matrice d'un code (K31)**, dessinée : modules arrondis, trois yeux à la
/// teinte, un seul tracé pour tous les modules. L'encodeur est l'UNIQUE du dépôt
/// (`GameQRCode`, ISO 18004, correction M) : le carré est le même sur les trois
/// plateformes, module pour module.
///
/// Le texte entre, il n'est ni lu, ni journalisé, ni mis dans un nom accessible :
/// l'image est nommée par `label`. La matrice ne se reflète jamais en arabe.
public struct MeeshyCodeMatrix: View {
    private let payload: String?
    private let label: String
    private let tint: Color?
    private let side: Double
    private let ink: MeeshyKitRGB

    public init(payload: String?,
                label: String,
                tint: Color? = nil,
                side: Double = MeeshyCodeCardSize.large.side,
                ink: Color? = nil) {
        self.payload = payload
        self.label = label
        self.tint = tint
        self.side = side
        self.ink = ink.map { MeeshyKitRGB(color: $0) } ?? MeeshyCodeCardRecipe.inkColor(style: .glass)
    }

    /// La matrice d'un texte ; un texte vide ne rend rien. Mise en cache par texte.
    public static func modules(for payload: String) -> GameQRMatrix? {
        guard !payload.isEmpty else { return nil }
        return MeeshyCodeModulesCache.matrix(for: payload)
    }

    public var body: some View {
        let matrix = payload.flatMap { Self.modules(for: $0) }
        let eyeColor = MeeshyCodeCardRecipe.servedTint(tint.map { MeeshyKitRGB(color: $0) } ?? ink, style: .glass)
        return ZStack {
            if let matrix {
                MeeshyCodeMatrixCanvas(matrix: matrix, ink: ink.color, eye: eyeColor.color)
                    .frame(width: CGFloat(side), height: CGFloat(side))
            }
        }
        .frame(width: CGFloat(side), height: CGFloat(side))
        .environment(\.layoutDirection, .leftToRight)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityAddTraits(.isImage)
    }
}

/// Le dessin : un `Path` pour les modules, trois repères pour les yeux.
struct MeeshyCodeMatrixCanvas: View {
    let matrix: GameQRMatrix
    let ink: Color
    let eye: Color

    var body: some View {
        Canvas { context, size in
            let count = matrix.size
            guard count > 0 else { return }
            let cell = size.width / CGFloat(count)
            let eyes = MeeshyCodeMatrixCanvas.eyeOrigins(count: count)
            var modulesPath = Path()
            let inset = cell * CGFloat((1 - MeeshyCodeCardRecipe.moduleShare) / 2)
            let corner = cell * CGFloat(MeeshyCodeCardRecipe.moduleCornerShare)
            for row in 0..<count {
                for column in 0..<count where matrix.modules[row][column]
                    && !MeeshyCodeMatrixCanvas.isInsideEye(column: column, row: row, origins: eyes) {
                    let rect = CGRect(x: CGFloat(column) * cell + inset, y: CGFloat(row) * cell + inset,
                                      width: cell - inset * 2, height: cell - inset * 2)
                    modulesPath.addRoundedRect(in: rect, cornerSize: CGSize(width: corner, height: corner))
                }
            }
            context.fill(modulesPath, with: .color(ink))
            for origin in eyes {
                drawEye(context: context, origin: origin, cell: cell)
            }
        }
    }

    private func drawEye(context: GraphicsContext, origin: (column: Int, row: Int), cell: CGFloat) {
        let span = CGFloat(MeeshyCodeCardRecipe.eyeModules)
        let x = CGFloat(origin.column) * cell
        let y = CGFloat(origin.row) * cell
        var ring = Path()
        ring.addRoundedRect(in: CGRect(x: x, y: y, width: span * cell, height: span * cell),
                            cornerSize: CGSize(width: cell * 2.3, height: cell * 2.3))
        ring.addRoundedRect(in: CGRect(x: x + cell, y: y + cell, width: (span - 2) * cell, height: (span - 2) * cell),
                            cornerSize: CGSize(width: cell * 1.3, height: cell * 1.3))
        context.fill(ring, with: .color(eye), style: FillStyle(eoFill: true))
        var pupil = Path()
        pupil.addRoundedRect(in: CGRect(x: x + cell * 2, y: y + cell * 2, width: cell * 3, height: cell * 3),
                             cornerSize: CGSize(width: cell * 0.8, height: cell * 0.8))
        context.fill(pupil, with: .color(ink))
    }

    static func eyeOrigins(count: Int) -> [(column: Int, row: Int)] {
        let span = MeeshyCodeCardRecipe.eyeModules
        return [(0, 0), (count - span, 0), (0, count - span)]
    }

    static func isInsideEye(column: Int, row: Int, origins: [(column: Int, row: Int)]) -> Bool {
        let span = MeeshyCodeCardRecipe.eyeModules
        return origins.contains { column >= $0.column && column < $0.column + span && row >= $0.row && row < $0.row + span }
    }
}

/// Le cache des matrices, borné : le même texte n'est encodé qu'une fois, et rien
/// de plus que huit matrices ne reste en mémoire.
private enum MeeshyCodeModulesCache {
    private final class Box {
        let matrix: GameQRMatrix
        init(_ matrix: GameQRMatrix) { self.matrix = matrix }
    }

    private static let storage: NSCache<NSString, Box> = {
        let cache = NSCache<NSString, Box>()
        cache.countLimit = 8
        return cache
    }()

    static func matrix(for payload: String) -> GameQRMatrix? {
        let key = payload as NSString
        if let hit = storage.object(forKey: key) { return hit.matrix }
        guard let matrix = GameQRCode.encode(payload) else { return nil }
        storage.setObject(Box(matrix), forKey: key)
        return matrix
    }
}
