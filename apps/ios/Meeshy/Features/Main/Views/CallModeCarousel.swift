import SwiftUI
import CoreGraphics
import MeeshyUI

enum CallModeCopy {
    static var quit: String {
        String(localized: "call.mode.quit", defaultValue: "Quitter", bundle: .main)
    }

    static var quitEffectsHint: String {
        String(localized: "call.mode.quit.effects.hint", defaultValue: "Rend votre image telle qu'elle était et revient à l'appel", bundle: .main)
    }

    static var quitMontageHint: String {
        String(localized: "call.mode.quit.montage.hint", defaultValue: "Revient à l'appel", bundle: .main)
    }

    static var carouselHint: String {
        String(localized: "call.mode.carousel.hint", defaultValue: "Balayez vers le haut ou le bas pour choisir", bundle: .main)
    }

    static var effectsTitle: String {
        String(localized: "call.mode.effects.title", defaultValue: "Effets de ma caméra", bundle: .main)
    }

    static var montageTitle: String {
        String(localized: "call.mode.montage.title", defaultValue: "Montage de l'appel", bundle: .main)
    }

    static var validate: String {
        String(localized: "call.mode.effects.validate", defaultValue: "Valider", bundle: .main)
    }

    static var validateHint: String {
        String(localized: "call.mode.effects.validate.hint", defaultValue: "Garde cet effet et revient à l'appel", bundle: .main)
    }

    static var settings: String {
        String(localized: "call.mode.effects.settings", defaultValue: "Réglages", bundle: .main)
    }

    static var settingsHint: String {
        String(localized: "call.mode.effects.settings.hint", defaultValue: "Affiche la luminosité et le flou du fond à la place des effets", bundle: .main)
    }

    static func categoryName(_ category: CallEffectsCategory) -> String {
        switch category {
        case .face: return String(localized: "call.mode.effects.category.face", defaultValue: "Visage", bundle: .main)
        case .color: return String(localized: "call.mode.effects.category.color", defaultValue: "Couleur", bundle: .main)
        }
    }

    static func title(_ mode: CallScreenMode) -> String {
        switch mode {
        case .effects: return effectsTitle
        case .montage: return montageTitle
        }
    }
}

struct CallModeCarousel<Item: Hashable, Cell: View>: View {
    let items: [Item]
    @Binding var selection: Item
    let title: String
    let name: (Item) -> String
    var itemSize = CGSize(width: 60, height: 60)
    var spacing: CGFloat = 14
    @ViewBuilder let cell: (Item, Bool) -> Cell

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 8) {
            Text(name(selection))
                .font(.footnote.weight(.semibold))
                .foregroundColor(.white)
                .lineLimit(1)
                .shadow(color: .black.opacity(0.5), radius: 3)
            GeometryReader { geo in
                track(inset: CallModeCarouselRule.sideInset(containerWidth: geo.size.width, itemWidth: itemSize.width))
            }
            .frame(height: itemSize.height)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title)
        .accessibilityValue(name(selection))
        .accessibilityHint(CallModeCopy.carouselHint)
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: step(1)
            case .decrement: step(-1)
            @unknown default: return
            }
        }
    }

    @ViewBuilder
    private func track(inset: CGFloat) -> some View {
        if #available(iOS 17.0, *) {
            CallModeSnappingTrack(items: items, selection: $selection, itemSize: itemSize, spacing: spacing, inset: inset, reduceMotion: reduceMotion, cell: cell)
        } else {
            CallModeLegacyTrack(items: items, selection: $selection, itemSize: itemSize, spacing: spacing, inset: inset, reduceMotion: reduceMotion, cell: cell)
        }
    }

    private func step(_ offset: Int) {
        let next = CallModeCarouselRule.stepping(selection, in: items, by: offset)
        guard next != selection else { return }
        selection = next
        HapticFeedback.light()
    }
}

@available(iOS 17.0, *)
private struct CallModeSnappingTrack<Item: Hashable, Cell: View>: View {
    let items: [Item]
    @Binding var selection: Item
    let itemSize: CGSize
    let spacing: CGFloat
    let inset: CGFloat
    let reduceMotion: Bool
    let cell: (Item, Bool) -> Cell

    @State private var centred: Item?

    init(items: [Item], selection: Binding<Item>, itemSize: CGSize, spacing: CGFloat, inset: CGFloat, reduceMotion: Bool, cell: @escaping (Item, Bool) -> Cell) {
        self.items = items
        self._selection = selection
        self.itemSize = itemSize
        self.spacing = spacing
        self.inset = inset
        self.reduceMotion = reduceMotion
        self.cell = cell
        self._centred = State(initialValue: selection.wrappedValue)
    }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: spacing) {
                ForEach(items, id: \.self) { item in
                    CallModeCarouselItem(isSelected: item == selection, size: itemSize, reduceMotion: reduceMotion) {
                        cell(item, item == selection)
                    } action: {
                        selection = item
                    }
                    .id(item)
                }
            }
            .scrollTargetLayout()
        }
        .contentMargins(.horizontal, inset, for: .scrollContent)
        .scrollTargetBehavior(.viewAligned)
        .scrollPosition(id: $centred, anchor: .center)
        .adaptiveOnChange(of: centred) { _, newValue in
            guard let newValue, newValue != selection else { return }
            selection = newValue
            HapticFeedback.light()
        }
        .adaptiveOnChange(of: selection) { _, newValue in
            guard centred != newValue else { return }
            withAnimation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.85)) {
                centred = newValue
            }
        }
    }
}

