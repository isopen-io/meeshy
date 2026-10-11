import SwiftUI
import MeeshyUI

/// Meeshy brand signature footer — three stacked lines: the prominent version
/// line (`Meeshy 1.0.0 · 1`), the « by services.ceo » credit and the brand logo.
/// Shared by the splash screen, the welcome screen and the login screen: editing
/// the credit, the styling or the logo here updates every surface that shows the
/// signature.
///
/// The credit is a BRAND (#10096): identical in every locale, so it is rendered
/// `verbatim` — no catalog key — and the web pied reads the same string
/// (`apps/web/src/lib/brand.ts`, `BRAND_CREDIT`). Tapping it opens the platform
/// in the browser. Its hit area reaches 44 pt through an outset content shape
/// that hands the layout its space back: no line of the footer moves.
///
/// Self-contained (reads version/build from `Bundle.main`); callers add their own
/// animation / layout modifiers (opacity, padding) around it.
struct BrandSignature: View {
    nonisolated static let credit = "by services.ceo"
    nonisolated static let creditDestination = URL(string: "https://services.ceo")!
    /// Added around the ~17 pt credit line on every side for hit testing only,
    /// then taken back from the layout: 17 + 2 × 14 = 45 pt ≥ 44 pt (HIG).
    nonisolated static let creditHitOutset: CGFloat = 14

    private var theme: ThemeManager { ThemeManager.shared }

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
    }
    private var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
    }

    var body: some View {
        VStack(spacing: MeeshySpacing.xs) {
            Text("Meeshy \(appVersion) · \(buildNumber)")
                .font(MeeshyFont.relative(MeeshyFont.labelSize, design: .rounded))
                .foregroundColor(theme.textMuted.opacity(MeeshyOpacity.intense))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .accessibilityLabel(
                    String(
                        localized: "brand.signature.accessibilityLabel",
                        defaultValue: "Meeshy version \(appVersion), build \(buildNumber).",
                        bundle: .main
                    )
                )

            Link(destination: Self.creditDestination) {
                Text(verbatim: Self.credit)
                    .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium, design: .rounded))
                    .foregroundColor(theme.textMuted.opacity(MeeshyOpacity.heavy))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .padding(Self.creditHitOutset)
                    .contentShape(Rectangle())
                    .padding(-Self.creditHitOutset)
            }
            .accessibilityLabel(Text(verbatim: Self.credit))
            .accessibilityHint(
                String(
                    localized: "brand.signature.credit.accessibilityHint",
                    defaultValue: "Ouvre la plateforme services.ceo dans le navigateur",
                    bundle: .main
                )
            )

            Image("AppIconFooter")
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .frame(width: 28, height: 28)
                .foregroundColor(MeeshyColors.error)
                .opacity(MeeshyOpacity.intense)
                .padding(.top, MeeshySpacing.xxs)
                .accessibilityHidden(true)
                .allowsHitTesting(false)
        }
    }
}
