import SwiftUI

/// Meeshy brand signature footer — version line, the "Fait avec ❤️ par Services CEO"
/// credit (`splash.madeWithLove`) and the heart logo. Shared by the splash screen
/// (`MeeshyApp`) and the login screen (`LoginView`): editing the credit string,
/// the styling or the logo here updates every surface that shows the signature.
///
/// Self-contained (reads version/build from `Bundle.main`); callers add their own
/// animation / layout modifiers (opacity, padding) around it.
struct BrandSignature: View {
    private var theme: ThemeManager { ThemeManager.shared }

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
    }
    private var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
    }

    /// Localized VoiceOver label for the whole signature. Spells out "version"/"build"
    /// and the credit with the WORD "love" (not the ❤️ emoji, which VoiceOver would
    /// read as "red heart") so the reading stays natural in every language.
    private var accessibilityLabelText: Text {
        Text(String(
            localized: "splash.signature.a11yLabel",
            defaultValue: "Meeshy version \(appVersion), build \(buildNumber). Made with love by Services CEO.",
            bundle: .main
        ))
    }

    var body: some View {
        VStack(spacing: 6) {
            Text("Meeshy \(appVersion) · \(buildNumber)")
                .font(MeeshyFont.relative(12, weight: .medium, design: .rounded))
                .foregroundColor(theme.textMuted.opacity(0.7))

            Text(String(localized: "splash.madeWithLove", bundle: .main))
                .font(MeeshyFont.relative(11, weight: .medium, design: .rounded))
                .foregroundColor(theme.textMuted.opacity(0.7))
                .lineLimit(1)
                .minimumScaleFactor(0.7)

            Image("AppIconFooter")
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .frame(width: 21, height: 21)
                .foregroundColor(MeeshyColors.error)
                .opacity(0.9)
                .padding(.top, 2)
                .accessibilityHidden(true)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabelText)
    }
}
