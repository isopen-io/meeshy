import SwiftUI

/// Per-clip editor surface. Stateless on its own — receives a snapshot, emits
/// callbacks for every field commit. The owning container (`QuickTimelineView`
/// or `ProTimelineView`) wires those callbacks back to `TimelineViewModel`.
///
/// ### State sync contract
/// The inspector holds local `@State` for the slider/toggle values to keep
/// in-flight gestures smooth (a single drag must not be interrupted by an
/// external snapshot push). However, when the upstream `clip` changes for
/// non-edit reasons — most importantly **undo/redo** — the local `@State`
/// MUST resync to the new snapshot, otherwise the UI shows stale values.
///
/// SwiftUI does NOT re-run `init` when only `clip` changes (the view's
/// identity is preserved), so the resync is implemented via `.adaptiveOnChange(of:)`
/// inside `body`. See `test_inspector_clipChanges_stateResyncs`.
public struct ClipInspector: View {

    // MARK: - Snapshot

    public struct ClipSnapshot: Equatable, Sendable {
        public enum Kind: String, Sendable, Equatable { case video, audio, text, image }
        public let id: String
        public let displayName: String
        public let kind: Kind
        public let startTime: Float
        public let duration: Float
        public let volume: Float
        public let fadeInDuration: Float
        public let fadeOutDuration: Float
        public let isLooping: Bool
        public let isBackground: Bool

        public init(id: String, displayName: String, kind: Kind,
                    startTime: Float, duration: Float, volume: Float,
                    fadeInDuration: Float, fadeOutDuration: Float,
                    isLooping: Bool, isBackground: Bool) {
            self.id = id; self.displayName = displayName; self.kind = kind
            self.startTime = startTime; self.duration = duration
            self.volume = volume
            self.fadeInDuration = fadeInDuration; self.fadeOutDuration = fadeOutDuration
            self.isLooping = isLooping; self.isBackground = isBackground
        }
    }

    public static let fadeRange: ClosedRange<Float> = 0...3

    public let presentation: InspectorPresentation
    public let clip: ClipSnapshot
    public let onVolumeChanged: (Float) -> Void
    public let onFadeInChanged: (Float) -> Void
    public let onFadeOutChanged: (Float) -> Void
    public let onLoopToggled: (Bool) -> Void
    public let onBackgroundToggled: (Bool) -> Void
    public let onAddKeyframe: () -> Void
    public let onDelete: () -> Void
    /// Ferme l'inspecteur (désélection) — la modale était infermable :
    /// aucune affordance, seul un tap hasardeux hors clip la faisait
    /// disparaître (retour user 2026-07-11).
    public let onClose: () -> Void
    /// Ajustement du DÉBUT par pas (déplace le clip, durée constante).
    public let onStartAdjusted: (Float) -> Void
    /// Ajustement de la DURÉE par pas (la fin bouge, le début reste).
    public let onDurationAdjusted: (Float) -> Void

    /// Pas des steppers début/durée.
    public static let timeStep: Float = 0.1

    @State private var volume: Float
    @State private var fadeIn: Float
    @State private var fadeOut: Float
    @State private var loop: Bool
    @State private var background: Bool

    public init(presentation: InspectorPresentation,
                clip: ClipSnapshot,
                onVolumeChanged: @escaping (Float) -> Void,
                onFadeInChanged: @escaping (Float) -> Void,
                onFadeOutChanged: @escaping (Float) -> Void,
                onLoopToggled: @escaping (Bool) -> Void,
                onBackgroundToggled: @escaping (Bool) -> Void,
                onAddKeyframe: @escaping () -> Void,
                onDelete: @escaping () -> Void,
                onClose: @escaping () -> Void = {},
                onStartAdjusted: @escaping (Float) -> Void = { _ in },
                onDurationAdjusted: @escaping (Float) -> Void = { _ in }) {
        self.presentation = presentation
        self.clip = clip
        self.onVolumeChanged = onVolumeChanged
        self.onFadeInChanged = onFadeInChanged
        self.onFadeOutChanged = onFadeOutChanged
        self.onLoopToggled = onLoopToggled
        self.onBackgroundToggled = onBackgroundToggled
        self.onAddKeyframe = onAddKeyframe
        self.onDelete = onDelete
        self.onClose = onClose
        self.onStartAdjusted = onStartAdjusted
        self.onDurationAdjusted = onDurationAdjusted
        _volume = State(initialValue: clip.volume)
        _fadeIn = State(initialValue: clip.fadeInDuration)
        _fadeOut = State(initialValue: clip.fadeOutDuration)
        _loop = State(initialValue: clip.isLooping)
        _background = State(initialValue: clip.isBackground)
    }

