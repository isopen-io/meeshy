import SwiftUI

/// Meeshy brand signature footer — three stacked lines: the prominent version
/// line (`Meeshy 1.0.0 · 1`), the "Services CEO" credit
/// (`brand.signature.credit`) and the brand logo. Shared by the splash screen
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

    var body: some View {
        VStack(spacing: 4) {
            Text("Meeshy \(appVersion) · \(buildNumber)")
                .font(MeeshyFont.relative(14, design: .rounded))
                .foregroundColor(theme.textMuted.opacity(0.9))
                .lineLimit(1)
                .minimumScaleFactor(0.7)

            Text(String(localized: "brand.signature.credit", bundle: .main))
                .font(MeeshyFont.relative(14, weight: .medium, design: .rounded))
                .foregroundColor(theme.textMuted.opacity(0.7))
                .lineLimit(1)
                .minimumScaleFactor(0.7)

            Image("AppIconFooter")
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .frame(width: 28, height: 28)
                .foregroundColor(MeeshyColors.error)
                .opacity(0.9)
                .padding(.top, 2)
                .accessibilityHidden(true)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            String(
                localized: "brand.signature.accessibilityLabel",
                defaultValue: "Meeshy version \(appVersion), build \(buildNumber). By Services CEO.",
                bundle: .main
            )
        )
    }
}
