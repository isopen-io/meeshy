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
        .anchoredPicker(
            isPresented: $showing,
            compactDetents: [.fraction(0.3), .medium],
            popoverSize: CGSize(width: 320, height: 180)
        ) {
            TalkieInfoBubble()
        }
    }
}

private struct TalkieInfoBubble: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
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

enum TalkieInfoWording {
    static var text: String {
        String(
            localized: "talkie.info.text",
            defaultValue: "Votre voix sort même si Meeshy est en arrière-plan.",
            bundle: .main
        )
    }

    static var a11y: String {
        String(localized: "talkie.info.a11y", defaultValue: "Quand utiliser le talkie ?", bundle: .main)
    }
}