    // MARK: - Test helpers

    public func simulateVolumeCommit(value: Float) {
        onVolumeChanged(min(1, max(0, value)))
    }

    /// Test-only read of the current local `@State` values. Used by
    /// `ClipInspector_StateSyncTests` to verify that `.adaptiveOnChange(of: clip)`
    /// successfully resyncs after an external snapshot change (e.g. undo).
    public struct _StateProbe: Sendable, Equatable {
        public let volume: Float
        public let fadeIn: Float
        public let fadeOut: Float
        public let loop: Bool
        public let background: Bool
    }

    public var _stateSnapshot: _StateProbe {
        _StateProbe(volume: volume, fadeIn: fadeIn, fadeOut: fadeOut, loop: loop, background: background)
    }

    public static func formatTime(seconds: Float) -> String {
        let total = max(0, seconds)
        let minutes = Int(total) / 60
        let remainder = total - Float(minutes * 60)
        return String(format: "%d:%06.3f", minutes, remainder)
    }

    /// True when the clip's media carries audio playback (`.video` or `.audio`).
    /// Image clips have no audio track — exposing the volume slider or loop
    /// toggle for them would surface controls that have no underlying effect.
    /// Exposed at type-level so tests can assert kind→affordance gating
    /// without driving the SwiftUI view body.
    public static func hasAudioAffordances(kind: ClipSnapshot.Kind) -> Bool {
        switch kind {
        case .video, .audio: return true
        case .image, .text:  return false
        }
    }

    /// True when looping a clip makes sense. RÈGLE PRODUIT : la boucle est
    /// réservée au FOND (un fond couvre toute la slide et boucle pour la
    /// remplir) — un clip foreground a une fenêtre début/durée, il ne boucle
    /// jamais. Audio + vidéo uniquement (image/texte : rien à boucler).
    public static func supportsLoop(kind: ClipSnapshot.Kind, isBackground: Bool) -> Bool {
        guard isBackground else { return false }
        switch kind {
        case .video, .audio: return true
        case .image, .text:  return false
        }
    }

