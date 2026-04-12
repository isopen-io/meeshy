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
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 16)
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: selectedEffect)
        .onAppear {
            selectedEffect = callManager.activeAudioEffect?.effectType
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: "waveform.path.ecg")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(MeeshyColors.indigo400)
            Text("Effets audio")
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .foregroundColor(.primary)
            Spacer()
            if callManager.activeAudioEffect != nil {
                Button {
                    selectedEffect = nil
                    callManager.clearAudioEffect()
                } label: {
                    Text("Desactiver")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(MeeshyColors.error)
                }
            }
        }
    }

    // MARK: - Effect Selector

    private var effectSelector: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                effectChip(label: "Off", icon: "speaker.slash", type: nil)
                effectChip(label: "Auto-tune", icon: "waveform.path.ecg", type: .voiceCoder)
                effectChip(label: "Baby", icon: "face.smiling", type: .babyVoice)
                effectChip(label: "Demon", icon: "flame", type: .demonVoice)
                effectChip(label: "Ambiance", icon: "music.note", type: .backSound)
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
                    .font(.system(size: 12, weight: .semibold))
                Text(label)
                    .font(.system(size: 12, weight: .medium))
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
    }

    // MARK: - Parameter Sliders

    @ViewBuilder
    private var parameterSliders: some View {
        switch selectedEffect {
        case .voiceCoder:
            VStack(spacing: 10) {
                effectSlider(icon: "arrow.up.arrow.down", label: "Pitch", value: $voiceCoderParams.pitch, range: -12...12, format: "%.0f st")
                effectSlider(icon: "dial.medium", label: "Force", value: $voiceCoderParams.strength, range: 0...100, format: "%.0f%%")
                effectSlider(icon: "metronome", label: "Retune", value: $voiceCoderParams.retuneSpeed, range: 0...100, format: "%.0f%%")
            }
            .onChange(of: voiceCoderParams) { _, params in
                debouncedUpdate(.voiceCoder(params))
            }

        case .babyVoice:
            VStack(spacing: 10) {
                effectSlider(icon: "arrow.up", label: "Pitch", value: $babyVoiceParams.pitch, range: 6...12, format: "+%.0f st")
                effectSlider(icon: "waveform", label: "Formant", value: $babyVoiceParams.formant, range: 1.2...1.5, format: "%.2fx")
                effectSlider(icon: "wind", label: "Souffle", value: $babyVoiceParams.breathiness, range: 0...100, format: "%.0f%%")
            }
            .onChange(of: babyVoiceParams) { _, params in
                debouncedUpdate(.babyVoice(params))
            }

        case .demonVoice:
            VStack(spacing: 10) {
                effectSlider(icon: "arrow.down", label: "Pitch", value: $demonVoiceParams.pitch, range: -12...(-8), format: "%.0f st")
                effectSlider(icon: "bolt.fill", label: "Distorsion", value: $demonVoiceParams.distortion, range: 0...100, format: "%.0f%%")
                effectSlider(icon: "drop.halffull", label: "Reverb", value: $demonVoiceParams.reverb, range: 0...100, format: "%.0f%%")
            }
            .onChange(of: demonVoiceParams) { _, params in
                debouncedUpdate(.demonVoice(params))
            }

        case .backSound:
            VStack(spacing: 10) {
                soundSelector
                effectSlider(icon: "speaker.wave.2", label: "Volume", value: $backSoundParams.volume, range: 0...100, format: "%.0f%%")
            }
            .onChange(of: backSoundParams) { _, params in
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
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(isActive ? MeeshyColors.indigo500 : .secondary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(
                            Capsule()
                                .fill(isActive ? MeeshyColors.indigo500.opacity(0.12) : Color.primary.opacity(0.05))
                        )
                }
            }
        }
    }

    private func soundLabel(_ key: String) -> String {
        switch key {
        case "rain": return "Pluie"
        case "cafe": return "Cafe"
        case "nature": return "Nature"
        default: return key
        }
    }

    // MARK: - Slider Helper

    private func effectSlider(icon: String, label: String, value: Binding<Float>, range: ClosedRange<Float>, format: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(MeeshyColors.indigo400)
                .frame(width: 18)
            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.secondary)
                .frame(width: 55, alignment: .leading)
            Slider(value: value, in: range)
                .tint(MeeshyColors.indigo500)
            Text(String(format: format, value.wrappedValue))
                .font(.system(size: 11, weight: .medium).monospacedDigit())
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
