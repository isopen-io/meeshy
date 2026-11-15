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
    static let fade: CGFloat = ScrollEdgeFadeMask.length

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
        .mask { ScrollEdgeFadeMask(axis: .vertical, start: edges.top, end: edges.bottom, fade: Self.fade) }
    }
}

/// Le masque du fondu d'une rangée qui défile, UN pour l'app : opaque au milieu,
/// transparent sur `fade` points à chaque bout de l'axe qui cache encore quelque
/// chose (`start` : le haut ou la gauche, `end` : le bas ou la droite). Les rampes
/// suivent les bords de l'écran, jamais l'ordre de lecture : le masque se pose en
/// gauche à droite, sans quoi la droite à gauche retournerait l'ordre des rampes
/// sans retourner leurs dégradés. Il ne prend aucun toucher.
struct ScrollEdgeFadeMask: View {
    static let length: CGFloat = 28

    let axis: Axis
    let start: Bool
    let end: Bool
    var fade: CGFloat = ScrollEdgeFadeMask.length

    var body: some View {
        let layout = axis == .vertical ? AnyLayout(VStackLayout(spacing: 0)) : AnyLayout(HStackLayout(spacing: 0))
        layout {
            ramp(from: .clear, to: .black)
                .frame(width: extent(fades: start, along: .horizontal), height: extent(fades: start, along: .vertical))
            Color.black
            ramp(from: .black, to: .clear)
                .frame(width: extent(fades: end, along: .horizontal), height: extent(fades: end, along: .vertical))
        }
        .environment(\.layoutDirection, .leftToRight)
        .allowsHitTesting(false)
    }

    private func extent(fades: Bool, along candidate: Axis) -> CGFloat? {
        guard axis == candidate else { return nil }
        return fades ? fade : 0
    }

    private func ramp(from: Color, to: Color) -> LinearGradient {
        LinearGradient(
            colors: [from, to],
            startPoint: axis == .vertical ? .top : .leading,
            endPoint: axis == .vertical ? .bottom : .trailing
        )
    }
}
