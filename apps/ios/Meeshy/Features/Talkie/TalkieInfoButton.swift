import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le (i) à côté de chaque bouton talkie (#17141, demande du porteur) : il dit à qui le talkie est
/// destiné et quand s'en servir — il réveille l'autre même quand Meeshy est en arrière-plan.
struct TalkieInfoButton: View {
    var tint: Color = MeeshyColors.brandPrimary
    @State private var showing = false

    var body: some View {
        Button {
            showing = true
        } label: {
            Image(systemName: "info.circle")
                .font(.body.weight(.semibold))
                .foregroundStyle(tint)
                .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(TalkieInfoWording.a11y)
        .accessibilityHint(TalkieInfoWording.text)
        .accessibilityIdentifier("talkie.info")
        .popover(isPresented: $showing) {
            TalkieInfoBubble()
        }
    }
}

private struct TalkieInfoBubble: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        bubble.modifier(TalkieInfoCompactPopover())
    }

    private var bubble: some View {
        HStack(alignment: .top, spacing: MeeshySpacing.sm) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(MeeshyColors.brandPrimary)
                .accessibilityHidden(true)
            Text(TalkieInfoWording.text)
                .font(.subheadline)
                .foregroundStyle(MeeshyColors.textPrimary(isDark: colorScheme == .dark))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(MeeshySpacing.lg)
        .frame(maxWidth: 320)
        .accessibilityElement(children: .combine)
    }
}

/// Sur iPhone, la bulle reste une bulle (iOS 16.4+) ; avant, le système la présente en feuille.
private struct TalkieInfoCompactPopover: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 16.4, *) {
            content.presentationCompactAdaptation(.popover)
        } else {
            content.presentationDetents([.medium])
        }
    }
}

enum TalkieInfoWording {
    static var text: String {
        String(
            localized: "talkie.info.text",
            defaultValue: "Disponible pour vos très proches. À utiliser en cas d’extrême urgence : votre voix sort chez eux même si Meeshy est en arrière-plan.",
            bundle: .main
        )
    }

    static var a11y: String {
        String(localized: "talkie.info.a11y", defaultValue: "À propos du talkie d’urgence", bundle: .main)
    }
}
