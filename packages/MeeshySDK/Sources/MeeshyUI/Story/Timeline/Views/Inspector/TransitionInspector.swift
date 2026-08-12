import SwiftUI
import MeeshySDK

/// Contextual sheet shown on tap of a `TransitionBadge`. Edits the underlying
/// `StoryClipTransition` via `ChangeTransitionCommand` / `RemoveTransitionCommand`
/// pushed by the owning timeline.
public struct TransitionInspector: View {

    public struct TransitionSnapshot: Equatable, Sendable {
        public let id: String
        public let fromClipId: String
        public let toClipId: String
        public let kind: StoryTransitionKind
        public let duration: Float
        public init(id: String, fromClipId: String, toClipId: String,
                    kind: StoryTransitionKind, duration: Float) {
            self.id = id; self.fromClipId = fromClipId; self.toClipId = toClipId
            self.kind = kind; self.duration = duration
        }
    }

    public static let durationRange: ClosedRange<Float> = 0.1...2.0

    /// Selectable kinds in the picker. Dissolve is intentionally excluded —
    /// it renders identically to crossfade everywhere it's actually played
    /// (see `ReaderTransitionResolver.liveRenderableTransition`), so offering
    /// it as a distinct option was a false promise (design doc 2026-07-18).
    /// `.dissolve` itself stays in the `StoryTransitionKind` enum for Codable
    /// back-compat with already-published stories.
    public static let availableKinds: [StoryTransitionKind] = [.crossfade]

    public let transition: TransitionSnapshot
    public let isAdvancedEnabled: Bool
    public let onKindChanged: (StoryTransitionKind) -> Void
    public let onDurationChanged: (Float) -> Void
    public let onDelete: () -> Void
    /// Ferme l'inspecteur (désélection) — même affordance que ClipInspector.
    public let onClose: () -> Void
    /// Courbe d'interpolation de la transition (le modèle la porte depuis
    /// Plan 1 — elle n'était pas éditable, figée sur « Easing: Linear »).
    public let onEasingChanged: (StoryEasing) -> Void

    @State private var kind: StoryTransitionKind
    @State private var duration: Float
    @State private var easing: StoryEasing

    public init(transition: TransitionSnapshot,
                isAdvancedEnabled: Bool,
                onKindChanged: @escaping (StoryTransitionKind) -> Void,
                onDurationChanged: @escaping (Float) -> Void,
                onDelete: @escaping () -> Void,
                onClose: @escaping () -> Void = {},
                onEasingChanged: @escaping (StoryEasing) -> Void = { _ in },
                easing: StoryEasing = .linear) {
        self.transition = transition
        self.isAdvancedEnabled = isAdvancedEnabled
        self.onKindChanged = onKindChanged
        self.onDurationChanged = onDurationChanged
        self.onDelete = onDelete
        self.onClose = onClose
        self.onEasingChanged = onEasingChanged
        _kind = State(initialValue: transition.kind)
        _duration = State(initialValue: transition.duration)
        _easing = State(initialValue: easing)
    }

    public func simulateKindCommit(_ value: StoryTransitionKind) {
        onKindChanged(value)
    }

