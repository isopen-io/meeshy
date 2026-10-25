import SwiftUI
import MeeshyUI

/// L'entrée de Sécurité vers « Mes appareils chiffrés » (#13009), au pied des
/// sessions : même carte, même vocabulaire que ses voisines.
struct EncryptedDevicesEntry: View {
    @State private var isPresented = false
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            HStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: "lock.shield.fill")
                    .font(.caption.weight(.semibold))
                    .accessibilityHidden(true)
                Text(String(localized: "e2ee.devices.section.header", defaultValue: "Chiffrement de bout en bout", bundle: .main).uppercased())
                    .font(.system(.caption2, design: .rounded).weight(.bold))
                    .tracking(1.2)
                    .accessibilityAddTraits(.isHeader)
            }
            .foregroundStyle(MeeshyColors.success)
            .padding(.leading, MeeshySpacing.xs)

            Button {
                HapticFeedback.light()
                isPresented = true
            } label: {
                HStack(spacing: MeeshySpacing.md) {
                    Image(systemName: "iphone.and.arrow.forward")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(MeeshyColors.success)
                        .frame(width: MeeshyControlSize.small, height: MeeshyControlSize.small)
                        .background(RoundedRectangle(cornerRadius: MeeshyRadius.xs).fill(MeeshyColors.success.opacity(MeeshyOpacity.light)))
                        .accessibilityHidden(true)
                    Text(String(localized: "e2ee.devices.title", defaultValue: "Mes appareils chiffrés", bundle: .main))
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(theme.textPrimary)
                    Spacer()
                    Image(systemName: "chevron.forward")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(theme.textMuted)
                        .accessibilityHidden(true)
                }
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .padding(.vertical, MeeshySpacing.md)
                .frame(minHeight: MeeshyControlSize.tapTarget)
            }
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .fill(theme.surfaceGradient(tint: MeeshyColors.success))
                    .overlay(RoundedRectangle(cornerRadius: MeeshyRadius.lg).stroke(theme.border(tint: MeeshyColors.success), lineWidth: 1))
            )
            .accessibilityHint(String(localized: "e2ee.devices.entry.hint", defaultValue: "Approuvez vos autres appareils pour y lire vos messages chiffrés", bundle: .main))
            .accessibilityIdentifier("security.encryptedDevices")
        }
        .sheet(isPresented: $isPresented) { EncryptedDevicesView() }
    }
}
