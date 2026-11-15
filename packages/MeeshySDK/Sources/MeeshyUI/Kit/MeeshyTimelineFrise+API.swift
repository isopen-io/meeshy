import SwiftUI

/// Les réglages de la frise, mêmes défauts sur les trois plateformes.
public nonisolated struct MeeshyTimelineFriseOptions: Sendable, Equatable {
    public let snapping: MeeshyTimelineFriseSnapping
    public let step: Double
    public let minimumVisibleSpan: Double
    public let followsPlayhead: Bool
    public let haptic: MeeshyTimelineFriseHaptic

    public init(
        snapping: MeeshyTimelineFriseSnapping = .standard,
        step: Double = 0.5,
        minimumVisibleSpan: Double = MeeshyTimelineFriseViewport.defaultMinimumSpan,
        followsPlayhead: Bool = true,
        haptic: MeeshyTimelineFriseHaptic = .standard
    ) {
        self.snapping = snapping
        self.step = step > 0 && step.isFinite ? step : 0.5
        self.minimumVisibleSpan = minimumVisibleSpan > 0 && minimumVisibleSpan.isFinite
            ? minimumVisibleSpan : MeeshyTimelineFriseViewport.defaultMinimumSpan
        self.followsPlayhead = followsPlayhead
        self.haptic = haptic
    }
}

/// Les rappels de l'hôte. `onWindowCommit` nul ⇒ lecture seule ; `onSeek`
/// nul ⇒ règle inerte ; `onKeyframe` nul ⇒ losanges lus seulement.
public struct MeeshyTimelineFriseCallbacks {
    public let onSelect: (String, Double?) -> Void
    public let onSeek: ((Double) -> Void)?
    public let onWindowCommit: ((String, ClosedRange<Double>, MeeshyTimelineFrisePart) -> Void)?
    public let onKeyframe: ((String, String) -> Void)?
    public let onEditingChanged: ((MeeshyTimelineFrisePart, Bool) -> Void)?

    public init(
        onSelect: @escaping (String, Double?) -> Void,
        onSeek: ((Double) -> Void)? = nil,
        onWindowCommit: ((String, ClosedRange<Double>, MeeshyTimelineFrisePart) -> Void)? = nil,
        onKeyframe: ((String, String) -> Void)? = nil,
        onEditingChanged: ((MeeshyTimelineFrisePart, Bool) -> Void)? = nil
    ) {
        self.onSelect = onSelect
        self.onSeek = onSeek
        self.onWindowCommit = onWindowCommit
        self.onKeyframe = onKeyframe
        self.onEditingChanged = onEditingChanged
    }
}

public extension MeeshyTimelineFrise {
    /// La frise, avec ses deux emplacements optionnels : `transport` (le début
    /// de la ligne du haut, où l'hôte pose lecture et horloge) et `empty` (quand
    /// `tracks` est vide ; sans lui, rien — jamais une aide écrite par le kit).
    init(
        _ names: MeeshyTimelineFriseNames,
        tracks: [MeeshyTimelineFriseTrack],
        duration: Double,
        minimumSpan: Double,
        selectedID: String? = nil,
        onSelect: @escaping (String, Double?) -> Void,
        playhead: PlayheadClock? = nil,
        onSeek: ((Double) -> Void)? = nil,
        onWindowCommit: ((String, ClosedRange<Double>, MeeshyTimelineFrisePart) -> Void)? = nil,
        onKeyframe: ((String, String) -> Void)? = nil,
        timeText: @escaping (Double, MeeshyTimelineFriseTimeStyle) -> String,
        snapping: MeeshyTimelineFriseSnapping = .standard,
        step: Double = 0.5,
        minimumVisibleSpan: Double = MeeshyTimelineFriseViewport.defaultMinimumSpan,
        followsPlayhead: Bool = true,
        haptic: MeeshyTimelineFriseHaptic = .standard,
        onEditingChanged: ((MeeshyTimelineFrisePart, Bool) -> Void)? = nil,
        @ViewBuilder content: @escaping (MeeshyTimelineFriseTrack) -> Content,
        @ViewBuilder transport: () -> Transport,
        @ViewBuilder empty: () -> Empty
    ) {
        assert(minimumSpan > 0, "MeeshyTimelineFrise : l'écart plancher entre deux poignées est obligatoire et positif")
        self.init(
            names: names,
            tracks: tracks,
            rule: MeeshyTimelineFriseRule(duration: duration, minimumSpan: minimumSpan),
            selectedID: selectedID,
            clock: playhead,
            timeText: timeText,
            options: MeeshyTimelineFriseOptions(
                snapping: snapping, step: step, minimumVisibleSpan: minimumVisibleSpan,
                followsPlayhead: followsPlayhead, haptic: haptic
            ),
            calls: MeeshyTimelineFriseCallbacks(
                onSelect: onSelect, onSeek: onSeek, onWindowCommit: onWindowCommit,
                onKeyframe: onKeyframe, onEditingChanged: onEditingChanged
            ),
            content: content,
            transport: transport(),
            empty: empty()
        )
    }
}

