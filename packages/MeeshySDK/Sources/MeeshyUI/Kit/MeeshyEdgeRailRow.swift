import SwiftUI

// MARK: - Le dessin d'une rangée

/// **Ce qu'on VOIT d'une rangée libellée** : le glyphe dans un carré de 44, le
/// mot, et le fond (blanc plein à encre sombre quand elle est allumée, un voile
/// à l'appui). C'est aussi le libellé d'un `Menu` qui s'habille en rangée.
///
/// Atome opaque : ni action, ni nom accessible, ni haptique. Le mot passe à deux
/// lignes aux grandes tailles de texte et la rangée grandit ; le glyphe reste figé.
public struct MeeshyEdgeRailRowFace: View, Equatable {
    private let item: MeeshyEdgeRailItem
    private let width: MeeshyEdgeRailWidth
    private let isPressed: Bool?

    @Environment(\.meeshyGlassIsPressed) private var styledPressed
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var isHovered = false

    public init(item: MeeshyEdgeRailItem, width: MeeshyEdgeRailWidth = .regular, isPressed: Bool? = nil) {
        self.item = item
        self.width = width
        self.isPressed = isPressed
    }

    public var body: some View {
        let pressed = isPressed ?? styledPressed
        return HStack(spacing: MeeshyEdgeRailsRecipe.glyphGap(width)) {
            glyph
            Text(item.displayTitle)
                .font(MeeshyFont.relative(MeeshyEdgeRailsRecipe.wordSize(width), weight: .semibold))
                .lineLimit(lines)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.trailing, MeeshyEdgeRailsRecipe.trailingInset)
        .frame(minHeight: MeeshyEdgeRailsRecipe.rowHeight)
        .foregroundStyle(ink)
        .background {
            shape.fill(MeeshyColors.onMedia.opacity(fillOpacity(pressed: pressed)))
                .meeshyAnimation(.easeInOut(duration: MeeshyEdgeRailsRecipe.rowTintSeconds), value: item.isLit)
        }
        .contentShape(shape)
        .onHover { isHovered = $0 }
        .opacity(opacity)
    }

    private var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: MeeshyEdgeRailsRecipe.rowRadius, style: .continuous)
    }

    private var lines: Int {
        dynamicTypeSize.isAccessibilitySize ? 2 : MeeshyEdgeRailsRecipe.wordLines(width)
    }

    @ViewBuilder
    private var glyph: some View {
        Group {
            switch item.glyph {
            case .system(let name): Image(systemName: name)
            case .text(let text): Text(text)
            }
        }
        .font(.system(size: MeeshyEdgeRailsRecipe.glyphSize, weight: .semibold))
        .frame(width: MeeshyEdgeRailsRecipe.glyphSide, height: MeeshyEdgeRailsRecipe.glyphSide)
        .accessibilityHidden(true)
    }

    private var ink: Color {
        if item.isLit { return MeeshyColors.indigo950 }
        return item.role == .destructive ? MeeshyColors.errorSoft : MeeshyColors.onMedia
    }

    private func fillOpacity(pressed: Bool) -> Double {
        if item.isLit {
            return pressed ? MeeshyGlassButtonRecipe.pressedActiveFillOpacity : MeeshyGlassButtonRecipe.restFillOpacity
        }
        if pressed { return MeeshyGlassButtonRecipe.softPressedOpacity }
        return isHovered ? MeeshyGlassButtonRecipe.softRestOpacity : 0
    }

    private var opacity: Double {
        if !item.isEnabled { return MeeshyEdgeRailsRecipe.disabledOpacity }
        return item.isDimmed ? MeeshyEdgeRailsRecipe.itemDimmedOpacity : 1
    }

    public static func == (lhs: MeeshyEdgeRailRowFace, rhs: MeeshyEdgeRailRowFace) -> Bool {
        lhs.item == rhs.item && lhs.width == rhs.width && lhs.isPressed == rhs.isPressed
    }
}

// MARK: - La rangée

/// Une rangée libellée qui se touche : sa face, son nom accessible, son appui
/// long (0,5 s, seulement avec `longPressLabel`, le toucher qui le suit est
/// avalé) et les impacts du site unique.
struct MeeshyEdgeRailLabeledRow: View, Equatable {
    let item: MeeshyEdgeRailItem
    let width: MeeshyEdgeRailWidth
    let onAction: (String) -> Void
    let onLongPress: ((String) -> Void)?

    @State private var longPressFired = false

    static func == (lhs: MeeshyEdgeRailLabeledRow, rhs: MeeshyEdgeRailLabeledRow) -> Bool {
        lhs.item == rhs.item && lhs.width == rhs.width
    }

    var body: some View {
        Button(action: { activate() }, label: { MeeshyEdgeRailRowFace(item: item, width: width) })
            .buttonStyle(MeeshyEdgeRailRowStyle(longPressFired: $longPressFired))
            .modifier(MeeshyEdgeRailLongPress(isOn: hasLongPress, perform: { fireLongPress() }))
            .accessibilityLabel(item.accessibilityName)
            .accessibilityValue(item.accessibilityValue ?? "")
            .accessibilityHint(item.hint ?? "")
            .accessibilityAddTraits(selectedTraits)
            .modifier(MeeshyEdgeRailNamedLongPress(name: item.longPressLabel, perform: namedAction))
    }

    private var selectedTraits: AccessibilityTraits {
        var traits: AccessibilityTraits = []
        if item.isLit { traits.insert(.isSelected) }
        return traits
    }

    private var namedAction: (() -> Void)? {
        guard hasLongPress else { return nil }
        return { namedLongPress() }
    }

    private var hasLongPress: Bool {
        item.longPressLabel != nil && onLongPress != nil
    }

    private func activate() {
        guard !longPressFired else {
            longPressFired = false
            return
        }
        MeeshyEdgeRailsTrigger.tap(isEnabled: item.isEnabled, action: { onAction(item.id) })
    }

    private func fireLongPress() {
        guard let onLongPress, item.isEnabled else { return }
        longPressFired = true
        MeeshyEdgeRailsTrigger.longPress(isEnabled: item.isEnabled, action: { onLongPress(item.id) })
    }

    private func namedLongPress() {
        guard let onLongPress else { return }
        MeeshyEdgeRailsTrigger.longPress(isEnabled: item.isEnabled, action: { onLongPress(item.id) })
    }
}

/// Pose l'appui dans l'environnement du libellé (la face le lit) et rend à
/// l'appui long son drapeau quand un nouvel appui commence.
private struct MeeshyEdgeRailRowStyle: ButtonStyle {
    let longPressFired: Binding<Bool>

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .environment(\.meeshyGlassIsPressed, configuration.isPressed)
            .adaptiveOnChange(of: configuration.isPressed) { _, pressed in
                if pressed, longPressFired.wrappedValue { longPressFired.wrappedValue = false }
            }
    }
}

private struct MeeshyEdgeRailLongPress: ViewModifier {
    let isOn: Bool
    let perform: () -> Void

    @ViewBuilder
    func body(content: Content) -> some View {
        if isOn {
            content.simultaneousGesture(
                LongPressGesture(
                    minimumDuration: MeeshyEdgeRailsRecipe.longPressSeconds,
                    maximumDistance: MeeshyEdgeRailsRecipe.longPressMaxMovement
                ).onEnded { _ in perform() }
            )
        } else {
            content
        }
    }
}

private struct MeeshyEdgeRailNamedLongPress: ViewModifier {
    let name: String?
    let perform: (() -> Void)?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let name, let perform {
            content.accessibilityAction(named: Text(name), perform)
        } else {
            content
        }
    }
}
