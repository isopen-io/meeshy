import SwiftUI

/// Meeshy brand baseline / tagline (`splash.tagline`), shared by the splash
/// screen (`MeeshyApp`) and the login screen (`LoginView`).
///
/// Single source of truth for the baseline: editing the `splash.tagline`
/// string OR the styling here updates every surface that shows it. Callers add
/// their own animation / layout modifiers (opacity, offset, padding) around it.
struct BrandTagline: View {
    /// Font size — defaults to the splash size (16). The login footer can pass a
    /// smaller value while keeping weight, color and text identical.
    var size: CGFloat = 16

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        Text(String(localized: "splash.tagline", bundle: .main))
            .font(MeeshyFont.relative(size, weight: .medium))
            .foregroundColor(theme.textMuted)
            .multilineTextAlignment(.center)
    }
}
