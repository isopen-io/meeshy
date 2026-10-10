import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI
import os

// Les commandes des écrans de sonnerie et de connexion (Filtres, Raccrocher).
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

    var effectsToggleButton: some View {
        Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                showEffectsToolbar.toggle()
            }
        } label: {
            VStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: showEffectsToolbar ? "xmark" : "camera.filters")
                    // Doctrine 86i : glyphe de contrôle dans un cercle glass fixe (diameter 64) → figé.
                    .font(.system(size: 24, weight: .medium))
                    .foregroundColor(hasActiveEffects ? MeeshyColors.indigo500 : .white.opacity(MeeshyOpacity.intense))
                    .callControlGlass(diameter: 64, isActive: hasActiveEffects, tint: MeeshyColors.indigo500)

                Text(String(localized: "call.filters", defaultValue: "Filtres", bundle: .main))
                    .font(.caption2.weight(.medium))
                    .foregroundColor(MeeshyColors.mediaChromeTertiary)
            }
        }
        .buttonStyle(CallPressButtonStyle())
        .accessibilityLabel(String(localized: "call.filters.a11y", defaultValue: "Filtres vidéo", bundle: .main))
        .accessibilityHint(String(localized: "call.filters.hint", defaultValue: "Ouvre ou ferme la barre de filtres vidéo", bundle: .main))
        // L'indice disait « ouvre OU ferme » — ambigu précisément parce que
        // l'état n'était pas exposé : le glyphe passe de `camera.filters` à
        // `xmark` et rien ne le disait (253i, #4266). L'état porté ici est celui
        // que le bouton BASCULE (la barre), jamais `hasActiveEffects`, qui est
        // un fait VOISIN — la teinte le montre, et l'annoncer ici ferait dire au
        // contrôle un état qui n'est pas le sien.
        .toggleStateAccessibility(isToggle: true, isActive: showEffectsToolbar)
    }

    var endCallButton: some View {
        Button {
            callManager.endCall()
        } label: {
            VStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: "phone.down.fill")
                    // Doctrine 86i : glyphe de fin d'appel dans un cercle glass fixe (diameter 56) → figé.
                    .font(.system(size: 24, weight: .medium))
                    .foregroundColor(.white)
                    .endCallGlass(diameter: 56)

                Text(String(localized: "call.end.caption", defaultValue: "Raccrocher", bundle: .main))
                    .font(.caption2.weight(.medium))
                    .foregroundColor(MeeshyColors.mediaChromeTertiary)
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
