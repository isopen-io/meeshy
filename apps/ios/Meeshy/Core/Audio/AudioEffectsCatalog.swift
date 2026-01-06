//
//  AudioEffectsCatalog.swift
//  Meeshy
//
//  Centralized catalog of all audio effects available in the app.
//  Used for voice messages, audio editing, and real-time call effects.
//
//  iOS 16+
//

import SwiftUI
import AVFoundation

// MARK: - Audio Effect Category

/// Categories of audio effects for organization
enum AudioEffectCategory: String, CaseIterable, Identifiable {
    case voice = "Voice"
    case environment = "Environment"
    case creative = "Creative"
    case utility = "Utility"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .voice: return "person.wave.2"
        case .environment: return "building.2"
        case .creative: return "sparkles"
        case .utility: return "slider.horizontal.3"
        }
    }

    var localizedName: String {
        switch self {
        case .voice: return "Voix"
        case .environment: return "Environnement"
        case .creative: return "Créatif"
        case .utility: return "Utilitaire"
        }
    }
}

// MARK: - Audio Effect Type

/// All available audio effects in the application
enum AudioEffectType: String, CaseIterable, Identifiable, Codable {
    // Voice Effects
    case normal = "normal"
    case deep = "deep"
    case chipmunk = "chipmunk"
    case babyVoice = "baby_voice"
    case robot = "robot"
    case vocoder = "vocoder"
    case demonic = "demonic"
    case angel = "angel"

    // Environment Effects
    case echo = "echo"
    case reverb = "reverb"
    case stadium = "stadium"
    case cave = "cave"
    case telephone = "telephone"
    case underwater = "underwater"

    // Creative Effects
    case radio = "radio"
    case megaphone = "megaphone"
    case whisper = "whisper"
    case alien = "alien"

    var id: String { rawValue }
}

// MARK: - Audio Effect Definition

/// Complete definition of an audio effect with all properties
struct AudioEffectDefinition: Identifiable, Hashable {
    let type: AudioEffectType
    let category: AudioEffectCategory
    let icon: String
    let color: Color
    let colorHex: String
    let isPremium: Bool

    var id: String { type.rawValue }

    /// Localized display name
    var displayName: String {
        switch type {
        case .normal: return "Normal"
        case .deep: return "Grave"
        case .chipmunk: return "Chipmunk"
        case .babyVoice: return "Bébé"
        case .robot: return "Robot"
        case .vocoder: return "Vocoder"
        case .demonic: return "Démoniaque"
        case .angel: return "Ange"
        case .echo: return "Écho"
        case .reverb: return "Réverb"
        case .stadium: return "Stade"
        case .cave: return "Caverne"
        case .telephone: return "Téléphone"
        case .underwater: return "Sous-marin"
        case .radio: return "Radio"
        case .megaphone: return "Mégaphone"
        case .whisper: return "Chuchotement"
        case .alien: return "Alien"
        }
    }

    /// Short description of the effect
    var description: String {
        switch type {
        case .normal: return "Voix originale sans modification"
        case .deep: return "Voix grave et profonde"
        case .chipmunk: return "Voix aiguë et rapide"
        case .babyVoice: return "Voix douce et enfantine"
        case .robot: return "Voix métallique robotique"
        case .vocoder: return "Synthétiseur vocal électronique"
        case .demonic: return "Voix grave et distordue effrayante"
        case .angel: return "Voix douce avec réverbération céleste"
        case .echo: return "Répétition du son avec délai"
        case .reverb: return "Résonance naturelle d'espace"
        case .stadium: return "Écho de grand stade"
        case .cave: return "Résonance de caverne profonde"
        case .telephone: return "Qualité audio téléphonique rétro"
        case .underwater: return "Son étouffé sous l'eau"
        case .radio: return "Qualité radio vintage"
        case .megaphone: return "Effet haut-parleur puissant"
        case .whisper: return "Effet de chuchotement intimiste"
        case .alien: return "Voix extraterrestre modulée"
        }
    }

    // MARK: - Hashable

    func hash(into hasher: inout Hasher) {
        hasher.combine(type)
    }

    static func == (lhs: AudioEffectDefinition, rhs: AudioEffectDefinition) -> Bool {
        lhs.type == rhs.type
    }
}

// MARK: - Audio Effects Catalog

/// Central catalog providing access to all audio effects
final class AudioEffectsCatalog {

    // MARK: - Singleton

    static let shared = AudioEffectsCatalog()

    private init() {}

    // MARK: - All Effects

