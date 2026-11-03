import SwiftUI

/// **Ce qu'un rail qui défile cache encore, de chaque côté** (#14622).
///
/// Le contenu se lit dans l'espace de son viewport : ce qui dépasse en haut a
/// été défilé, ce qui dépasse en bas reste à défiler. Un demi-point d'arrondi
/// n'est pas un débord.
nonisolated struct ComposerScrollEdges: Equatable, Sendable {
    var top: Bool
    var bottom: Bool

    static let none = ComposerScrollEdges(top: false, bottom: false)
    static let tolerance: CGFloat = 0.5

    static func of(content: CGRect, viewport: CGFloat) -> ComposerScrollEdges {
        ComposerScrollEdges(top: content.minY < -tolerance, bottom: content.maxY > viewport + tolerance)
    }
}

/// **Un rail qui déborde le montre** (#14622) : le bord derrière lequel des
/// entrées attendent s'efface en fondu, et le fondu se retire dès que ce bord
/// est atteint. Le fondu est un masque, il ne prend aucun toucher : une entrée
/// à demi effacée reste une cible entière.
struct ComposerScrollEdgeCue: ViewModifier {
    static let fade: CGFloat = 28

    @State private var contentFrame: CGRect = .zero
    @State private var viewportFrame: CGRect = .zero

    /// Le contenu et le viewport se mesurent dans le même espace, l'écran : le
    /// premier se lit alors depuis le haut du second.
    private var edges: ComposerScrollEdges {
        guard viewportFrame.height > 0 else { return .none }
        return .of(content: contentFrame.offsetBy(dx: 0, dy: -viewportFrame.minY), viewport: viewportFrame.height)
    }

    func body(content: Content) -> some View {
        ScrollView(.vertical, showsIndicators: false) {
            content.onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { contentFrame = $0 }
        }
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { viewportFrame = $0 }
        .mask { ComposerScrollEdgeMask(edges: edges, fade: Self.fade) }
    }
}

/// Le masque du fondu : opaque au milieu, transparent sur `fade` points du bord
/// qui cache encore quelque chose.
struct ComposerScrollEdgeMask: View {
    let edges: ComposerScrollEdges
    let fade: CGFloat

    var body: some View {
        VStack(spacing: 0) {
            ramp(from: .clear, to: .black).frame(height: edges.top ? fade : 0)
            Color.black
            ramp(from: .black, to: .clear).frame(height: edges.bottom ? fade : 0)
        }
        .allowsHitTesting(false)
    }

    private func ramp(from: Color, to: Color) -> LinearGradient {
        LinearGradient(colors: [from, to], startPoint: .top, endPoint: .bottom)
    }
}
