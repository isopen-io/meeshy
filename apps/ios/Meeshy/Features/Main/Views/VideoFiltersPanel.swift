import SwiftUI
import Combine
import MeeshyUI

struct VideoFiltersPanel: View {
    @ObservedObject private var callManager = CallManager.shared
    @State private var filterConfig = VideoFilterConfig()
    @State private var activePreset: VideoFilterPreset? = .natural

    var body: some View {
        VStack(spacing: 14) {
            header
            presetSelector
            VideoFilterControlView(config: $filterConfig)
                .padding(.horizontal, -16)
            advancedToggles
            performanceIndicator
        }
        .padding(16)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 16)
        .onAppear {
            filterConfig = callManager.videoFilters.config
        }
        .adaptiveOnChange(of: filterConfig) { _, newConfig in
            callManager.videoFilters.config = newConfig
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: "camera.filters")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(MeeshyColors.indigo400)
            Text(String(localized: "video.filter.title", defaultValue: "Filtres video", bundle: .main))
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .foregroundColor(.primary)
            Spacer()
            if filterConfig.isEnabled {
                Button {
                    filterConfig = VideoFilterPreset.natural.config
                    filterConfig.isEnabled = false
                    activePreset = .natural
                } label: {
                    Text(String(localized: "video.filter.reset", defaultValue: "Reset", bundle: .main))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(MeeshyColors.error)
                }
            }
        }
    }

    // MARK: - Preset Selector

    private var presetSelector: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
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
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(isActive ? MeeshyColors.indigo500 : .secondary)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(
                    Capsule()
                        .fill(isActive ? MeeshyColors.indigo500.opacity(0.15) : Color.primary.opacity(0.06))
                )
                .overlay(
                    Capsule()
                        .stroke(isActive ? MeeshyColors.indigo500.opacity(0.4) : Color.clear, lineWidth: 1)
                )
        }
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
        VStack(spacing: 10) {
            Divider().opacity(0.3)

            HStack {
                Image(systemName: "person.and.background.dotted")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(MeeshyColors.indigo400)
                    .frame(width: 18)
                Text(String(localized: "video.filter.backgroundBlur", defaultValue: "Flou d'arriere-plan", bundle: .main))
                    .font(.system(size: 13, weight: .medium))
                Spacer()
                Toggle("", isOn: $filterConfig.backgroundBlurEnabled)
                    .tint(MeeshyColors.indigo500)
                    .labelsHidden()
            }

            if filterConfig.backgroundBlurEnabled {
                HStack(spacing: 10) {
                    Text(String(localized: "video.filter.radius", defaultValue: "Rayon", bundle: .main))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.secondary)
                        .frame(width: 55, alignment: .leading)
                    Slider(value: $filterConfig.backgroundBlurRadius, in: 5...20)
                        .tint(MeeshyColors.indigo500)
                    Text(String(format: "%.0f", filterConfig.backgroundBlurRadius))
                        .font(.system(size: 11, weight: .medium).monospacedDigit())
                        .foregroundColor(.secondary)
                        .frame(width: 28, alignment: .trailing)
                }
                .padding(.leading, 28)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }

            HStack {
                Image(systemName: "face.dashed")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(MeeshyColors.indigo400)
                    .frame(width: 18)
                Text(String(localized: "video.filter.skinSmoothing", defaultValue: "Lissage peau", bundle: .main))
                    .font(.system(size: 13, weight: .medium))
                Spacer()
                Toggle("", isOn: $filterConfig.skinSmoothingEnabled)
                    .tint(MeeshyColors.indigo500)
                    .labelsHidden()
            }

            if filterConfig.skinSmoothingEnabled {
                HStack(spacing: 10) {
                    Text(String(localized: "video.filter.intensity", defaultValue: "Intensite", bundle: .main))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.secondary)
                        .frame(width: 55, alignment: .leading)
                    Slider(value: $filterConfig.skinSmoothingIntensity, in: 0...1)
                        .tint(MeeshyColors.indigo500)
                    Text(String(format: "%.0f%%", filterConfig.skinSmoothingIntensity * 100))
                        .font(.system(size: 11, weight: .medium).monospacedDigit())
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
            HStack(spacing: 6) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 10))
                Text(String(localized: "video.filter.performanceDegraded", defaultValue: "Performance reduite — certains filtres desactives", bundle: .main))
                    .font(.system(size: 11, weight: .medium))
            }
            .foregroundColor(MeeshyColors.warning)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(MeeshyColors.warning.opacity(0.12))
            )
        }
    }
}
