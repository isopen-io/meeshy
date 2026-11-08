import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI
import os

// Les commandes des écrans de sonnerie et de connexion (Effets, Raccrocher).
// La pilule de l'appel établi vit dans `CallView+Pill.swift` (#8394).

extension CallView {
    // MARK: - Ringing / connecting controls

    var hasActiveEffects: Bool {
        // Voice effects are no longer settable from the UI (dead pipeline,
        // entry removed) — only video filters light this up. `isEnabled`
        // alone misses background blur/skin smoothing enabled without ever
        // picking a colorimetry preset — same root cause as the pipeline's
        // own gate (VideoFilterPipeline.process), mirrored here.
        let config = callManager.videoFilters.config
        return config.isEnabled || config.hasAdvancedFilters
    }

    /// OPUS-4 — avant la connexion, « Effets » ouvre le MÊME mode que l'appel
    /// établi (carrousel « Effets de ma caméra ») : plus de second panneau.
    var effectsModeButton: some View {
        Button {
            enterMode(.effects)
        } label: {
            VStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: "camera.filters")
                    // Doctrine 86i : glyphe de contrôle dans un cercle glass fixe (diameter 64) → figé.
                    .font(.system(size: 24, weight: .medium))
                    .foregroundColor(hasActiveEffects ? MeeshyColors.indigo500 : .white.opacity(MeeshyOpacity.intense))
                    .callControlGlass(diameter: 64, isActive: hasActiveEffects, tint: MeeshyColors.indigo500)

                Text(CallControlsCopy.effectsCaption)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(MeeshyColors.mediaChromeTertiary)
            }
        }
        .buttonStyle(CallPressButtonStyle())
        .accessibilityLabel(CallControlsCopy.effects)
        .accessibilityHint(CallControlsCopy.effectsHint)
    }

    var endCallButton: some View {
        Button {
            callManager.endCall()
        } label: {
            VStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: "phone.down.fill")
                    // Doctrine 86i : glyphe de fin d'appel dans un cercle glass fixe (diameter 56) → figé.
                    .font(.system(size: 24, weight: .medium))
                    .foregroundStyle(Color.white)
                    .endCallGlass(diameter: 56)

                Text(String(localized: "call.end.caption", defaultValue: "Raccrocher", bundle: .main))
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(MeeshyColors.mediaChromeTertiary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(width: 68)
        }
        .buttonStyle(CallPressButtonStyle())
        .accessibilityLabel(String(localized: "call.end", defaultValue: "Raccrocher", bundle: .main))
        .accessibilityHint(String(localized: "call.end.hint", defaultValue: "Termine l'appel en cours", bundle: .main))
    }
}