public extension MeeshyTimelineFrise where Transport == EmptyView, Empty == EmptyView {
    /// La frise sans ligne du haut à l'hôte ni emplacement vide.
    init(
        _ names: MeeshyTimelineFriseNames,
        tracks: [MeeshyTimelineFriseTrack],
        duration: Double,
        minimumSpan: Double,
        selectedID: String? = nil,
        onSelect: @escaping (String, Double?) -> Void,
        playhead: PlayheadClock? = nil,
        onSeek: ((Double) -> Void)? = nil,
        onWindowCommit: ((String, ClosedRange<Double>, MeeshyTimelineFrisePart) -> Void)? = nil,
        onKeyframe: ((String, String) -> Void)? = nil,
        timeText: @escaping (Double, MeeshyTimelineFriseTimeStyle) -> String,
        snapping: MeeshyTimelineFriseSnapping = .standard,
        step: Double = 0.5,
        minimumVisibleSpan: Double = MeeshyTimelineFriseViewport.defaultMinimumSpan,
        followsPlayhead: Bool = true,
        haptic: MeeshyTimelineFriseHaptic = .standard,
        onEditingChanged: ((MeeshyTimelineFrisePart, Bool) -> Void)? = nil,
        @ViewBuilder content: @escaping (MeeshyTimelineFriseTrack) -> Content
    ) {
        self.init(
            names, tracks: tracks, duration: duration, minimumSpan: minimumSpan, selectedID: selectedID,
            onSelect: onSelect, playhead: playhead, onSeek: onSeek, onWindowCommit: onWindowCommit,
            onKeyframe: onKeyframe, timeText: timeText, snapping: snapping, step: step,
            minimumVisibleSpan: minimumVisibleSpan, followsPlayhead: followsPlayhead, haptic: haptic,
            onEditingChanged: onEditingChanged, content: content, transport: { EmptyView() }, empty: { EmptyView() }
        )
    }
}

public extension MeeshyTimelineFrise where Empty == EmptyView {
    /// La frise avec son `transport`, sans emplacement vide.
    init(
        _ names: MeeshyTimelineFriseNames,
        tracks: [MeeshyTimelineFriseTrack],
        duration: Double,
        minimumSpan: Double,
        selectedID: String? = nil,
        onSelect: @escaping (String, Double?) -> Void,
        playhead: PlayheadClock? = nil,
        onSeek: ((Double) -> Void)? = nil,
        onWindowCommit: ((String, ClosedRange<Double>, MeeshyTimelineFrisePart) -> Void)? = nil,
        onKeyframe: ((String, String) -> Void)? = nil,
        timeText: @escaping (Double, MeeshyTimelineFriseTimeStyle) -> String,
        snapping: MeeshyTimelineFriseSnapping = .standard,
        step: Double = 0.5,
        minimumVisibleSpan: Double = MeeshyTimelineFriseViewport.defaultMinimumSpan,
        followsPlayhead: Bool = true,
        haptic: MeeshyTimelineFriseHaptic = .standard,
        onEditingChanged: ((MeeshyTimelineFrisePart, Bool) -> Void)? = nil,
        @ViewBuilder content: @escaping (MeeshyTimelineFriseTrack) -> Content,
        @ViewBuilder transport: () -> Transport
    ) {
        self.init(
            names, tracks: tracks, duration: duration, minimumSpan: minimumSpan, selectedID: selectedID,
            onSelect: onSelect, playhead: playhead, onSeek: onSeek, onWindowCommit: onWindowCommit,
            onKeyframe: onKeyframe, timeText: timeText, snapping: snapping, step: step,
            minimumVisibleSpan: minimumVisibleSpan, followsPlayhead: followsPlayhead, haptic: haptic,
            onEditingChanged: onEditingChanged, content: content, transport: transport, empty: { EmptyView() }
        )
    }
}
