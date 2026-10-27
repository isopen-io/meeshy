import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Accès refusé : le panneau explique et ouvre les Réglages ; la croix reste,
/// en haut à gauche** (#8653, porteur 2026-10-05) — quitter à tout moment.
struct ComposerCaptureRefusedChrome: View {
    let onDisarm: () -> Void

    var body: some View {
        VStack {
            HStack {
                Button { onDisarm() } label: {
                    Image(systemName: "xmark")
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                        .adaptiveLiquidGlass(in: Circle(), interactive: true)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(ComposerSceneCameraCopy.disarmLabel)
                Spacer()
            }
            Spacer()
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.top, MeeshySpacing.md)
    }
}