    /// All available effects with their definitions
    let allEffects: [AudioEffectDefinition] = [
        // Voice Effects
        AudioEffectDefinition(
            type: .normal,
            category: .voice,
            icon: "waveform",
            color: .gray,
            colorHex: "8E8E93",
            isPremium: false
        ),
        AudioEffectDefinition(
            type: .deep,
            category: .voice,
            icon: "waveform.badge.minus",
            color: .indigo,
            colorHex: "5856D6",
            isPremium: false
        ),
        AudioEffectDefinition(
            type: .chipmunk,
            category: .voice,
            icon: "hare",
            color: .orange,
            colorHex: "FF9500",
            isPremium: false
        ),
        AudioEffectDefinition(
            type: .babyVoice,
            category: .voice,
            icon: "face.smiling",
            color: .pink,
            colorHex: "FF2D55",
            isPremium: false
        ),
        AudioEffectDefinition(
            type: .robot,
            category: .voice,
            icon: "cpu",
            color: .cyan,
            colorHex: "32ADE6",
            isPremium: false
        ),
        AudioEffectDefinition(
            type: .vocoder,
            category: .voice,
            icon: "pianokeys",
            color: .purple,
            colorHex: "AF52DE",
            isPremium: true
        ),
        AudioEffectDefinition(
            type: .demonic,
            category: .voice,
            icon: "flame.fill",
            color: .red,
            colorHex: "FF3B30",
            isPremium: true
        ),
        AudioEffectDefinition(
            type: .angel,
            category: .voice,
            icon: "sparkles",
            color: Color(red: 1.0, green: 0.84, blue: 0.0),
            colorHex: "FFD700",
            isPremium: true
        ),

        // Environment Effects
        AudioEffectDefinition(
            type: .echo,
            category: .environment,
            icon: "waveform.badge.plus",
            color: .blue,
            colorHex: "007AFF",
            isPremium: false
        ),
        AudioEffectDefinition(
            type: .reverb,
            category: .environment,
            icon: "waveform.path",
            color: .teal,
            colorHex: "30B0C7",
            isPremium: false
        ),
        AudioEffectDefinition(
            type: .stadium,
            category: .environment,
            icon: "building.columns",
            color: .green,
            colorHex: "34C759",
            isPremium: false
        ),
        AudioEffectDefinition(
            type: .cave,
            category: .environment,
            icon: "mountain.2",
            color: .brown,
            colorHex: "A2845E",
            isPremium: true
        ),
        AudioEffectDefinition(
            type: .telephone,
            category: .environment,
            icon: "phone",
            color: .mint,
            colorHex: "00C7BE",
            isPremium: false
        ),
        AudioEffectDefinition(
            type: .underwater,
            category: .environment,
            icon: "drop.fill",
            color: .blue.opacity(0.7),
            colorHex: "5AC8FA",
            isPremium: true
        ),

        // Creative Effects
        AudioEffectDefinition(
            type: .radio,
            category: .creative,
            icon: "radio",
            color: .yellow,
            colorHex: "FFCC00",
            isPremium: false
        ),
        AudioEffectDefinition(
            type: .megaphone,
            category: .creative,
            icon: "megaphone",
            color: .orange,
            colorHex: "FF9500",
            isPremium: false
        ),
        AudioEffectDefinition(
            type: .whisper,
            category: .creative,
            icon: "bubble.left",
            color: .gray,
            colorHex: "8E8E93",
            isPremium: true
        ),
        AudioEffectDefinition(
            type: .alien,
            category: .creative,
            icon: "antenna.radiowaves.left.and.right",
            color: .green,
            colorHex: "30D158",
            isPremium: true
        )
    ]

    // MARK: - Accessors

    /// Get effect definition by type
    func effect(for type: AudioEffectType) -> AudioEffectDefinition? {
        allEffects.first { $0.type == type }
    }

    /// Get all effects in a category
    func effects(in category: AudioEffectCategory) -> [AudioEffectDefinition] {
        allEffects.filter { $0.category == category }
    }

    /// Get all free effects
    var freeEffects: [AudioEffectDefinition] {
        allEffects.filter { !$0.isPremium }
    }

    /// Get all premium effects
    var premiumEffects: [AudioEffectDefinition] {
        allEffects.filter { $0.isPremium }
    }

