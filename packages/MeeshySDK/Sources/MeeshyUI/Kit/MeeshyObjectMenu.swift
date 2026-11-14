import SwiftUI

// MARK: - Les mots

/// Les mots du kit : le nom de la fermeture, dans les sept langues.
public enum MeeshyObjectMenuCopy {
    public static var dismiss: String {
        String(localized: "kit.object_menu.dismiss", defaultValue: "Fermer le menu", bundle: .module)
    }
}

// MARK: - La taille mesurée

/// La hauteur NATURELLE de la colonne, mesurée après la première pose : l'hôte
/// corrige son estimation sans animation.
struct MeeshyObjectMenuSizeKey: PreferenceKey {
    static let defaultValue: CGSize = .zero

    static func reduce(value: inout CGSize, nextValue: () -> CGSize) {
        let next = nextValue()
        if next != .zero { value = next }
    }
}

// MARK: - Le menu

/// **Le menu d'un objet** (K18) : une colonne de lignes « titre + glyphe » sur un
/// verre dense, la ligne destructive TOUJOURS en dernier et en rouge doux. C'est
/// la face pure : elle ne s'ancre ni ne se ferme, `.meeshyObjectMenu(...)` la pose.
///
/// Atome opaque : l'hôte remet des lignes (valeurs) et reçoit l'`id` choisi. Le
/// verre est celui de K01 (`dense`, non interactif) ; chaque ligne répond au
/// toucher par un voile d'encre, sans échelle. Une liste vide ne dessine rien.
///
/// - `width` : sinon 236, et 320 aux tailles d'accessibilité.
/// - `maxHeight` : la colonne défile dans cette hauteur, le verre ne bouge pas.
/// - `pressedItemID` : fige une ligne pressée (le catalogue).
public struct MeeshyObjectMenu: View, Equatable {
    private let items: [MeeshyObjectMenuItem]
    private let header: String?
    private let tone: MeeshyGlassTone?
    private let pressedItemID: String?
    private let width: CGFloat?
    private let maxHeight: CGFloat?
    private let onSelect: (String) -> Void

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @AccessibilityFocusState private var focusedID: String?

    public init(
        items: [MeeshyObjectMenuItem],
        header: String? = nil,
        tone: MeeshyGlassTone? = nil,
        pressedItemID: String? = nil,
        width: CGFloat? = nil,
        maxHeight: CGFloat? = nil,
        onSelect: @escaping (String) -> Void
    ) {
        self.items = items
        self.header = header
        self.tone = tone
        self.pressedItemID = pressedItemID
        self.width = width
        self.maxHeight = maxHeight
        self.onSelect = onSelect
    }

    public var body: some View {
        let rows = MeeshyObjectMenuOrder.resolve(items)
        let chrome = MeeshyObjectMenuChrome.resolve(rowCount: rows.count, header: header, backdrop: .clear)
        if chrome.showsMenu {
            panel(rows: rows, showsHeader: chrome.showsHeader)
        }
    }

    private var resolvedWidth: CGFloat {
        width ?? MeeshyObjectMenuRecipe.width(isAccessibilitySize: dynamicTypeSize.isAccessibilitySize)
    }

    private func panel(rows: [MeeshyObjectMenuItem], showsHeader: Bool) -> some View {
        let shape = RoundedRectangle(cornerRadius: MeeshyObjectMenuRecipe.radius, style: .continuous)
        return scrolling(column(rows: rows, showsHeader: showsHeader))
            .frame(width: resolvedWidth)
            .clipShape(shape)
            .contentShape(shape)
            .meeshyGlass(in: shape, tone: tone, density: .dense)
    }

    @ViewBuilder
    private func scrolling<Content: View>(_ content: Content) -> some View {
        if let maxHeight {
            ScrollView(.vertical, showsIndicators: false) { content }
                .frame(height: maxHeight)
        } else {
            content
        }
    }

    private func column(rows: [MeeshyObjectMenuItem], showsHeader: Bool) -> some View {
        VStack(spacing: 0) {
            if showsHeader, let header { headerView(header) }
            ForEach(rows) { item in
                MeeshyObjectMenuRow(
                    item: item,
                    isFrozenPressed: item.id == pressedItemID,
                    showsDivider: item.id != rows.first?.id,
                    onSelect: onSelect
                )
                .equatable()
                .accessibilityFocused($focusedID, equals: item.id)
            }
        }
        .background {
            GeometryReader { proxy in
                Color.clear.preference(key: MeeshyObjectMenuSizeKey.self, value: proxy.size)
            }
        }
        .onAppear { focusedID = rows.first?.id }
    }

