import SwiftUI

// MARK: - Les valeurs

/// Le remplissage d'une pastille : uni, dégradé, ou disque creux (« Aucun »).
public enum MeeshyColorDotFill: Sendable, Equatable {
    case solid(Color)
    case gradient([Color])
    case hollow
}

/// Une pastille. `id` est l'identifiant stable, choisi par l'hôte ; `name` le
/// nom déjà traduit, optionnel ; `systemImage` un glyphe au centre du disque.
public struct MeeshyColorDot: Identifiable, Sendable, Equatable {
    public let id: String
    public let fill: MeeshyColorDotFill
    public let name: String?
    public let systemImage: String?

    public init(id: String, fill: MeeshyColorDotFill, name: String? = nil, systemImage: String? = nil) {
        self.id = id
        self.fill = fill
        self.name = name
        self.systemImage = systemImage
    }
}

/// Les deux diamètres de K07. La cellule tactile reste 44 pt quel que soit le diamètre.
public nonisolated enum MeeshyColorDotSize: String, Sendable, Equatable, CaseIterable {
    case s28
    case s32

    public var diameter: Double {
        switch self {
        case .s28: return Double(MeeshyControlSize.small)
        case .s32: return Double(MeeshyControlSize.compact)
        }
    }

    public var cell: Double { Double(MeeshyControlSize.tapTarget) }
}

/// `wrap` passe à la ligne ; `row` tient sur une ligne et défile.
public nonisolated enum MeeshyColorDotsLayout: String, Sendable, Equatable, CaseIterable {
    case wrap
    case row
}

/// Le retour haptique du choix : un `light` au site unique, ou aucun.
public nonisolated enum MeeshyColorDotHaptic: String, Sendable, Equatable, CaseIterable {
    case light
    case none
}

/// La géométrie d'un groupe, calculée une fois par largeur, sans mesure par pastille.
public nonisolated struct MeeshyColorDotsRecipe: Sendable, Equatable {
    /// Le contenu désactivé, à 40 % (fiche K07 § 6).
    public static let disabledOpacity: Double = 0.4
    /// Le filet intérieur et le pré-cercle à 25 % et 50 % (fiche K07 § 6).
    public static let hairlineOpacity: Double = 0.25

    /// Le nombre de pastilles par ligne.
    public let rows: [Int]
    /// Vrai quand une ligne `row` déborde et défile.
    public let scrolls: Bool

    public static func resolve(count: Int,
                               available: Double,
                               size: MeeshyColorDotSize,
                               layout: MeeshyColorDotsLayout) -> MeeshyColorDotsRecipe {
        guard count > 0 else { return MeeshyColorDotsRecipe(rows: [], scrolls: false) }
        switch layout {
        case .row:
            return MeeshyColorDotsRecipe(rows: [count], scrolls: Double(count) * size.cell > available)
        case .wrap:
            let perRow = max(1, Int(((available + size.cell - size.diameter) / size.cell).rounded(.down)))
            let full = Array(repeating: perRow, count: count / perRow)
            let rest = count % perRow
            return MeeshyColorDotsRecipe(rows: rest > 0 ? full + [rest] : full, scrolls: false)
        }
    }
}

// MARK: - Le groupe

/// **Un groupe de choix unique : des disques dont un seul est courant, cerclé.**
///
/// Ni palette, ni libellé visible, ni verre : l'hôte passe les pastilles, leur
/// nom et la courante. Toucher une pastille rappelle `onSelect(id)` une fois ;
/// retoucher la courante le rappelle aussi, l'hôte décide.
public struct MeeshyColorDots<Trailing: View>: View {
    private let dots: [MeeshyColorDot]
    private let selection: String?
    private let label: String
    private let size: MeeshyColorDotSize
    private let layout: MeeshyColorDotsLayout
    private let tone: MeeshyGlassTone?
    private let haptic: MeeshyColorDotHaptic
    private let onSelect: (String) -> Void
    private let trailing: Trailing

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var width: Double = 0

    public init(_ dots: [MeeshyColorDot],
                selection: String? = nil,
                label: String,
                size: MeeshyColorDotSize = .s28,
                layout: MeeshyColorDotsLayout = .wrap,
                tone: MeeshyGlassTone? = nil,
                haptic: MeeshyColorDotHaptic = .light,
                onSelect: @escaping (String) -> Void,
                @ViewBuilder trailing: () -> Trailing) {
        self.dots = dots
        self.selection = selection
        self.label = label
        self.size = size
        self.layout = layout
        self.tone = tone
        self.haptic = haptic
        self.onSelect = onSelect
        self.trailing = trailing()
    }

    public var body: some View {
        let recipe = MeeshyColorDotsRecipe.resolve(count: dots.count, available: width, size: size, layout: layout)
        let ink = Self.inkColor(tone: tone, colorScheme: colorScheme)
        VStack(alignment: .leading, spacing: 0) {
            switch layout {
            case .wrap: wrapped(recipe: recipe, ink: ink)
            case .row: scrolled(ink: ink)
            }
            trailing
        }
        .background(GeometryReader { proxy in
            Color.clear.preference(key: MeeshyColorDotsWidthKey.self, value: Double(proxy.size.width))
        })
        .onPreferenceChange(MeeshyColorDotsWidthKey.self) { width = $0 }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
    }