    /// Get effects for voice message editing (commonly used)
    var voiceMessageEffects: [AudioEffectDefinition] {
        [
            effect(for: .normal)!,
            effect(for: .echo)!,
            effect(for: .reverb)!,
            effect(for: .robot)!,
            effect(for: .chipmunk)!,
            effect(for: .deep)!,
            effect(for: .babyVoice)!,
            effect(for: .vocoder)!,
            effect(for: .demonic)!,
            effect(for: .angel)!,
            effect(for: .telephone)!,
            effect(for: .stadium)!
        ]
    }

    /// Get effects for real-time call audio
    var callEffects: [AudioEffectDefinition] {
        [
            effect(for: .normal)!,
            effect(for: .deep)!,
            effect(for: .chipmunk)!,
            effect(for: .robot)!,
            effect(for: .vocoder)!,
            effect(for: .demonic)!,
            effect(for: .angel)!,
            effect(for: .babyVoice)!
        ]
    }
}

// MARK: - Audio Effect Processor

/// Processor that applies audio effects using AVAudioEngine
final class AudioEffectProcessor {

    // MARK: - Singleton

    static let shared = AudioEffectProcessor()

    private init() {}

    // MARK: - Effect Chain Setup

    /// Setup effect chain on an AVAudioEngine for the given effect type
    /// - Parameters:
    ///   - engine: The audio engine to setup
    ///   - playerNode: The player node to connect
    ///   - format: The audio format to use
    ///   - effectType: The type of effect to apply
    /// - Returns: Array of effect nodes that were attached
    func setupEffectChain(
        engine: AVAudioEngine,
        playerNode: AVAudioPlayerNode,
        format: AVAudioFormat,
        effectType: AudioEffectType
    ) -> [AVAudioNode] {
        var effectNodes: [AVAudioNode] = []

        switch effectType {
        case .normal:
            engine.connect(playerNode, to: engine.mainMixerNode, format: format)

        case .deep:
            let timePitch = AVAudioUnitTimePitch()
            timePitch.pitch = -600 // Lower pitch
            timePitch.rate = 1.0
            engine.attach(timePitch)
            engine.connect(playerNode, to: timePitch, format: format)
            engine.connect(timePitch, to: engine.mainMixerNode, format: format)
            effectNodes.append(timePitch)

        case .chipmunk:
            let timePitch = AVAudioUnitTimePitch()
            timePitch.pitch = 1000 // Higher pitch
            timePitch.rate = 1.0
            engine.attach(timePitch)
            engine.connect(playerNode, to: timePitch, format: format)
            engine.connect(timePitch, to: engine.mainMixerNode, format: format)
            effectNodes.append(timePitch)

        case .babyVoice:
            // Baby voice: higher pitch with slight reverb
            let timePitch = AVAudioUnitTimePitch()
            timePitch.pitch = 700 // Higher but not as extreme as chipmunk
            timePitch.rate = 0.95 // Slightly slower
            let reverb = AVAudioUnitReverb()
            reverb.loadFactoryPreset(.smallRoom)
            reverb.wetDryMix = 20
            engine.attach(timePitch)
            engine.attach(reverb)
            engine.connect(playerNode, to: timePitch, format: format)
            engine.connect(timePitch, to: reverb, format: format)
            engine.connect(reverb, to: engine.mainMixerNode, format: format)
            effectNodes.append(contentsOf: [timePitch, reverb])

        case .robot:
            let distortion = AVAudioUnitDistortion()
            distortion.loadFactoryPreset(.speechRadioTower)
            distortion.wetDryMix = 30
            let timePitch = AVAudioUnitTimePitch()
            timePitch.pitch = -100
            engine.attach(distortion)
            engine.attach(timePitch)
            engine.connect(playerNode, to: distortion, format: format)
            engine.connect(distortion, to: timePitch, format: format)
            engine.connect(timePitch, to: engine.mainMixerNode, format: format)
            effectNodes.append(contentsOf: [distortion, timePitch])

        case .vocoder:
            // Vocoder effect: combines distortion with modulation-like processing
            let distortion = AVAudioUnitDistortion()
            distortion.loadFactoryPreset(.speechWaves)
            distortion.wetDryMix = 50
            let delay = AVAudioUnitDelay()
            delay.delayTime = 0.02 // Very short delay for modulation feel
            delay.feedback = 60
            delay.wetDryMix = 30
            let eq = AVAudioUnitEQ(numberOfBands: 1)
            eq.bands[0].filterType = .bandPass
            eq.bands[0].frequency = 1500
            eq.bands[0].bandwidth = 2.0
            eq.bands[0].bypass = false
            engine.attach(distortion)
            engine.attach(delay)
            engine.attach(eq)
            engine.connect(playerNode, to: eq, format: format)
            engine.connect(eq, to: distortion, format: format)
            engine.connect(distortion, to: delay, format: format)
            engine.connect(delay, to: engine.mainMixerNode, format: format)
            effectNodes.append(contentsOf: [eq, distortion, delay])

        case .demonic:
            // Demonic: very low pitch with distortion and reverb
            let timePitch = AVAudioUnitTimePitch()
            timePitch.pitch = -1000 // Very low
            timePitch.rate = 0.9 // Slightly slower
            let distortion = AVAudioUnitDistortion()
            distortion.loadFactoryPreset(.drumsBufferBeats)
            distortion.wetDryMix = 25
            let reverb = AVAudioUnitReverb()
            reverb.loadFactoryPreset(.cathedral)
            reverb.wetDryMix = 40
            engine.attach(timePitch)
            engine.attach(distortion)
            engine.attach(reverb)
            engine.connect(playerNode, to: timePitch, format: format)
            engine.connect(timePitch, to: distortion, format: format)
            engine.connect(distortion, to: reverb, format: format)
            engine.connect(reverb, to: engine.mainMixerNode, format: format)
            effectNodes.append(contentsOf: [timePitch, distortion, reverb])

        case .angel:
            // Angel: slightly higher pitch with heavenly reverb and shimmer
            let timePitch = AVAudioUnitTimePitch()
            timePitch.pitch = 300 // Slightly higher
            let reverb = AVAudioUnitReverb()
            reverb.loadFactoryPreset(.cathedral)
            reverb.wetDryMix = 60 // More reverb for ethereal sound
            let delay = AVAudioUnitDelay()
            delay.delayTime = 0.15
            delay.feedback = 40
            delay.wetDryMix = 25
            engine.attach(timePitch)
            engine.attach(reverb)
            engine.attach(delay)
            engine.connect(playerNode, to: timePitch, format: format)
            engine.connect(timePitch, to: delay, format: format)
            engine.connect(delay, to: reverb, format: format)
            engine.connect(reverb, to: engine.mainMixerNode, format: format)
            effectNodes.append(contentsOf: [timePitch, delay, reverb])

        case .echo:
            let delay = AVAudioUnitDelay()
            delay.delayTime = 0.3
            delay.feedback = 50
            delay.wetDryMix = 40
            engine.attach(delay)
            engine.connect(playerNode, to: delay, format: format)
            engine.connect(delay, to: engine.mainMixerNode, format: format)
            effectNodes.append(delay)

        case .reverb:
            let reverb = AVAudioUnitReverb()
            reverb.loadFactoryPreset(.largeHall)
            reverb.wetDryMix = 50
            engine.attach(reverb)
            engine.connect(playerNode, to: reverb, format: format)
            engine.connect(reverb, to: engine.mainMixerNode, format: format)
            effectNodes.append(reverb)

        case .stadium:
            let reverb = AVAudioUnitReverb()
            reverb.loadFactoryPreset(.cathedral)
            reverb.wetDryMix = 70
            engine.attach(reverb)
            engine.connect(playerNode, to: reverb, format: format)
            engine.connect(reverb, to: engine.mainMixerNode, format: format)
            effectNodes.append(reverb)

        case .cave:
            let reverb = AVAudioUnitReverb()
            reverb.loadFactoryPreset(.largeHall2)
            reverb.wetDryMix = 80
            let delay = AVAudioUnitDelay()
            delay.delayTime = 0.5
            delay.feedback = 60
            delay.wetDryMix = 30
            engine.attach(reverb)
            engine.attach(delay)
            engine.connect(playerNode, to: delay, format: format)
            engine.connect(delay, to: reverb, format: format)
            engine.connect(reverb, to: engine.mainMixerNode, format: format)
            effectNodes.append(contentsOf: [delay, reverb])

        case .telephone:
            let eq = AVAudioUnitEQ(numberOfBands: 2)
            eq.bands[0].filterType = .highPass
            eq.bands[0].frequency = 300
            eq.bands[0].bypass = false
            eq.bands[1].filterType = .lowPass
            eq.bands[1].frequency = 3400
            eq.bands[1].bypass = false
            let distortion = AVAudioUnitDistortion()
            distortion.loadFactoryPreset(.speechCosmicInterference)
            distortion.wetDryMix = 15
            engine.attach(eq)
            engine.attach(distortion)
            engine.connect(playerNode, to: eq, format: format)
            engine.connect(eq, to: distortion, format: format)
            engine.connect(distortion, to: engine.mainMixerNode, format: format)
            effectNodes.append(contentsOf: [eq, distortion])

        case .underwater:
            // Underwater: muffled with low-pass filter and subtle modulation
            let eq = AVAudioUnitEQ(numberOfBands: 1)
            eq.bands[0].filterType = .lowPass
            eq.bands[0].frequency = 800
            eq.bands[0].bypass = false
            let reverb = AVAudioUnitReverb()
            reverb.loadFactoryPreset(.mediumRoom)
            reverb.wetDryMix = 40
            let delay = AVAudioUnitDelay()
            delay.delayTime = 0.05
            delay.feedback = 30
            delay.wetDryMix = 20
            engine.attach(eq)
            engine.attach(reverb)
            engine.attach(delay)
            engine.connect(playerNode, to: eq, format: format)
            engine.connect(eq, to: delay, format: format)
            engine.connect(delay, to: reverb, format: format)
            engine.connect(reverb, to: engine.mainMixerNode, format: format)
            effectNodes.append(contentsOf: [eq, delay, reverb])

        case .radio:
            // Vintage radio: band-limited with slight distortion
            let eq = AVAudioUnitEQ(numberOfBands: 2)
            eq.bands[0].filterType = .highPass
            eq.bands[0].frequency = 200
            eq.bands[0].bypass = false
            eq.bands[1].filterType = .lowPass
            eq.bands[1].frequency = 4000
            eq.bands[1].bypass = false
            let distortion = AVAudioUnitDistortion()
            distortion.loadFactoryPreset(.speechAlienChatter)
            distortion.wetDryMix = 10
            engine.attach(eq)
            engine.attach(distortion)
            engine.connect(playerNode, to: eq, format: format)
            engine.connect(eq, to: distortion, format: format)
            engine.connect(distortion, to: engine.mainMixerNode, format: format)
            effectNodes.append(contentsOf: [eq, distortion])

        case .megaphone:
            // Megaphone: band-limited with strong mid frequencies
            let eq = AVAudioUnitEQ(numberOfBands: 3)
            eq.bands[0].filterType = .highPass
            eq.bands[0].frequency = 400
            eq.bands[0].bypass = false
            eq.bands[1].filterType = .parametric
            eq.bands[1].frequency = 2000
            eq.bands[1].gain = 6
            eq.bands[1].bypass = false
            eq.bands[2].filterType = .lowPass
            eq.bands[2].frequency = 5000
            eq.bands[2].bypass = false
            let distortion = AVAudioUnitDistortion()
            distortion.loadFactoryPreset(.speechGoldenPi)
            distortion.wetDryMix = 20
            engine.attach(eq)
            engine.attach(distortion)
            engine.connect(playerNode, to: eq, format: format)
            engine.connect(eq, to: distortion, format: format)
            engine.connect(distortion, to: engine.mainMixerNode, format: format)
            effectNodes.append(contentsOf: [eq, distortion])

        case .whisper:
            // Whisper: low volume, high frequencies emphasized, breathy
            let eq = AVAudioUnitEQ(numberOfBands: 2)
            eq.bands[0].filterType = .highPass
            eq.bands[0].frequency = 500
            eq.bands[0].bypass = false
            eq.bands[1].filterType = .highShelf
            eq.bands[1].frequency = 4000
            eq.bands[1].gain = 4
            eq.bands[1].bypass = false
            let reverb = AVAudioUnitReverb()
            reverb.loadFactoryPreset(.smallRoom)
            reverb.wetDryMix = 30
            engine.attach(eq)
            engine.attach(reverb)
            engine.connect(playerNode, to: eq, format: format)
            engine.connect(eq, to: reverb, format: format)
            engine.connect(reverb, to: engine.mainMixerNode, format: format)
            effectNodes.append(contentsOf: [eq, reverb])

        case .alien:
            // Alien: modulated pitch with ring modulator-like effect
            let timePitch = AVAudioUnitTimePitch()
            timePitch.pitch = 400
            timePitch.rate = 1.1
            let distortion = AVAudioUnitDistortion()
            distortion.loadFactoryPreset(.speechWaves)
            distortion.wetDryMix = 35
            let delay = AVAudioUnitDelay()
            delay.delayTime = 0.03
            delay.feedback = 70
            delay.wetDryMix = 25
            engine.attach(timePitch)
            engine.attach(distortion)
            engine.attach(delay)
            engine.connect(playerNode, to: timePitch, format: format)
            engine.connect(timePitch, to: distortion, format: format)
            engine.connect(distortion, to: delay, format: format)
            engine.connect(delay, to: engine.mainMixerNode, format: format)
            effectNodes.append(contentsOf: [timePitch, distortion, delay])
        }

        return effectNodes
    }
}

