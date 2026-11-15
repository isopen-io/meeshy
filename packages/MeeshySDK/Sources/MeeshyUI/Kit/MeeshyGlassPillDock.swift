import SwiftUI

private struct MeeshyGlassPillStowMarginKey: EnvironmentKey {
    static let defaultValue: CGFloat = 0
}

public extension EnvironmentValues {
    /// La distance de la pilule au bas de l'écran, que la pilule ajoute à sa
    /// hauteur pour sortir ENTIÈREMENT en se rangeant.
    var meeshyGlassPillStowMargin: CGFloat {
        get { self[MeeshyGlassPillStowMarginKey.self] }
        set { self[MeeshyGlassPillStowMarginKey.self] = newValue }
    }
}

public extension View {
    /// Pour un hôte qui s'ancre lui-même : la marge basse qu'il laisse à la pilule.
    func meeshyGlassPillStowMargin(_ margin: CGFloat) -> some View {
        environment(\.meeshyGlassPillStowMargin, margin)
    }
}

/// **L'ancrage de la pilule** : en bas, au centre, à `sideMargin` des bords et
/// à `max(zone sûre + bottomGap, minimumBottom)` du bas de l'écran. Il ne suit
/// jamais le clavier (l'hôte range la pilule pendant l'écriture) et il remet sa
/// marge à la pilule pour la sortie. Il ne prend aucun toucher hors de son contenu.
public struct MeeshyGlassPillDock<Content: View>: View {
    private let bottomGap: CGFloat
    private let minimumBottom: CGFloat
    private let sideMargin: CGFloat
    private let content: Content

    @State private var safeBottom: CGFloat = 0

    public init(
        bottomGap: CGFloat = MeeshyGlassPillRecipe.defaultBottomGap,
        minimumBottom: CGFloat = MeeshyGlassPillRecipe.defaultMinimumBottom,
        sideMargin: CGFloat = MeeshyGlassPillRecipe.defaultSideMargin,
        @ViewBuilder content: () -> Content
    ) {
        self.bottomGap = bottomGap
        self.minimumBottom = minimumBottom
        self.sideMargin = sideMargin
        self.content = content()
    }

    public var body: some View {
        let fromScreenBottom = MeeshyGlassPillRecipe.bottomMargin(
            safeBottom: safeBottom, bottomGap: bottomGap, minimumBottom: minimumBottom
        )
        return content
            .environment(\.meeshyGlassPillStowMargin, fromScreenBottom)
            .padding(.horizontal, sideMargin)
            .padding(.bottom, max(fromScreenBottom - safeBottom, 0))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            .onGeometryChange(for: CGFloat.self) { $0.safeAreaInsets.bottom } action: { safeBottom = $0 }
            .ignoresSafeArea(.keyboard, edges: .bottom)
    }
}
