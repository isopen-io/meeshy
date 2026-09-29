import SwiftUI
import CoreGraphics
import MeeshyUI

struct CallPanelHeader: View {
    let title: String
    let onBack: () -> Void
    let onClose: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            headerButton(symbol: "chevron.backward", label: CallControlsCopy.backToMenu, action: onBack)
            Text(title)
                .font(.footnote.weight(.semibold))
                .foregroundColor(.white)
                .lineLimit(1)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
            headerButton(symbol: "xmark", label: CallControlsCopy.closePanel, action: onClose)
        }
        .padding(.horizontal, 6)
        .padding(.top, 2)
    }

    private func headerButton(symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.footnote.weight(.bold))
                .foregroundColor(.white.opacity(0.9))
                .frame(width: 28, height: 28)
                .background(Circle().fill(CallButtonFill.color(for: .normal)))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

struct CallPillRow<Content: View>: View {
    let title: String?
    let content: Content

    init(title: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let title {
                Text(title)
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(.white.opacity(0.6))
                    .textCase(.uppercase)
                    .lineLimit(1)
                    .padding(.horizontal, 16)
                    .accessibilityAddTraits(.isHeader)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 2) {
                    content
                }
                .padding(.horizontal, 8)
                .callRowScrollTargetLayout()
            }
            .callRowScrollTargetBehavior()
            .modifier(CallRowScrollInteraction())
        }
        .padding(.vertical, 8)
        .accessibilityElement(children: .contain)
    }
}

enum CallPillChipArt {
    case symbol(String)
    case emoji(String)
    case image(CGImage)
}

struct CallPillChip: View {
    static let width: CGFloat = 68
    static let artDiameter: CGFloat = 44

    let art: CallPillChipArt
    let caption: String?
    let label: String
    var hint: String? = nil
    var isSelected = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                artwork
                if let caption {
                    Text(caption)
                        .font(.caption2.weight(.medium))
                        .foregroundColor(.white.opacity(isSelected ? 1 : 0.85))
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(width: Self.width)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(CallPressButtonStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .optionalAccessibilityHint(hint)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : [.isButton])
        .accessibilityAction { action() }
    }

    @ViewBuilder
    private var artwork: some View {
        switch art {
        case .symbol(let symbol):
            CallPillGlyph(symbol: symbol, kind: isSelected ? .active : .normal, diameter: Self.artDiameter)
        case .emoji(let emoji):
            Text(emoji)
                .font(.title2)
                .frame(width: Self.artDiameter, height: Self.artDiameter)
                .background(Circle().fill(isSelected ? Color.white.opacity(0.9) : CallButtonFill.color(for: .normal)))
                .accessibilityHidden(true)
        case .image(let image):
            Image(decorative: image, scale: 1)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: 36, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(isSelected ? Color.white : Color.white.opacity(0.2), lineWidth: isSelected ? 2 : 0.5)
                )
                .accessibilityHidden(true)
        }
    }
}

extension View {
    @ViewBuilder
    func callRowScrollTargetLayout() -> some View {
        if #available(iOS 17.0, *) {
            scrollTargetLayout()
        } else {
            self
        }
    }

    /// #8735 — une chiquenaude parcourt la rangée d'un trait : la limite
    /// par défaut (`.automatic`) la bride en largeur compacte — tout iPhone
    /// en portrait — et la rangée « colle ».
    @ViewBuilder
    func callRowScrollTargetBehavior() -> some View {
        if #available(iOS 17.0, *) {
            scrollTargetBehavior(.viewAligned(limitBehavior: .never))
        } else {
            self
        }
    }
}

/// #8735 — une rangée qui défile est un doigt posé sur le chrome : le
/// masquage automatique ne tombe pas pendant le défilement, et repart de
/// zéro quand la rangée s'arrête. La phase de défilement n'existe qu'à
/// partir d'iOS 18 ; avant, les boutons pressés réarment seuls.
private struct CallRowScrollInteraction: ViewModifier {
    @Environment(\.callChromeInteraction) private var reportInteraction
    @State private var isScrolling = false

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content
                .onScrollPhaseChange { _, phase in
                    note(isScrolling: phase.isScrolling)
                }
                .onDisappear { note(isScrolling: false) }
        } else {
            content
        }
    }

    private func note(isScrolling scrolling: Bool) {
        guard let interaction = CallChromeScrollRule.interaction(wasScrolling: isScrolling, isScrolling: scrolling) else { return }
        isScrolling = scrolling
        reportInteraction?(interaction)
    }
}