    /// VoiceOver label for the inspector container, resolved per clip kind.
    /// Prior to this helper, the label was hardcoded to "Video clip" for every
    /// kind — audio/image/text clips were mis-announced. Exposed at type-level
    /// so tests can assert the kind→label mapping without driving the SwiftUI
    /// view body. See `ClipInspector_AccessibilityKindTests`.
    public static func accessibilityLabel(for kind: ClipSnapshot.Kind) -> String {
        switch kind {
        case .video: return String(localized: "story.timeline.a11y.clip.video", bundle: .module)
        case .audio: return String(localized: "story.timeline.a11y.clip.audio", bundle: .module)
        case .image: return String(localized: "story.timeline.a11y.clip.image", bundle: .module)
        case .text:  return String(localized: "story.timeline.a11y.clip.text",  bundle: .module)
        }
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            metadataRow
            if Self.hasAudioAffordances(kind: clip.kind) {
                volumeSlider
            }
            fadeSliders
            togglesRow
            actionsRow
        }
        .padding(presentation == .popover ? 14 : 18)
        .background(
            RoundedRectangle(cornerRadius: presentation == .popover ? 14 : 0)
                .fill(.ultraThinMaterial)
        )
        .frame(maxWidth: presentation == .popover ? 360 : .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Self.accessibilityLabel(for: clip.kind))
        .adaptiveOnChange(of: clip) { _, newClip in
            volume = newClip.volume
            fadeIn = newClip.fadeInDuration
            fadeOut = newClip.fadeOutDuration
            loop = newClip.isLooping
            background = newClip.isBackground
        }
    }

    // MARK: - Sub-views

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: kindSystemImage)
                .font(.headline)
                .foregroundStyle(MeeshyColors.indigo500)
                .accessibilityHidden(true)
            Text(clip.displayName)
                .font(.headline)
                .lineLimit(1)
                .truncationMode(.middle)
            Spacer(minLength: 0)
            Button(action: onClose) {
                Image(systemName: "xmark.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.secondary)
                    .contentShape(Rectangle().inset(by: -8))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "story.timeline.inspector.close",
                                       defaultValue: "Fermer", bundle: .module))
        }
    }

    private var metadataRow: some View {
        HStack(spacing: 16) {
            steppableTimeField(
                title: String(localized: "story.timeline.inspector.start",
                              defaultValue: "Début", bundle: .module),
                value: clip.startTime,
                onAdjust: onStartAdjusted
            )
            steppableTimeField(
                title: String(localized: "story.timeline.inspector.duration",
                              defaultValue: "Durée", bundle: .module),
                value: clip.duration,
                onAdjust: onDurationAdjusted
            )
        }
    }

    /// Champ temps éditable par pas de ±0,1 s — l'affichage seul rendait la
    /// modale « peu compréhensible » : des valeurs qu'on lit mais qu'on ne
    /// peut pas toucher (retour user 2026-07-11).
    private func steppableTimeField(title: String, value: Float,
                                    onAdjust: @escaping (Float) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title.uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
            HStack(spacing: 6) {
                stepButton(systemName: "minus.circle.fill") { onAdjust(-Self.timeStep) }
                Text(Self.formatTime(seconds: value))
                    .font(.system(.callout, design: .monospaced))
                    .monospacedDigit()
                stepButton(systemName: "plus.circle.fill") { onAdjust(Self.timeStep) }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title) \(Self.formatTime(seconds: value))")
    }

    private func stepButton(systemName: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.body)
                .foregroundStyle(MeeshyColors.indigo400)
                .contentShape(Rectangle().inset(by: -6))
        }
        .buttonStyle(.plain)
    }

    private var volumeSlider: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(String(localized: "story.timeline.inspector.volume", bundle: .module).uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
            Slider(value: $volume, in: 0...1, step: 0.01) { editing in
                if !editing { onVolumeChanged(volume) }
            }
            .tint(MeeshyColors.indigo500)
            .accessibilityValue("\(Int(volume * 100))%")
        }
    }

    /// Durées proposées pour les animations d'entrée/sortie (fondu). `0` = off.
    public static let fadePresets: [Float] = [0, 0.3, 0.5, 1.0, 2.0]

    /// Rattache une valeur legacy arbitraire (ex. 0.4 s posée au slider
    /// d'avant) au preset le plus proche pour l'état sélectionné des chips.
    public nonisolated static func nearestFadePreset(to value: Float) -> Float {
        fadePresets.min(by: { abs($0 - value) < abs($1 - value) }) ?? 0
    }

    /// Animations d'APPARITION / DISPARITION de l'élément — chips de durée
    /// (Off / 0,3 / 0,5 / 1 / 2 s) au lieu des deux sliders anonymes « FADE
    /// IN %@ » (format brut + réglage au pixel peu premium, retours user).
    private var fadeSliders: some View {
        VStack(alignment: .leading, spacing: 8) {
            fadeChipRow(
                title: String(localized: "story.timeline.inspector.fadeIn",
                              defaultValue: "Apparition (fondu)", bundle: .module),
                systemImage: "arrow.down.right.circle",
                value: $fadeIn,
                onCommit: { onFadeInChanged(fadeIn) }
            )
            fadeChipRow(
                title: String(localized: "story.timeline.inspector.fadeOut",
                              defaultValue: "Disparition (fondu)", bundle: .module),
                systemImage: "arrow.up.right.circle",
                value: $fadeOut,
                onCommit: { onFadeOutChanged(fadeOut) }
            )
        }
    }

    private func fadeChipRow(title: String, systemImage: String,
                             value: Binding<Float>, onCommit: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: systemImage)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(MeeshyColors.indigo400)
                    .accessibilityHidden(true)
                Text(title.uppercased())
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            HStack(spacing: 6) {
                ForEach(Self.fadePresets, id: \.self) { preset in
                    let isOn = Self.nearestFadePreset(to: value.wrappedValue) == preset
                    Button {
                        value.wrappedValue = preset
                        onCommit()
                    } label: {
                        Text(preset == 0
                             ? String(localized: "story.timeline.inspector.fade.off",
                                      defaultValue: "off", bundle: .module)
                             : (preset < 1 ? String(format: "%.1f s", preset)
                                           : String(format: "%.0f s", preset)))
                            .font(.caption2.weight(.semibold))
                            .monospacedDigit()
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Capsule().fill(
                                isOn ? MeeshyColors.indigo500 : MeeshyColors.indigo500.opacity(0.14)))
                            .foregroundStyle(isOn ? .white : MeeshyColors.indigo400)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(title) \(preset)s")
                    .accessibilityAddTraits(isOn ? [.isSelected] : [])
                }
            }
        }
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private var togglesRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 24) {
                if Self.supportsLoop(kind: clip.kind, isBackground: background) {
                    Toggle(isOn: Binding(
                        get: { loop },
                        set: { loop = $0; onLoopToggled($0) }
                    )) {
                        Text(String(localized: "story.timeline.inspector.loop",
                                    defaultValue: "Boucle", bundle: .module))
                    }
                    .toggleStyle(.switch)
                    .tint(MeeshyColors.indigo500)
                }

                Toggle(isOn: Binding(
                    get: { background },
                    set: { newValue in
                        background = newValue
                        onBackgroundToggled(newValue)
                        // Règle produit : la boucle n'existe QUE pour le fond.
                        // Un clip qui redevient foreground perd sa boucle.
                        if !newValue, loop {
                            loop = false
                            onLoopToggled(false)
                        }
                    }
                )) {
                    Text(String(localized: "story.timeline.inspector.background",
                                defaultValue: "Fond", bundle: .module))
                }
                .toggleStyle(.switch)
                .tint(MeeshyColors.indigo500)
            }
            // Un fond couvre TOUTE la slide : sa fenêtre début/durée est
            // ignorée en lecture — sans cette phrase, déplacer le clip de
            // fond sur la timeline laissait croire à un départ différé
            // (retour user 2026-07-11). Désactiver « Fond » rend le clip
            // foreground et sa fenêtre redevient effective.
            if background {
                Text(String(localized: "story.timeline.inspector.background.hint",
                            defaultValue: "Le fond couvre toute la slide — début/durée ignorés. Désactivez « Fond » pour caler ce média sur la timeline.",
                            bundle: .module))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var actionsRow: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 12) {
                Button(action: onAddKeyframe) {
                    Label(
                        String(localized: "story.timeline.inspector.animate",
                               defaultValue: "Animer au playhead", bundle: .module),
                        systemImage: "diamond.fill"
                    )
                    .font(.subheadline.weight(.semibold))
                }
                .buttonStyle(.borderedProminent)
                .tint(MeeshyColors.indigo500)
                .accessibilityHint(String(localized: "story.timeline.inspector.animate.hint",
                                          defaultValue: "Pose une étape d'animation à la position de lecture",
                                          bundle: .module))

                Spacer(minLength: 0)

                Button(role: .destructive, action: onDelete) {
                    Label(
                        String(localized: "story.timeline.clip.delete", bundle: .module),
                        systemImage: "trash"
                    )
                    .font(.subheadline.weight(.semibold))
                }
                .tint(MeeshyColors.error)
            }
            Text(String(localized: "story.timeline.inspector.animate.caption",
                        defaultValue: "Étape d'animation : fige position, échelle et opacité à cet instant — l'élément glisse d'une étape à l'autre pendant la lecture.",
                        bundle: .module))
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var kindSystemImage: String {
        switch clip.kind {
        case .video: return "film"
        case .audio: return "waveform"
        case .text:  return "textformat"
        case .image: return "photo"
        }
    }
}