    public func simulateDurationCommit(value: Float) {
        let clamped = min(Self.durationRange.upperBound, max(Self.durationRange.lowerBound, value))
        onDurationChanged(clamped)
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            kindPicker
            durationSlider
            easingPicker
            deleteButton
        }
        .padding(14)
        // Même composition que ClipInspector/KeyframeInspector : matériau
        // sous le contenu (jamais glassEffect, le verre ne peut pas
        // échantillonner du verre — artefacts iOS 26).
        .background(
            RoundedRectangle(cornerRadius: 14).fill(.ultraThinMaterial)
        )
        .frame(maxWidth: 360, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(localized: "story.timeline.a11y.transition", bundle: .module))
    }

    /// Titre lisible — l'ancien header affichait les UUID bruts des deux
    /// clips (« 5D212F9D-6530-… »), inutilisables (retour user 2026-07-11).
    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: "diamond.fill")
                .foregroundStyle(MeeshyColors.warning)
                .accessibilityHidden(true)
            Text(String(localized: "story.timeline.inspector.transition.title",
                        defaultValue: "Transition entre les clips", bundle: .module))
                .font(.headline)
                .lineLimit(1)
            Spacer(minLength: 0)
            Button(action: onClose) {
                Image(systemName: "xmark.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.secondary)
                    .contentShape(Rectangle().inset(by: -8))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "story.timeline.inspector.close", bundle: .module))
        }
    }

    /// No longer a picker — `.crossfade` is the only rendered kind, so there's
    /// nothing to choose between (see `availableKinds`). A legacy `.dissolve`
    /// transition silently normalizes to `.crossfade` the moment its inspector
    /// is opened (`onAppear` below), matching what it already looks like
    /// everywhere it plays.
    private var kindPicker: some View {
        HStack(spacing: 6) {
            Text(String(localized: "story.timeline.transition.crossfade", bundle: .module))
                .font(.subheadline.weight(.semibold))
            Spacer(minLength: 0)
        }
        .onAppear {
            if kind != .crossfade {
                kind = .crossfade
                onKindChanged(.crossfade)
            }
        }
    }

    private var durationSlider: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                // Clé dédiée : l'ancien label réutilisait la clé de TOOLTIP
                // « DURATION %@ » et affichait le format brut (retour user).
                Text(String(localized: "story.timeline.inspector.transition.duration",
                            defaultValue: "Durée", bundle: .module).uppercased())
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.secondary)
                Spacer(minLength: 0)
                Text(String(format: "%.2f s", duration))
                    .font(.system(size: 9, weight: .semibold, design: .monospaced))
                    .foregroundStyle(MeeshyColors.indigo400)
            }
            Slider(value: $duration, in: Self.durationRange, step: 0.05) { editing in
                if !editing { onDurationChanged(duration) }
            }
            .tint(MeeshyColors.indigo500)
            .accessibilityValue(String(format: "%.2fs", duration))
        }
    }

    /// Nom d'affichage localisé d'une courbe d'easing.
    public static func easingDisplayName(_ easing: StoryEasing) -> String {
        switch easing {
        case .linear:
            return String(localized: "story.timeline.inspector.easing.linear", bundle: .module)
        case .easeIn:
            return String(localized: "story.timeline.inspector.easing.easeIn",
                          defaultValue: "Accélère", bundle: .module)
        case .easeOut:
            return String(localized: "story.timeline.inspector.easing.easeOut",
                          defaultValue: "Décélère", bundle: .module)
        case .easeInOut:
            return String(localized: "story.timeline.inspector.easing.easeInOut",
                          defaultValue: "Douce", bundle: .module)
        }
    }

    private var easingPicker: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(String(localized: "story.timeline.inspector.easing.section",
                        defaultValue: "Courbe", bundle: .module).uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
            HStack(spacing: 6) {
                ForEach([StoryEasing.linear, .easeIn, .easeOut, .easeInOut], id: \.self) { candidate in
                    let isOn = easing == candidate
                    Button {
                        easing = candidate
                        onEasingChanged(candidate)
                    } label: {
                        Text(Self.easingDisplayName(candidate))
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Capsule().fill(
                                isOn ? MeeshyColors.indigo500 : MeeshyColors.indigo500.opacity(0.14)))
                            .foregroundStyle(isOn ? .white : MeeshyColors.indigo400)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(isOn ? [.isSelected] : [])
                }
            }
        }
    }

    /// Localized display name for the only easing exposed at launch (linear).
    /// Exposed as a static for testability — `LocalizedStringsBacklogTests`
    /// asserts the bundle resolves both `easing.label` and `easing.linear`.
    public static var linearEasingName: String {
        String(localized: "story.timeline.inspector.easing.linear", bundle: .module)
    }

    /// Builds the "Easing: <name>" notice shown when advanced easings are gated.
    /// `easing.label` carries a `%@` placeholder so each locale controls its own
    /// punctuation (e.g. `Easing : %@` in fr, `Easing: %@` in en).
    public static func easingDisabledNoticeText(easingName: String) -> String {
        String(
            format: String(localized: "story.timeline.inspector.easing.label", bundle: .module),
            easingName
        )
    }

    private var deleteButton: some View {
        Button(role: .destructive, action: onDelete) {
            Label(
                String(localized: "story.timeline.transition.delete", bundle: .module),
                systemImage: "trash"
            )
            .font(.subheadline.weight(.semibold))
        }
        .tint(MeeshyColors.error)
    }
}
