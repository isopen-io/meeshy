import SwiftUI

private struct MeeshyModePlateWindowHeightKey: EnvironmentKey {
    static let defaultValue: CGFloat? = nil
}

extension EnvironmentValues {
    var meeshyModePlateWindowHeight: CGFloat? {
        get { self[MeeshyModePlateWindowHeightKey.self] }
        set { self[MeeshyModePlateWindowHeightKey.self] = newValue }
    }
}

public extension View {
    /// La hauteur de fenêtre sur laquelle la plaque calcule son plafond (42 %). Par défaut, la fenêtre
    /// active ; un hôte qui n'est pas dans une fenêtre (un catalogue, un instantané) la donne.
    func meeshyModePlateWindowHeight(_ height: CGFloat?) -> some View {
        environment(\.meeshyModePlateWindowHeight, height)
    }
}

/// **La plaque basse de verre d'un mode plein écran** (K16) : UNE plaque de verre `dense` de K01 qui porte
/// les réglages de l'outil. Elle épouse la hauteur de son contenu jusqu'à 42 % de la fenêtre (jamais moins
/// de 160), puis défile. Le contenu du mode reste manipulable derrière ; la plaque garde ses propres touchers.
///
/// - Le contenu est un emplacement : un réglage qui glisse ne re-rend pas la plaque. La hauteur se mesure
///   quand elle change, jamais à chaque image ; le plafond, quand la fenêtre change de taille.
/// - `isScrollLocked` : un geste du contenu (un curseur, un glisser) tient la plaque, elle ne défile pas.
/// - Un toucher dans la plaque ne renvoie pas le clavier.
/// - Les boutons posés dedans sont des K02 emboîtés : aucun verre sur du verre.
/// - `contentKey` : quand il change, l'ancien contenu se fond dans le nouveau en 150 ms.
///
/// La plaque ne pose ni marge basse ni largeur : le cadre (`MeeshyModeChrome`) ou l'hôte la place.
public struct MeeshyModePlate<Content: View>: View {
    private let label: String
    private let maxWidth: CGFloat?
    private let isScrollLocked: Bool
    private let presence: MeeshyModeChromePresence
    private let tone: MeeshyGlassTone?
    private let contentKey: AnyHashable?
    private let content: Content

    @State private var contentHeight: CGFloat = 0
    @State private var measuredWindowHeight: CGFloat = 0
    @Environment(\.meeshyModePlateWindowHeight) private var injectedWindowHeight

    public init(
        label: String,
        maxWidth: CGFloat? = nil,
        isScrollLocked: Bool = false,
        presence: MeeshyModeChromePresence = .shown,
        tone: MeeshyGlassTone? = nil,
        contentKey: AnyHashable? = nil,
        @ViewBuilder content: () -> Content
    ) {
        assert(!label.isEmpty, "MeeshyModePlate : le nom du groupe est obligatoire et non vide")
        self.label = label
        self.maxWidth = maxWidth
        self.isScrollLocked = isScrollLocked
        self.presence = presence
        self.tone = tone
        self.contentKey = contentKey
        self.content = content()
    }

    public var body: some View {
        MeeshyModePresence(presence: presence, edge: .bottom) {
            toned(plate)
        }
    }

    private var windowHeight: CGFloat { injectedWindowHeight ?? measuredWindowHeight }

    private var plate: some View {
        scroller
            .scrollDisabled(isScrollLocked)
            .scrollDismissesKeyboard(.never)
            .frame(maxWidth: maxWidth ?? .infinity)
            .frame(height: MeeshyModePlateMetrics.height(content: contentHeight, windowHeight: windowHeight))
            .meeshyGlass(
                in: RoundedRectangle(cornerRadius: MeeshyModeChromeRecipe.plateRadius, style: .continuous),
                density: .dense
            )
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { _ in refreshWindowHeight() }
            .onAppear(perform: refreshWindowHeight)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(label)
    }

    private var scroller: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: MeeshyModeChromeRecipe.plateGap) {
                content
            }
            .id(contentKey)
            .transition(.opacity)
            .animation(.easeInOut(duration: MeeshyModeChromeRecipe.contentFadeDuration), value: contentKey)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, MeeshyModeChromeRecipe.plateHorizontalPadding)
            .padding(.vertical, MeeshyModeChromeRecipe.plateVerticalPadding)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
        }
    }

    @ViewBuilder
    private func toned<V: View>(_ view: V) -> some View {
        if let tone {
            view.meeshyGlassTone(tone)
        } else {
            view
        }
    }

    private func refreshWindowHeight() {
        let height = WindowMetrics.activeWindowFrameInScreen?.height ?? 0
        if height != measuredWindowHeight { measuredWindowHeight = height }
    }
}
