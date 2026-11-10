import SwiftUI
import MeeshySDK
import MeeshyUI

struct SettingsSectionBackground: View {
    let tint: String

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.lg)
            .fill(theme.surfaceGradient(tint: tint))
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .stroke(theme.border(tint: tint), lineWidth: 1)
            )
    }
}