    @ViewBuilder
    private func wrapped(recipe: MeeshyColorDotsRecipe, ink: Color) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(Self.chunks(of: dots, sizes: recipe.rows).enumerated()), id: \.offset) { _, row in
                HStack(spacing: 0) { cells(row, ink: ink) }
            }
        }
    }

    private func scrolled(ink: Color) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) { cells(dots, ink: ink) }
        }
    }

    private func cells(_ items: [MeeshyColorDot], ink: Color) -> some View {
        ForEach(items) { dot in
            MeeshyColorDotCell(
                dot: dot,
                position: Self.positionLabel(of: dot, in: dots),
                isSelected: dot.id == selection,
                size: size,
                ink: ink,
                reduceMotion: reduceMotion,
                onTap: {
                    if haptic == .light { HapticFeedback.light() }
                    onSelect(dot.id)
                }
            )
            .equatable()
            .disabled(!isEnabled)
        }
    }

    static func chunks(of items: [MeeshyColorDot], sizes: [Int]) -> [[MeeshyColorDot]] {
        let starts = sizes.reduce(into: [0]) { $0.append($0.last! + $1) }
        return zip(starts, sizes).map { start, length in Array(items[start..<start + length]) }
    }

    static func positionLabel(of dot: MeeshyColorDot, in dots: [MeeshyColorDot]) -> String {
        if let name = dot.name { return name }
        let index = (dots.firstIndex(where: { $0.id == dot.id }) ?? 0) + 1
        return "Couleur \(index) sur \(dots.count)"
    }

    static func inkColor(tone: MeeshyGlassTone?, colorScheme: ColorScheme) -> Color {
        switch tone {
        case .onLight: return MeeshyColors.indigo950
        case .theme where colorScheme != .dark: return MeeshyColors.indigo950
        default: return MeeshyColors.onMedia
        }
    }
}

extension MeeshyColorDots where Trailing == EmptyView {
    public init(_ dots: [MeeshyColorDot],
                selection: String? = nil,
                label: String,
                size: MeeshyColorDotSize = .s28,
                layout: MeeshyColorDotsLayout = .wrap,
                tone: MeeshyGlassTone? = nil,
                haptic: MeeshyColorDotHaptic = .light,
                onSelect: @escaping (String) -> Void) {
        self.init(dots, selection: selection, label: label, size: size, layout: layout,
                  tone: tone, haptic: haptic, onSelect: onSelect, trailing: { EmptyView() })
    }
}

private struct MeeshyColorDotsWidthKey: PreferenceKey {
    static let defaultValue: Double = 0
    static func reduce(value: inout Double, nextValue: () -> Double) { value = nextValue() }
}

// MARK: - La pastille

/// Une cellule de 44 pt. Équatable : elle ne se re-rend que si son état change.
struct MeeshyColorDotCell: View, Equatable {
    let dot: MeeshyColorDot
    let position: String
    let isSelected: Bool
    let size: MeeshyColorDotSize
    let ink: Color
    let reduceMotion: Bool
    let onTap: () -> Void

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.dot == rhs.dot && lhs.position == rhs.position && lhs.isSelected == rhs.isSelected
            && lhs.size == rhs.size && lhs.reduceMotion == rhs.reduceMotion
    }

    var body: some View {
        Button(action: onTap) {
            EmptyView()
        }
        .buttonStyle(MeeshyColorDotButtonStyle(dot: dot, size: size, isSelected: isSelected, ink: ink, reduceMotion: reduceMotion))
        .accessibilityLabel(dot.name ?? position)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }
}

struct MeeshyColorDotButtonStyle: ButtonStyle {
    let dot: MeeshyColorDot
    let size: MeeshyColorDotSize
    let isSelected: Bool
    let ink: Color
    let reduceMotion: Bool

    func makeBody(configuration: Configuration) -> some View {
        MeeshyColorDotDisc(dot: dot, size: size, isSelected: isSelected, isPressed: configuration.isPressed,
                           ink: ink, reduceMotion: reduceMotion)
    }
}

/// Le disque seul : fond, filet intérieur, glyphe et cercle de courante.
struct MeeshyColorDotDisc: View {
    let dot: MeeshyColorDot
    let size: MeeshyColorDotSize
    let isSelected: Bool
    let isPressed: Bool
    let ink: Color
    let reduceMotion: Bool
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        let diameter = size.diameter
        ZStack {
            fill(diameter: diameter)
            if let image = dot.systemImage {
                Image(systemName: image)
                    .font(.system(size: diameter * 0.45, weight: .semibold))
                    .foregroundStyle(ink)
            }
            Circle()
                .strokeBorder(MeeshyColors.onMedia.opacity(MeeshyColorDotsRecipe.hairlineOpacity), lineWidth: MeeshyBorder.regular)
                .frame(width: diameter, height: diameter)
            Circle()
                .strokeBorder(ink, lineWidth: MeeshyBorder.strong)
                .frame(width: diameter + 8, height: diameter + 8)
                .scaleEffect(isSelected ? 1 : 0.8)
                .opacity(isSelected ? 1 : (isPressed ? MeeshyOpacity.strong : 0))
                .animation(reduceMotion ? nil : MeeshyAnimation.springFast, value: isSelected)
        }
        .frame(width: size.cell, height: size.cell)
        .contentShape(Rectangle())
        .opacity(isEnabled ? 1 : MeeshyColorDotsRecipe.disabledOpacity)
    }

    @ViewBuilder
    private func fill(diameter: Double) -> some View {
        switch dot.fill {
        case .solid(let color):
            Circle().fill(color).frame(width: diameter, height: diameter)
        case .gradient(let colors):
            Circle()
                .fill(LinearGradient(colors: colors, startPoint: .leading, endPoint: .trailing))
                .frame(width: diameter, height: diameter)
        case .hollow:
            Circle()
                .strokeBorder(MeeshyColors.onMedia.opacity(MeeshyColorDotsRecipe.hairlineOpacity), lineWidth: MeeshyBorder.strong)
                .frame(width: diameter, height: diameter)
        }
    }
}
