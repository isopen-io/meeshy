import SwiftUI
import Combine
import MeeshyUI

struct AudioEffectsPanel: View {
    @ObservedObject private var callManager = CallManager.shared
    @State private var selectedEffect: AudioEffectType?
    @State private var voiceCoderParams = VoiceCoderParams(pitch: 0, harmonization: false, strength: 50, retuneSpeed: 50, scale: .chromatic, key: .C, naturalVibrato: 50)
    @State private var babyVoiceParams = BabyVoiceParams(pitch: 9, formant: 1.35, breathiness: 30)
    @State private var demonVoiceParams = DemonVoiceParams(pitch: -10, distortion: 50, reverb: 40)
    @State private var backSoundParams = BackSoundParams(soundFile: "rain", volume: 50, loopMode: .nMinutes, loopValue: 60)
    @State private var debounceTask: Task<Void, Never>?

    var body: some View {
        VStack(spacing: 14) {
            header
            effectSelector
            if selectedEffect != nil {
                parameterSliders
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
        .padding(16)
        // Liquid Glass natif (iOS 26+) sur la surface flottante neutre — chrome
        // d'effets content-agnostic, sans teinte marque (registre QuickType bar).
        // Fallback `.ultraThinMaterial` + hairline pré-26 via l'atome SDK.
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg))
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
        .padding(.horizontal, 16)
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: selectedEffect)
        .onAppear {
            selectedEffect = callManager.activeAudioEffect?.effectType
        }
        .onDisappear {
            // Un debounce 150 ms en vol pouvait encore pousser des paramètres
            // d'effet au CallManager après la fermeture du panneau.
            debounceTask?.cancel()
            debounceTask = nil
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: "waveform.path.ecg")
                .font(MeeshyFont.relative(14, weight: .semibold))
                .foregroundColor(MeeshyColors.indigo400)
                .accessibilityHidden(true)
            Text(String(localized: "audio.effects.title", defaultValue: "Effets audio", bundle: .main))
                .font(MeeshyFont.relative(15, weight: .semibold, design: .rounded))
                .foregroundColor(.primary)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            if callManager.activeAudioEffect != nil {
                Button {
                    selectedEffect = nil
                    callManager.clearAudioEffect()
                } label: {
                    Text(String(localized: "audio.effects.disable", defaultValue: "Desactiver", bundle: .main))
                        .font(MeeshyFont.relative(12, weight: .medium))
                        .foregroundColor(MeeshyColors.error)
                }
            }
        }
    }

    // MARK: - Effect Selector

    private var effectSelector: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                effectChip(label: String(localized: "audio.effects.chip.off", defaultValue: "Off", bundle: .main), icon: "speaker.slash", type: nil)
                effectChip(label: String(localized: "audio.effects.chip.autoTune", defaultValue: "Auto-tune", bundle: .main), icon: "waveform.path.ecg", type: .voiceCoder)
                effectChip(label: String(localized: "audio.effects.chip.baby", defaultValue: "Baby", bundle: .main), icon: "face.smiling", type: .babyVoice)
                effectChip(label: String(localized: "audio.effects.chip.demon", defaultValue: "Demon", bundle: .main), icon: "flame", type: .demonVoice)
                effectChip(label: String(localized: "audio.effects.chip.ambiance", defaultValue: "Ambiance", bundle: .main), icon: "music.note", type: .backSound)
            }
        }
    }

    private func effectChip(label: String, icon: String, type: AudioEffectType?) -> some View {
        let isActive = selectedEffect == type
        return Button {
            selectedEffect = type
            applyEffect(type)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .accessibilityHidden(true)
                Text(label)
                    .font(MeeshyFont.relative(12, weight: .medium))
            }
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
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }

    // MARK: - Parameter Sliders

    @ViewBuilder
    private var parameterSliders: some View {
        switch selectedEffect {
        case .voiceCoder:
            VStack(spacing: 10) {
                effectSlider(icon: "arrow.up.arrow.down", label: String(localized: "audio.effects.slider.pitch", defaultValue: "Pitch", bundle: .main), value: $voiceCoderParams.pitch, range: -12...12, format: "%.0f st")
                effectSlider(icon: "dial.medium", label: String(localized: "audio.effects.slider.strength", defaultValue: "Force", bundle: .main), value: $voiceCoderParams.strength, range: 0...100, format: "%.0f%%")
                effectSlider(icon: "metronome", label: String(localized: "audio.effects.slider.retune", defaultValue: "Retune", bundle: .main), value: $voiceCoderParams.retuneSpeed, range: 0...100, format: "%.0f%%")
            }
            .adaptiveOnChange(of: voiceCoderParams) { _, params in
                debouncedUpdate(.voiceCoder(params))
            }

        case .babyVoice:
            VStack(spacing: 10) {
                effectSlider(icon: "arrow.up", label: String(localized: "audio.effects.slider.pitch", defaultValue: "Pitch", bundle: .main), value: $babyVoiceParams.pitch, range: 6...12, format: "+%.0f st")
                effectSlider(icon: "waveform", label: String(localized: "audio.effects.slider.formant", defaultValue: "Formant", bundle: .main), value: $babyVoiceParams.formant, range: 1.2...1.5, format: "%.2fx")
                effectSlider(icon: "wind", label: String(localized: "audio.effects.slider.breath", defaultValue: "Souffle", bundle: .main), value: $babyVoiceParams.breathiness, range: 0...100, format: "%.0f%%")
            }
            .adaptiveOnChange(of: babyVoiceParams) { _, params in
                debouncedUpdate(.babyVoice(params))
            }

        case .demonVoice:
            VStack(spacing: 10) {
                effectSlider(icon: "arrow.down", label: String(localized: "audio.effects.slider.pitch", defaultValue: "Pitch", bundle: .main), value: $demonVoiceParams.pitch, range: -12...(-8), format: "%.0f st")
                effectSlider(icon: "bolt.fill", label: String(localized: "audio.effects.slider.distortion", defaultValue: "Distorsion", bundle: .main), value: $demonVoiceParams.distortion, range: 0...100, format: "%.0f%%")
                effectSlider(icon: "drop.halffull", label: String(localized: "audio.effects.slider.reverb", defaultValue: "Reverb", bundle: .main), value: $demonVoiceParams.reverb, range: 0...100, format: "%.0f%%")
            }
            .adaptiveOnChange(of: demonVoiceParams) { _, params in
                debouncedUpdate(.demonVoice(params))
            }

        case .backSound:
            VStack(spacing: 10) {
                soundSelector
                effectSlider(icon: "speaker.wave.2", label: String(localized: "audio.effects.slider.volume", defaultValue: "Volume", bundle: .main), value: $backSoundParams.volume, range: 0...100, format: "%.0f%%")
            }
            .adaptiveOnChange(of: backSoundParams) { _, params in
                debouncedUpdate(.backSound(params))
            }

        case nil:
            EmptyView()
        }
    }

    // MARK: - Sound Selector

    private var soundSelector: some View {
        HStack(spacing: 8) {
            ForEach(["rain", "cafe", "nature"], id: \.self) { sound in
                let isActive = backSoundParams.soundFile == sound
                Button {
                    backSoundParams.soundFile = sound
                } label: {
                    Text(soundLabel(sound))
                        .font(MeeshyFont.relative(11, weight: .medium))
                        .foregroundColor(isActive ? MeeshyColors.indigo500 : .secondary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(
                            Capsule()
                                .fill(isActive ? MeeshyColors.indigo500.opacity(0.12) : Color.primary.opacity(0.05))
                        )
                }
                .accessibilityAddTraits(isActive ? .isSelected : [])
            }
        }
    }

    private func soundLabel(_ key: String) -> String {
        switch key {
        case "rain": return String(localized: "audio.effects.sound.rain", defaultValue: "Pluie", bundle: .main)
        case "cafe": return String(localized: "audio.effects.sound.cafe", defaultValue: "Cafe", bundle: .main)
        case "nature": return String(localized: "audio.effects.sound.nature", defaultValue: "Nature", bundle: .main)
        default: return key
        }
    }

    // MARK: - Slider Helper

    private func effectSlider(icon: String, label: String, value: Binding<Float>, range: ClosedRange<Float>, format: String) -> some View {
        // Rangée de mixer compacte à largeurs figées (icône 18 / libellé 55 /
        // valeur 42) : les polices restent FIXES à dessein — les scaler dans ces
        // cadres rigides tronquerait le libellé/la valeur à grande taille Dynamic
        // Type. L'accessibilité est déjà servie par le `Slider` lui-même
        // (`accessibilityLabel(label)` + `accessibilityValue`), donc le libellé/
        // la valeur visibles sont purement visuels et l'icône est décorative.
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(11, weight: .medium))
                .foregroundColor(MeeshyColors.indigo400)
                .frame(width: 18)
                .accessibilityHidden(true)
            Text(label)
                .font(MeeshyFont.relative(12, weight: .medium))
                .foregroundColor(.secondary)
                .frame(width: 55, alignment: .leading)
            Slider(value: value, in: range)
                .tint(MeeshyColors.indigo500)
                .accessibilityLabel(label)
                .accessibilityValue(String(format: format, value.wrappedValue))
            Text(String(format: format, value.wrappedValue))
                .font(MeeshyFont.relative(11, weight: .medium).monospacedDigit())
                .foregroundColor(.secondary)
                .frame(width: 42, alignment: .trailing)
        }
    }

    // MARK: - Apply Effect

    private func applyEffect(_ type: AudioEffectType?) {
        guard let type else {
            callManager.clearAudioEffect()
            return
        }
        let config: AudioEffectConfig = switch type {
        case .voiceCoder: .voiceCoder(voiceCoderParams)
        case .babyVoice: .babyVoice(babyVoiceParams)
        case .demonVoice: .demonVoice(demonVoiceParams)
        case .backSound: .backSound(backSoundParams)
        }
        callManager.setAudioEffect(config)
    }

    // MARK: - Debounced Update

    private func debouncedUpdate(_ config: AudioEffectConfig) {
        debounceTask?.cancel()
        debounceTask = Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(150))
            guard !Task.isCancelled else { return }
            callManager.updateAudioEffectParams(config)
        }
    }
}
