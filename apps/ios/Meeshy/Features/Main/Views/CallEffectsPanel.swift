import SwiftUI
import MeeshyUI

enum CallEffectsCopy {
    static var title: String {
        String(localized: "call.effects.title", defaultValue: "Effets", bundle: .main)
    }

    static var faceRow: String {
        String(localized: "call.effects.row.face", defaultValue: "Effets", bundle: .main)
    }

    static var colorRow: String {
        String(localized: "call.effects.row.color", defaultValue: "Couleur", bundle: .main)
    }

    static var settingsRow: String {
        String(localized: "call.effects.row.settings", defaultValue: "Réglages", bundle: .main)
    }

    static var noColor: String {
        String(localized: "call.effects.color.none", defaultValue: "Aucune", bundle: .main)
    }

    static var blur: String {
        String(localized: "call.effects.blur", defaultValue: "Flou du fond", bundle: .main)
    }

    static var brightness: String {
        String(localized: "call.effects.brightness", defaultValue: "Luminosité", bundle: .main)
    }

    static var more: String {
        String(localized: "call.effects.more", defaultValue: "Plus de réglages", bundle: .main)
    }

    static func name(_ effect: CallFaceEffect) -> String {
        switch effect {
        case .none: return String(localized: "call.effects.face.none", defaultValue: "Aucun", bundle: .main)
        case .smoothing: return String(localized: "call.effects.face.smoothing", defaultValue: "Lissage de peau", bundle: .main)
        case .toad: return String(localized: "call.effects.face.toad", defaultValue: "Crapaud", bundle: .main)
        case .angel: return String(localized: "call.effects.face.angel", defaultValue: "Ange", bundle: .main)
        case .demon: return String(localized: "call.effects.face.demon", defaultValue: "Démon", bundle: .main)
        case .volcano: return String(localized: "call.effects.face.volcano", defaultValue: "Éruption", bundle: .main)
        }
    }

    static func art(_ effect: CallFaceEffect) -> CallPillChipArt {
        switch effect {
        case .none: return .symbol("circle.slash")
        case .smoothing: return .emoji("✨")
        case .toad: return .emoji("🐸")
        case .angel: return .emoji("😇")
        case .demon: return .emoji("😈")
        case .volcano: return .emoji("🌋")
        }
    }

    static func presetName(_ preset: VideoFilterPreset) -> String {
        switch preset {
        case .natural: return String(localized: "video.filter.preset.natural", defaultValue: "Naturel", bundle: .main)
        case .warm: return String(localized: "video.filter.preset.warm", defaultValue: "Chaud", bundle: .main)
        case .cool: return String(localized: "video.filter.preset.cool", defaultValue: "Froid", bundle: .main)
        case .vivid: return String(localized: "video.filter.preset.vivid", defaultValue: "Vif", bundle: .main)
        case .muted: return String(localized: "video.filter.preset.muted", defaultValue: "Doux", bundle: .main)
        }
    }

    static func presetSymbol(_ preset: VideoFilterPreset) -> String {
        switch preset {
        case .natural: return "leaf"
        case .warm: return "sun.max"
        case .cool: return "snowflake"
        case .vivid: return "sparkles"
        case .muted: return "cloud"
        }
    }
}

struct CallEffectsPanel: View {
    @ObservedObject var callManager: CallManager
    let onClose: () -> Void

    @State private var config = VideoFilterConfig()
    @State private var showsAllSettings = false

    var body: some View {
        VStack(spacing: 0) {
            CallPanelHeader(title: CallEffectsCopy.title, onClose: onClose)
            CallPillRow(title: CallEffectsCopy.faceRow) {
                ForEach(CallFaceEffect.allCases, id: \.self) { effect in
                    CallPillChip(
                        art: CallEffectsCopy.art(effect),
                        caption: CallEffectsCopy.name(effect),
                        label: CallEffectsCopy.name(effect),
                        isSelected: config.activeFaceEffect == effect
                    ) {
                        HapticFeedback.light()
                        config = config.selectingFaceEffect(effect)
                    }
                }
            }
            CallPillRow(title: CallEffectsCopy.colorRow) {
                CallPillChip(
                    art: .symbol("circle.slash"),
                    caption: CallEffectsCopy.noColor,
                    label: CallEffectsCopy.noColor,
                    isSelected: config.activePreset == nil
                ) {
                    config = config.applyingPreset(nil)
                }
                ForEach(VideoFilterPreset.allCases, id: \.self) { preset in
                    CallPillChip(
                        art: .symbol(CallEffectsCopy.presetSymbol(preset)),
                        caption: CallEffectsCopy.presetName(preset),
                        label: CallEffectsCopy.presetName(preset),
                        isSelected: config.activePreset == preset
                    ) {
                        HapticFeedback.light()
                        config = config.applyingPreset(preset)
                    }
                }
            }
            CallPillRow(title: CallEffectsCopy.settingsRow) {
                CallPillChip(
                    art: .symbol("person.and.background.dotted"),
                    caption: CallEffectsCopy.blur,
                    label: CallEffectsCopy.blur,
                    isSelected: config.backgroundBlurEnabled
                ) {
                    config = config.withBackgroundBlur(!config.backgroundBlurEnabled)
                }
                brightnessControl
                CallPillChip(
                    art: .symbol("slider.horizontal.3"),
                    caption: CallEffectsCopy.more,
                    label: CallEffectsCopy.more
                ) {
                    showsAllSettings = true
                }
            }
        }
        .onAppear { config = callManager.videoFilters.config }
        .adaptiveOnChange(of: config) { _, newConfig in
            callManager.videoFilters.config = newConfig
        }
        .adaptiveOnChange(of: showsAllSettings) { _, isShown in
            if !isShown { config = callManager.videoFilters.config }
        }
        .sheet(isPresented: $showsAllSettings) {
            VideoFiltersPanel(callManager: callManager)
                .presentationDetents([.medium, .large])
                .environment(\.colorScheme, .dark)
        }
    }

    private var brightnessBinding: Binding<Double> {
        Binding(
            get: { Double(config.brightness) },
            set: { config = config.withBrightness(Float($0)) }
        )
    }

    private var brightnessControl: some View {
        let limit = Double(VideoFilterConfig.brightnessLimit)
        let percent = "\(Int((Double(config.brightness) / limit * 100).rounded())) %"
        return VStack(spacing: 4) {
            HStack(spacing: 6) {
                Image(systemName: "sun.min")
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.7))
                    .accessibilityHidden(true)
                Slider(value: brightnessBinding, in: -limit ... limit)
                    .tint(.white)
                    .frame(width: 132)
                    .accessibilityLabel(CallEffectsCopy.brightness)
                    .accessibilityValue(percent)
                Image(systemName: "sun.max")
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.7))
                    .accessibilityHidden(true)
            }
            .frame(height: 44)
            Text(CallEffectsCopy.brightness)
                .font(.caption2.weight(.medium))
                .foregroundColor(.white.opacity(0.85))
                .lineLimit(1)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 8)
    }
}