// MARK: - Audio Effect Button View

/// Reusable button component for selecting an audio effect
struct AudioEffectButton: View {
    let effect: AudioEffectDefinition
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                ZStack {
                    Circle()
                        .fill(isSelected ? effect.color : Color.white.opacity(0.15))
                        .frame(width: 56, height: 56)

                    Image(systemName: effect.icon)
                        .font(.system(size: 22))
                        .foregroundColor(isSelected ? .white : .white.opacity(0.8))

                    // Premium badge
                    if effect.isPremium {
                        Image(systemName: "star.fill")
                            .font(.system(size: 10))
                            .foregroundColor(.yellow)
                            .offset(x: 20, y: -20)
                    }
                }

                Text(effect.displayName)
                    .font(.system(size: 11, weight: isSelected ? .semibold : .regular))
                    .foregroundColor(isSelected ? effect.color : .white.opacity(0.8))
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Audio Effect Picker View

/// Horizontal scrollable picker for audio effects
struct AudioEffectPicker: View {
    @Binding var selectedEffect: AudioEffectType
    let effects: [AudioEffectDefinition]
    let showPremiumBadge: Bool

    init(
        selectedEffect: Binding<AudioEffectType>,
        effects: [AudioEffectDefinition]? = nil,
        showPremiumBadge: Bool = true
    ) {
        self._selectedEffect = selectedEffect
        self.effects = effects ?? AudioEffectsCatalog.shared.voiceMessageEffects
        self.showPremiumBadge = showPremiumBadge
    }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(effects) { effect in
                    AudioEffectButton(
                        effect: effect,
                        isSelected: selectedEffect == effect.type
                    ) {
                        selectedEffect = effect.type
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    }
                }
            }
            .padding(.horizontal, 16)
        }
    }
}