    private func headerView(_ title: String) -> some View {
        Text(title)
            .font(MeeshyObjectMenuRecipe.headerFont)
            .foregroundStyle(MeeshyColors.onMediaMuted)
            .lineLimit(2)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, MeeshyObjectMenuRecipe.inset)
            .padding(.top, MeeshySpacing.md)
            .padding(.bottom, MeeshySpacing.xs)
            .accessibilityAddTraits(.isHeader)
    }

    public static func == (lhs: MeeshyObjectMenu, rhs: MeeshyObjectMenu) -> Bool {
        lhs.items == rhs.items && lhs.header == rhs.header && lhs.tone == rhs.tone
            && lhs.pressedItemID == rhs.pressedItemID && lhs.width == rhs.width && lhs.maxHeight == rhs.maxHeight
    }
}

// MARK: - Une ligne

/// Une ligne qui se touche : son nom, son indication, et le toucher relâché dans
/// la ligne. Comparable : le rappel n'entre pas dans l'égalité (il est stable
/// pour la vie du menu), donc une ligne pressée ne rend pas ses voisines.
struct MeeshyObjectMenuRow: View, Equatable {
    let item: MeeshyObjectMenuItem
    let isFrozenPressed: Bool
    let showsDivider: Bool
    let onSelect: (String) -> Void

    var body: some View {
        Button(action: { onSelect(item.id) }, label: {
            MeeshyObjectMenuRowFace(item: item, isFrozenPressed: isFrozenPressed)
        })
        .buttonStyle(MeeshyObjectMenuRowStyle())
        .overlay(alignment: .top) {
            if showsDivider { divider }
        }
        .accessibilityLabel(item.title)
        .accessibilityHint(item.hint ?? "")
    }

    private var divider: some View {
        Rectangle()
            .fill(MeeshyColors.onMedia.opacity(MeeshyObjectMenuRecipe.dividerOpacity))
            .frame(height: MeeshyBorder.regular)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }

    static func == (lhs: MeeshyObjectMenuRow, rhs: MeeshyObjectMenuRow) -> Bool {
        lhs.item == rhs.item && lhs.isFrozenPressed == rhs.isFrozenPressed && lhs.showsDivider == rhs.showsDivider
    }
}

/// Pose l'appui dans l'environnement du libellé : la face le lit, rien d'autre
/// ne se rend.
private struct MeeshyObjectMenuRowStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.environment(\.meeshyGlassIsPressed, configuration.isPressed)
    }
}

/// Ce qu'on voit d'une ligne : le titre au bord de début, le glyphe au bord de
/// fin (propriétés logiques, donc le RTL retourne la ligne), et le voile d'encre
/// qui répond à l'appui (22 %), au survol et au focus (12 %).
private struct MeeshyObjectMenuRowFace: View {
    let item: MeeshyObjectMenuItem
    let isFrozenPressed: Bool

    @Environment(\.meeshyGlassIsPressed) private var styledPressed
    @Environment(\.isFocused) private var isFocused
    @State private var isHovered = false

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            Text(item.title)
                .font(MeeshyObjectMenuRecipe.titleFont)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let systemImage = item.systemImage {
                Image(systemName: systemImage)
                    .font(MeeshyObjectMenuRecipe.glyphFont)
                    .frame(width: MeeshyObjectMenuRecipe.glyphSize)
                    .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, MeeshyObjectMenuRecipe.inset)
        .frame(minHeight: MeeshyObjectMenuRecipe.rowHeight)
        .foregroundStyle(item.role == .destructive ? MeeshyColors.errorSoft : MeeshyColors.onMedia)
        .background { MeeshyColors.onMedia.opacity(fillOpacity) }
        .contentShape(Rectangle())
        .onHover { isHovered = $0 }
    }

    private var fillOpacity: Double {
        if isFrozenPressed || styledPressed { return MeeshyGlassButtonRecipe.softPressedOpacity }
        return isHovered || isFocused ? MeeshyGlassButtonRecipe.softRestOpacity : 0
    }
}
