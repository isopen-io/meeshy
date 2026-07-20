import SwiftUI
import Combine
import MeeshyUI

struct VideoFiltersPanel: View {
    // Received from CallEffectsOverlay, NOT instantiated here (`= CallManager.shared`
    // would re-create the @ObservedObject subscription on every parent body
    // re-evaluation — CallEffectsOverlay/CallView re-evaluate often mid-call.
    // Same P1-16 hazard already fixed on CallView, FloatingCallPillView,
    // CallBubbleView and CallParticipantVisual; this panel was missed.
    @ObservedObject var callManager: CallManager
    @State private var filterConfig = VideoFilterConfig()
    @State private var activePreset: VideoFilterPreset? = .natural

    var body: some View {
        VStack(spacing: MeeshySpacing.md) {
            header
            presetSelector
            VideoFilterControlView(config: $filterConfig)
                .padding(.horizontal, -MeeshySpacing.lg)
            advancedToggles
            performanceIndicator
        }
        .padding(MeeshySpacing.lg)
        // Liquid Glass natif (iOS 26+) sur la surface flottante neutre. La
        // sous-section `VideoFilterControlView` reste en `.ultraThinMaterial`
        // (matériau SUR verre = HIG ; jamais verre-dans-verre).
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg))
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
        .padding(.horizontal, MeeshySpacing.lg)
        .onAppear {
            filterConfig = callManager.videoFilters.config
        }
        .adaptiveOnChange(of: filterConfig) { _, newConfig in
            callManager.videoFilters.config = newConfig
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: "camera.filters")
                .font(MeeshyFont.relative(14, weight: .semibold))
                .foregroundColor(MeeshyColors.indigo400)
            Text(String(localized: "video.filter.title", defaultValue: "Filtres video", bundle: .main))
                .font(MeeshyFont.relative(15, weight: .semibold, design: .rounded))
                .foregroundColor(.primary)
            Spacer()
            if filterConfig.isEnabled {
                Button {
                    filterConfig = VideoFilterPreset.natural.config
                    filterConfig.isEnabled = false
                    activePreset = .natural
                } label: {
                    Text(String(localized: "video.filter.reset", defaultValue: "Reset", bundle: .main))
                        .font(MeeshyFont.relative(12, weight: .medium))
                        .foregroundColor(MeeshyColors.error)
                }
                .meeshyTapTarget()
            }
        }
    }

    // MARK: - Preset Selector

    private var presetSelector: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: MeeshySpacing.sm) {
                ForEach(VideoFilterPreset.allCases, id: \.self) { preset in
                    presetChip(preset)
                }
            }
        }
    }

    private func presetChip(_ preset: VideoFilterPreset) -> some View {
        let isActive = activePreset == preset
        return Button {
            activePreset = preset
            var config = preset.config
            config.backgroundBlurEnabled = filterConfig.backgroundBlurEnabled
            config.backgroundBlurRadius = filterConfig.backgroundBlurRadius
            config.skinSmoothingEnabled = filterConfig.skinSmoothingEnabled
            config.skinSmoothingIntensity = filterConfig.skinSmoothingIntensity
            filterConfig = config
        } label: {
            Text(presetLabel(preset))
                .font(MeeshyFont.relative(12, weight: .medium))
                .foregroundColor(isActive ? MeeshyColors.indigo500 : .secondary)
                .padding(.horizontal, MeeshySpacing.md)
                .padding(.vertical, MeeshySpacing.sm)
                .background(
                    Capsule()
                        .fill(isActive ? MeeshyColors.indigo500.opacity(0.15) : Color.primary.opacity(0.06))
                )
                .overlay(
                    Capsule()
                        .stroke(isActive ? MeeshyColors.indigo500.opacity(0.4) : Color.clear, lineWidth: 1)
                )
        }
        .meeshyTapTarget()
        .pressable()
    }

    private func presetLabel(_ preset: VideoFilterPreset) -> String {
        switch preset {
        case .natural: return String(localized: "video.filter.preset.natural", defaultValue: "Naturel", bundle: .main)
        case .warm: return String(localized: "video.filter.preset.warm", defaultValue: "Chaud", bundle: .main)
        case .cool: return String(localized: "video.filter.preset.cool", defaultValue: "Froid", bundle: .main)
        case .vivid: return String(localized: "video.filter.preset.vivid", defaultValue: "Vif", bundle: .main)
        case .muted: return String(localized: "video.filter.preset.muted", defaultValue: "Doux", bundle: .main)
        }
    }

    // MARK: - Advanced Toggles

    private var advancedToggles: some View {
        VStack(spacing: MeeshySpacing.sm) {
            Divider().opacity(0.3)

            HStack {
                Image(systemName: "person.and.background.dotted")
                    .font(MeeshyFont.relative(12, weight: .medium))
                    .foregroundColor(MeeshyColors.indigo400)
                    .frame(width: 18)
                Text(String(localized: "video.filter.backgroundBlur", defaultValue: "Flou d'arriere-plan", bundle: .main))
                    .font(MeeshyFont.relative(13, weight: .medium))
                Spacer()
                Toggle("", isOn: $filterConfig.backgroundBlurEnabled)
                    .tint(MeeshyColors.indigo500)
                    .labelsHidden()
                    .accessibilityLabel(String(localized: "video.filter.backgroundBlur", defaultValue: "Flou d'arriere-plan", bundle: .main))
            }

            if filterConfig.backgroundBlurEnabled {
                HStack(spacing: MeeshySpacing.sm) {
                    Text(String(localized: "video.filter.radius", defaultValue: "Rayon", bundle: .main))
                        .font(MeeshyFont.relative(12, weight: .medium))
                        .foregroundColor(.secondary)
                        .frame(width: 55, alignment: .leading)
                    Slider(value: $filterConfig.backgroundBlurRadius, in: 5...20)
                        .tint(MeeshyColors.indigo500)
                        .accessibilityLabel(String(localized: "video.filter.radius", defaultValue: "Rayon", bundle: .main))
                        .accessibilityValue(String(format: "%.0f", filterConfig.backgroundBlurRadius))
                    Text(String(format: "%.0f", filterConfig.backgroundBlurRadius))
                        .font(MeeshyFont.relative(11, weight: .medium, design: .monospaced))
                        .foregroundColor(.secondary)
                        .frame(width: 28, alignment: .trailing)
                }
                .padding(.leading, 28)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }

            HStack {
                Image(systemName: "face.dashed")
                    .font(MeeshyFont.relative(12, weight: .medium))
                    .foregroundColor(MeeshyColors.indigo400)
                    .frame(width: 18)
                Text(String(localized: "video.filter.skinSmoothing", defaultValue: "Lissage peau", bundle: .main))
                    .font(MeeshyFont.relative(13, weight: .medium))
                Spacer()
                Toggle("", isOn: $filterConfig.skinSmoothingEnabled)
                    .tint(MeeshyColors.indigo500)
                    .labelsHidden()
                    .accessibilityLabel(String(localized: "video.filter.skinSmoothing", defaultValue: "Lissage peau", bundle: .main))
            }

            if filterConfig.skinSmoothingEnabled {
                HStack(spacing: MeeshySpacing.sm) {
                    Text(String(localized: "video.filter.intensity", defaultValue: "Intensite", bundle: .main))
                        .font(MeeshyFont.relative(12, weight: .medium))
                        .foregroundColor(.secondary)
                        .frame(width: 55, alignment: .leading)
                    Slider(value: $filterConfig.skinSmoothingIntensity, in: 0...1)
                        .tint(MeeshyColors.indigo500)
                        .accessibilityLabel(String(localized: "video.filter.intensity", defaultValue: "Intensite", bundle: .main))
                        .accessibilityValue(String(format: "%.0f%%", filterConfig.skinSmoothingIntensity * 100))
                    Text(String(format: "%.0f%%", filterConfig.skinSmoothingIntensity * 100))
                        .font(MeeshyFont.relative(11, weight: .medium, design: .monospaced))
                        .foregroundColor(.secondary)
                        .frame(width: 42, alignment: .trailing)
                }
                .padding(.leading, 28)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: filterConfig.backgroundBlurEnabled)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: filterConfig.skinSmoothingEnabled)
    }

    // MARK: - Performance Indicator

    @ViewBuilder
    private var performanceIndicator: some View {
        if callManager.videoFilters.isAutoDegraded {
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(MeeshyFont.relative(10))
                Text(String(localized: "video.filter.performanceDegraded", defaultValue: "Performance reduite — certains filtres desactives", bundle: .main))
                    .font(MeeshyFont.relative(11, weight: .medium))
            }
            .foregroundColor(MeeshyColors.warning)
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.sm)
            .background(
                Capsule()
                    .fill(MeeshyColors.warning.opacity(0.12))
            )
        }
    }
}
