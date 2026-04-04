import SwiftUI
import MeeshyUI

// MARK: - Effects Panel Type

enum EffectsPanelType: Equatable {
    case audioEffects
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
                                case .audioEffects:
                                    AudioEffectsPanel()
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
            toolbarButton(
                icon: "waveform.path.ecg",
                label: "Effets",
                isActive: activePanel == .audioEffects || callManager.activeAudioEffect != nil,
                panel: .audioEffects
            )

            if isVideoEnabled {
                toolbarButton(
                    icon: "camera.filters",
                    label: "Filtres",
                    isActive: activePanel == .videoFilters || callManager.videoFilters.config.isEnabled,
                    panel: .videoFilters
                )
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial)
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
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.secondary)
            }
        }
        .pressable()
    }

    // MARK: - Dismiss

    private func dismiss() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            activePanel = nil
            isExpanded = false
        }
    }
}
