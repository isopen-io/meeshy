import SwiftUI
import Combine
import MeeshyUI

// MARK: - Effects Panel Type

// Voice-effects entry (`.audioEffects` / AudioEffectsPanel) removed 2026-07-02:
// the audio-effects pipeline had no production capture hook — the underlying
// `processAudioBuffer` had zero production callers since the
// `MeeshyAudioProcessingModule` scaffold was dropped, so the panel silently
// no-oped: the peer always heard the unmodified voice. The dead voice-effects
// engine (service, types, `CallManager`/`WebRTCService` plumbing, tests) was
// deleted outright in the 2026-07-05 audit — re-introduce the whole feature
// from scratch (case, toolbar button, and a real WebRTC capture hook) if it's
// ever revived.
enum EffectsPanelType: Equatable {
    case videoFilters
}

// MARK: - Call Effects Overlay

struct CallEffectsOverlay: View {
    @Binding var isExpanded: Bool
    let isVideoEnabled: Bool
    @State private var activePanel: EffectsPanelType?
    // Received from CallView, NOT instantiated here (`= CallManager.shared`
    // would re-create the @ObservedObject subscription on every parent body
    // re-evaluation — CallView re-evaluates often: pulse animation,
    // showEffectsToolbar toggle, the control-bar auto-hide `.task(id:)`.
    // CallView and IncomingCallView were already fixed for this same reason;
    // this overlay was added afterwards and missed the same treatment.
    @ObservedObject var callManager: CallManager

    var body: some View {
        Group {
            if isExpanded {
                GeometryReader { proxy in
                    // Panel height caps at 360pt on tall screens but shrinks on
                    // shorter/landscape viewports (e.g. iPhone SE landscape)
                    // instead of clipping the video-filters content.
                    let panelMaxHeight = min(360, proxy.size.height * 0.45)

                    ZStack(alignment: .bottom) {
                        // Backdrop
                        Color.black.opacity(0.25)
                            .ignoresSafeArea()
                            .onTapGesture { dismiss() }
                            .accessibilityAddTraits(.isButton)
                            .accessibilityLabel(String(localized: "call.effects.backdrop.label", defaultValue: "Fermer le panneau", bundle: .main))
                            .accessibilityHint(String(localized: "call.effects.backdrop.hint", defaultValue: "Ferme le panneau d'effets", bundle: .main))

                        // Content
                        VStack(spacing: 12) {
                            if let panel = activePanel {
                                ScrollView(.vertical, showsIndicators: false) {
                                    switch panel {
                                    case .videoFilters:
                                        VideoFiltersPanel()
                                    }
                                }
                                .frame(maxHeight: panelMaxHeight)
                                .transition(.move(edge: .bottom).combined(with: .opacity))
                            }

                            secondaryToolbar
                                .transition(.move(edge: .bottom).combined(with: .opacity))
                        }
                        .padding(.bottom, 130)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
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
        // Pinned dark like sibling call chrome (CallWaitingBannerView,
        // FloatingCallPillView) — this overlay currently only mounts inside
        // CallView's forced-dark subtree, but pinning here keeps it correct
        // if it's ever presented standalone.
        .environment(\.colorScheme, .dark)
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
        .accessibilityLabel(label)
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
