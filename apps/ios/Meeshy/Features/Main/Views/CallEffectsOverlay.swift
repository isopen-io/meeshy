import SwiftUI
import Combine
import MeeshyUI

// MARK: - Effects Panel Type

// Voice-effects entry (`.audioEffects` / AudioEffectsPanel) removed 2026-07-02:
// the audio-effects pipeline has no production capture hook —
// `CallAudioEffectsService.processAudioBuffer` has had zero production callers
// since the `MeeshyAudioProcessingModule` scaffold was dropped, so the panel
// silently no-oped: the peer always heard the unmodified voice. Re-add the case
// and the toolbar button once a real WebRTC capture hook feeds the service.
enum EffectsPanelType: Equatable {
    case videoFilters
}

// MARK: - Call Effects Overlay

struct CallEffectsOverlay: View {
    @Binding var isExpanded: Bool
    let isVideoEnabled: Bool
    @State private var activePanel: EffectsPanelType?
    @ObservedObject private var callManager = CallManager.shared

    var body: some View {
        Group {
            if isExpanded {
                ZStack(alignment: .bottom) {
                    // Backdrop
                    Color.black.opacity(0.25)
                        .ignoresSafeArea()
                        .onTapGesture { dismiss() }

                    // Content
                    VStack(spacing: 12) {
                        if let panel = activePanel {
                            ScrollView(.vertical, showsIndicators: false) {
                                switch panel {
                                case .videoFilters:
                                    VideoFiltersPanel()
                                }
                            }
                            .frame(maxHeight: 360)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                        }

                        secondaryToolbar
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                    .padding(.bottom, 130)
                }
                // Filtres = seul panneau depuis le retrait des effets vocaux :
                // l'ouvrir directement à chaque présentation, au lieu d'exiger
                // un second tap sur la toolbar intermédiaire (retour user
                // 2026-07-02). `onAppear` refire à chaque `isExpanded` true
                // (la vue n'existe pas sinon) ; `dismiss()` remet `nil`.
                .onAppear { activePanel = .videoFilters }
                .transition(.opacity)
                .zIndex(10)
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: isExpanded)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: activePanel)
    }

    // MARK: - Secondary Toolbar

    private var secondaryToolbar: some View {
        HStack(spacing: 20) {
            if isVideoEnabled {
                toolbarButton(
                    icon: "camera.filters",
                    label: String(localized: "call.effects.videoFilters", defaultValue: "Filtres"),
                    isActive: activePanel == .videoFilters || callManager.videoFilters.config.isEnabled,
                    panel: .videoFilters
                )
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 12)
        // iOS 26 Liquid Glass — floating control toolbar above the call video
        // (textbook Apple chrome-over-content). SDK Compatibility wrapper owns
        // the gating + `.ultraThinMaterial` fallback. Applied after sizing.
        .adaptiveGlass(in: Capsule())
        .clipShape(Capsule())
    }

    private func toolbarButton(icon: String, label: String, isActive: Bool, panel: EffectsPanelType) -> some View {
        Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                if activePanel == panel {
                    activePanel = nil
                } else {
                    activePanel = panel
                }
            }
            HapticFeedback.light()
        } label: {
            VStack(spacing: 4) {
                ZStack {
                    Circle()
                        .fill(isActive ? MeeshyColors.indigo500.opacity(0.2) : Color.white.opacity(0.1))
                        .frame(width: 48, height: 48)
                        .overlay(
                            Circle()
                                .stroke(isActive ? MeeshyColors.indigo500.opacity(0.5) : Color.white.opacity(0.2), lineWidth: 1)
                        )

                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .medium))
                        .foregroundColor(isActive ? MeeshyColors.indigo500 : .white.opacity(0.9))
                }

                Text(label)
                    .font(.caption2.weight(.medium))
                    .foregroundColor(.secondary)
            }
        }
        .pressable()
        .accessibilityValue(isActive
            ? String(localized: "accessibility.state.on", defaultValue: "Activé", bundle: .main)
            : String(localized: "accessibility.state.off", defaultValue: "Désactivé", bundle: .main))
        .accessibilityHint(activePanel == panel
            ? String(localized: "call.effects.panel.hint.close", defaultValue: "Ferme le panneau", bundle: .main)
            : String(localized: "call.effects.panel.hint.open", defaultValue: "Ouvre le panneau", bundle: .main))
    }

    // MARK: - Dismiss

    private func dismiss() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            activePanel = nil
            isExpanded = false
        }
    }
}