// MARK: - Audio Effects Grid View

/// Grid view for displaying all audio effects by category
struct AudioEffectsGridView: View {
    @Binding var selectedEffect: AudioEffectType
    let columns = [
        GridItem(.flexible()),
        GridItem(.flexible()),
        GridItem(.flexible()),
        GridItem(.flexible())
    ]

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 24) {
                ForEach(AudioEffectCategory.allCases) { category in
                    let categoryEffects = AudioEffectsCatalog.shared.effects(in: category)
                    if !categoryEffects.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            // Category header
                            HStack(spacing: 8) {
                                Image(systemName: category.icon)
                                    .foregroundColor(.secondary)
                                Text(category.localizedName)
                                    .font(.headline)
                                    .foregroundColor(.primary)
                            }
                            .padding(.horizontal, 16)

                            // Effects grid
                            LazyVGrid(columns: columns, spacing: 16) {
                                ForEach(categoryEffects) { effect in
                                    AudioEffectGridItem(
                                        effect: effect,
                                        isSelected: selectedEffect == effect.type
                                    ) {
                                        selectedEffect = effect.type
                                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                    }
                                }
                            }
                            .padding(.horizontal, 16)
                        }
                    }
                }
            }
            .padding(.vertical, 16)
        }
    }
}

/// Grid item for audio effect
private struct AudioEffectGridItem: View {
    let effect: AudioEffectDefinition
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(isSelected ? effect.color : Color(.systemGray5))
                        .frame(width: 60, height: 60)

                    Image(systemName: effect.icon)
                        .font(.system(size: 24))
                        .foregroundColor(isSelected ? .white : .primary)

                    if effect.isPremium {
                        Image(systemName: "star.fill")
                            .font(.system(size: 8))
                            .foregroundColor(.yellow)
                            .offset(x: 22, y: -22)
                    }
                }

                Text(effect.displayName)
                    .font(.system(size: 10, weight: isSelected ? .semibold : .regular))
                    .foregroundColor(isSelected ? effect.color : .secondary)
                    .lineLimit(1)
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Preview

#Preview("Effect Picker") {
    ZStack {
        Color.black.ignoresSafeArea()

        VStack {
            AudioEffectPicker(
                selectedEffect: .constant(.robot)
            )
        }
    }
}

#Preview("Effects Grid") {
    AudioEffectsGridView(selectedEffect: .constant(.normal))
}