private struct CallModeLegacyTrack<Item: Hashable, Cell: View>: View {
    let items: [Item]
    @Binding var selection: Item
    let itemSize: CGSize
    let spacing: CGFloat
    let inset: CGFloat
    let reduceMotion: Bool
    let cell: (Item, Bool) -> Cell

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: spacing) {
                    ForEach(items, id: \.self) { item in
                        CallModeCarouselItem(isSelected: item == selection, size: itemSize, reduceMotion: reduceMotion) {
                            cell(item, item == selection)
                        } action: {
                            selection = item
                            HapticFeedback.light()
                        }
                        .id(item)
                    }
                }
                .padding(.horizontal, inset)
            }
            .onAppear { proxy.scrollTo(selection, anchor: .center) }
            .adaptiveOnChange(of: selection) { _, newValue in
                withAnimation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.85)) {
                    proxy.scrollTo(newValue, anchor: .center)
                }
            }
        }
    }
}

private struct CallModeCarouselItem<Content: View>: View {
    let isSelected: Bool
    let size: CGSize
    let reduceMotion: Bool
    @ViewBuilder let content: () -> Content
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            content()
                .frame(width: size.width, height: size.height)
                .scaleEffect(CallModeCarouselRule.scale(isSelected: isSelected))
                .opacity(CallModeCarouselRule.opacity(isSelected: isSelected))
                .animation(reduceMotion ? nil : .spring(response: 0.25, dampingFraction: 0.8), value: isSelected)
                .contentShape(Rectangle())
        }
        .buttonStyle(CallPressButtonStyle())
    }
}

struct CallModeGlyph: View {
    let art: CallPillChipArt
    let isSelected: Bool

    var body: some View {
        ZStack {
            Circle()
                .fill(isSelected ? Color.white.opacity(0.95) : Color.black.opacity(0.35))
            artwork
        }
        .overlay(
            Circle().stroke(Color.white.opacity(isSelected ? 1 : 0.35), lineWidth: isSelected ? 3 : 1)
        )
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private var artwork: some View {
        switch art {
        case .symbol(let symbol):
            Image(systemName: symbol)
                .font(MeeshyFont.relative(22, weight: .semibold))
                .foregroundColor(isSelected ? .black : .white)
        case .emoji(let emoji):
            Text(emoji)
                .font(.title)
        case .image(let image):
            Image(decorative: image, scale: 1)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .clipShape(Circle())
        }
    }
}

struct CallModeThumbnail: View {
    let image: CGImage?
    let symbol: String
    let isSelected: Bool

    private static let shape = RoundedRectangle(cornerRadius: 10, style: .continuous)

    var body: some View {
        ZStack {
            Self.shape.fill(Color.white.opacity(0.12))
            if let image {
                Image(decorative: image, scale: 1)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else {
                Image(systemName: symbol)
                    .font(MeeshyFont.relative(20, weight: .semibold))
                    .foregroundColor(.white)
            }
        }
        .clipShape(Self.shape)
        .overlay(Self.shape.stroke(isSelected ? Color.white : Color.white.opacity(0.3), lineWidth: isSelected ? 3 : 1))
        .accessibilityHidden(true)
    }
}

struct CallModeOption: Identifiable {
    let id: String
    let symbol: String
    let label: String
    let caption: String
    var hint: String? = nil
    var isOn: Bool? = nil
    var isEnabled = true
    let action: () -> Void
}

struct CallModeActionBar: View {
    let exitHint: String
    let onExit: () -> Void
    let shutter: CallModeShutter
    let options: [CallModeOption]

    private static let sideDiameter: CGFloat = 44

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            CallPillButton(
                symbol: "xmark",
                kind: .normal,
                label: CallModeCopy.quit,
                caption: CallModeCopy.quit,
                hint: exitHint,
                diameter: Self.sideDiameter,
                action: onExit
            )
            .frame(maxWidth: .infinity)
            shutter
            HStack(spacing: 12) {
                ForEach(options) { option in
                    CallPillButton(
                        symbol: option.symbol,
                        kind: option.isOn == true ? .active : .normal,
                        label: option.label,
                        caption: option.caption,
                        hint: option.hint,
                        toggleState: option.isOn,
                        diameter: Self.sideDiameter,
                        action: option.action
                    )
                    .disabled(!option.isEnabled)
                }
            }
            .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 12)
    }
}

struct CallModeShutter: View {
    static let diameter: CGFloat = 72

    let symbol: String
    let label: String
    let hint: String
    var isBusy = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .stroke(Color.white, lineWidth: 4)
                Circle()
                    .fill(Color.white)
                    .padding(8)
                if isBusy {
                    ProgressView()
                        .tint(.black)
                } else {
                    Image(systemName: symbol)
                        .font(MeeshyFont.relative(24, weight: .bold))
                        .foregroundColor(.black)
                }
            }
            .frame(width: Self.diameter, height: Self.diameter)
            .contentShape(Circle())
        }
        .buttonStyle(CallPressButtonStyle())
        .disabled(isBusy)
        .accessibilityLabel(label)
        .accessibilityHint(hint)
    }
}
