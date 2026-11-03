import SwiftUI
import MeeshyUI

/// L'en-tête de section de l'écran Licences : glyphe et titre capitalisé, lu
/// comme un en-tête par VoiceOver.
struct LicensesSectionHeader: View {
    let title: String
    let icon: String
    let color: String

    var body: some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                .foregroundStyle(Color(hex: color))
            Text(title.uppercased())
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .bold, design: .rounded))
                .foregroundStyle(Color(hex: color))
                .tracking(1.2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.leading, MeeshySpacing.xs)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title)
        .accessibilityAddTraits(.isHeader)
    }
}
