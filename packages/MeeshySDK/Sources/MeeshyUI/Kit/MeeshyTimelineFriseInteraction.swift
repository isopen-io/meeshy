import Foundation
import CoreGraphics

/// Ce qu'un pas de glissé de barre ou de poignée rend : l'aperçu LOCAL de la
/// fenêtre (jamais écrit chez l'hôte avant le lâcher) et les effets à jouer.
public nonisolated struct MeeshyTimelineFriseStep: Sendable, Equatable {
    public let preview: MeeshyTimelineFriseDrag
    public let effects: [MeeshyTimelineFriseEffect]

    public init(preview: MeeshyTimelineFriseDrag, effects: [MeeshyTimelineFriseEffect]) {
        self.preview = preview
        self.effects = effects
    }
}

/// **L'interaction de la frise en VALEURS** : chaque geste, pas du lecteur
/// d'écran et commande rend ses effets, la vue les joue. Désactivée, rien ne
/// part — ni sélection, ni tête, ni fenêtre, ni haptique. Sans
/// `onWindowCommit` (`canEdit` faux), aucune fenêtre ne bouge ; sans `onSeek`
/// (`canSeek` faux), la règle est inerte.
public nonisolated struct MeeshyTimelineFriseInteraction: Sendable, Equatable {
    public let rule: MeeshyTimelineFriseRule
    public let selectedID: String?
    public let snapping: MeeshyTimelineFriseSnapping
    public let haptic: MeeshyTimelineFriseHaptic
    public let step: Double
    public let isEnabled: Bool
    public let canEdit: Bool
    public let canSeek: Bool
    public let canTouchKeyframes: Bool

    public init(
        rule: MeeshyTimelineFriseRule,
        selectedID: String? = nil,
        snapping: MeeshyTimelineFriseSnapping = .standard,
        haptic: MeeshyTimelineFriseHaptic = .standard,
        step: Double = 0.5,
        isEnabled: Bool = true,
        canEdit: Bool = true,
        canSeek: Bool = true,
        canTouchKeyframes: Bool = false
    ) {
        self.rule = rule
        self.selectedID = selectedID
        self.snapping = snapping
        self.haptic = haptic
        self.step = step > 0 && step.isFinite ? step : 0.5
        self.isEnabled = isEnabled
        self.canEdit = canEdit
        self.canSeek = canSeek
        self.canTouchKeyframes = canTouchKeyframes
    }

    /// Une piste qui se règle : frise active, éditable, piste non verrouillée.
    public func isAdjustable(_ track: MeeshyTimelineFriseTrack) -> Bool {
        isEnabled && canEdit && !track.isLocked
    }

    // MARK: - Choisir

    /// Toucher une piste, sur la barre ou à côté : un losange de la piste choisie
    /// s'il est sous le doigt et que l'hôte les écoute, sinon le choix et la tête.
    public func tap(
        _ track: MeeshyTimelineFriseTrack,
        at time: Double,
        pointsPerSecond: CGFloat
    ) -> [MeeshyTimelineFriseEffect] {
        guard isEnabled else { return [] }
        if canTouchKeyframes, track.id == selectedID,
           let key = MeeshyTimelineFriseRule.keyframe(near: time, in: track.keyframes, pointsPerSecond: pointsPerSecond) {
            return [.keyframe(track.id, key.id)]
        }
        return [.select(track.id, time)] + playable(.light)
    }

    /// Activer la piste au lecteur d'écran ou au clavier : le choix, sans temps.
    public func activate(_ track: MeeshyTimelineFriseTrack) -> [MeeshyTimelineFriseEffect] {
        guard isEnabled else { return [] }
        return [.select(track.id, nil)] + playable(.light)
    }

    // MARK: - Glisser une barre, tirer une poignée

    /// Le doigt part : `editing(true)`, et la piste se choisit si elle ne l'était pas.
    public func beginDrag(_ track: MeeshyTimelineFriseTrack, part: MeeshyTimelineFrisePart) -> [MeeshyTimelineFriseEffect] {
        guard isAdjustable(track), part != .playhead else { return [] }
        let choice: [MeeshyTimelineFriseEffect] = track.id == selectedID ? [] : [.select(track.id, nil)] + playable(.light)
        return [.editing(part, true)] + choice
    }

    /// Le doigt glisse de `delta` secondes depuis la fenêtre d'origine : l'aperçu
    /// aimanté, et un tic au seul passage « libre → accroché ».
    public func drag(
        _ track: MeeshyTimelineFriseTrack,
        part: MeeshyTimelineFrisePart,
        by delta: Double,
        candidates: [SnapCandidate],
        tolerance: Double,
        wasSnapped: Bool
    ) -> MeeshyTimelineFriseStep {
        guard isAdjustable(track), part != .playhead else {
            return MeeshyTimelineFriseStep(preview: MeeshyTimelineFriseDrag(range: track.range, snappedTime: nil), effects: [])
        }
        let preview = snapping == .none
            ? MeeshyTimelineFriseDrag(range: rule.dragged(track.range, part: part, by: delta), snappedTime: nil)
            : rule.snapped(track.range, part: part, by: delta, candidates: candidates, tolerance: tolerance)
        return MeeshyTimelineFriseStep(preview: preview, effects: preview.isSnapped && !wasSnapped ? playable(.light) : [])
    }

    /// Le doigt se lève : la fenêtre part UNE fois, si elle a changé, puis `editing(false)`.
    public func release(
        _ track: MeeshyTimelineFriseTrack,
        part: MeeshyTimelineFrisePart,
        preview: ClosedRange<Double>?
    ) -> [MeeshyTimelineFriseEffect] {
        guard isAdjustable(track), part != .playhead else { return [] }
        let commit: [MeeshyTimelineFriseEffect] = preview.map { $0 == track.range ? [] : [.commit(track.id, $0, part)] } ?? []
        return commit + [.editing(part, false)]
    }

    /// Le système annule le geste, ou la frise disparaît doigt posé : rien n'est écrit.
    public func cancel(_ part: MeeshyTimelineFrisePart) -> [MeeshyTimelineFriseEffect] {
        [.editing(part, false)]
    }

    // MARK: - La règle

    /// Toucher ou glisser la règle : la tête s'y pose, au plus une fois par
    /// instant, et un tic quand elle franchit une graduation majeure sous le doigt.
    public func scrub(to time: Double, previous: Double?, majorStep: Double) -> [MeeshyTimelineFriseEffect] {
        guard isEnabled, canSeek else { return [] }
        let target = clampedTime(time)
        guard let previous else { return [.editing(.playhead, true), .seek(target)] }
        guard target != previous else { return [] }
        let tick = MeeshyTimelineFriseRuler.crossesMajor(from: previous, to: target, step: majorStep) ? playable(.light) : []
        return [.seek(target)] + tick
    }

    public func endScrub(wasScrubbing: Bool) -> [MeeshyTimelineFriseEffect] {
        wasScrubbing ? [.editing(.playhead, false)] : []
    }

    /// Un cran de la règle au lecteur d'écran ou au clavier.
    public func adjustPlayhead(from current: Double, to requested: Double) -> [MeeshyTimelineFriseEffect] {
        guard isEnabled, canSeek else { return [] }
        let target = clampedTime(requested)
        guard target != current else { return [] }
        return [.editing(.playhead, true), .seek(target), .editing(.playhead, false)]
    }

    public func playheadCommand(_ command: MeeshyTimelineFriseCommand, current: Double) -> [MeeshyTimelineFriseEffect] {
        switch command {
        case .arrowLeft: return adjustPlayhead(from: current, to: current - step)
        case .arrowRight: return adjustPlayhead(from: current, to: current + step)
        case .fineLeft: return adjustPlayhead(from: current, to: current - MeeshyTimelineFriseRule.fineStep)
        case .fineRight: return adjustPlayhead(from: current, to: current + MeeshyTimelineFriseRule.fineStep)
        case .home: return adjustPlayhead(from: current, to: 0)
        case .end: return adjustPlayhead(from: current, to: rule.duration)
        case .choose, .zoomIn, .zoomOut, .zoomReset: return []
        }
    }

    // MARK: - Les six pas, le clavier

    /// Un des six pas nommés : la fenêtre part encadrée d'une paire vrai / faux
    /// (un pas d'annulation), puis la nouvelle fenêtre est annoncée.
    public func nudge(_ track: MeeshyTimelineFriseTrack, _ nudge: MeeshyTimelineFriseNudge) -> [MeeshyTimelineFriseEffect] {
        commitStep(track, part: nudge.part, to: rule.adjusted(track.range, part: nudge.part, up: nudge.isLater, step: step))
    }

    /// Une commande au clavier sur une piste (`.move`) ou sur l'une de ses poignées.
    public func trackCommand(
        _ command: MeeshyTimelineFriseCommand,
        on track: MeeshyTimelineFriseTrack,
        part: MeeshyTimelineFrisePart
    ) -> [MeeshyTimelineFriseEffect] {
        let range = track.range
        switch command {
        case .choose: return activate(track)
        case .arrowLeft: return commitStep(track, part: part, to: rule.adjusted(range, part: part, up: false, step: step))
        case .arrowRight: return commitStep(track, part: part, to: rule.adjusted(range, part: part, up: true, step: step))
        case .fineLeft:
            return commitStep(track, part: part, to: rule.adjusted(range, part: part, up: false, step: MeeshyTimelineFriseRule.fineStep))
        case .fineRight:
            return commitStep(track, part: part, to: rule.adjusted(range, part: part, up: true, step: MeeshyTimelineFriseRule.fineStep))
        case .home: return commitStep(track, part: part, to: rule.jumped(range, part: part, toStart: true))
        case .end: return commitStep(track, part: part, to: rule.jumped(range, part: part, toStart: false))
        case .zoomIn, .zoomOut, .zoomReset: return []
        }
    }

    private func commitStep(
        _ track: MeeshyTimelineFriseTrack,
        part: MeeshyTimelineFrisePart,
        to target: ClosedRange<Double>
    ) -> [MeeshyTimelineFriseEffect] {
        guard isAdjustable(track), part != .playhead, target != track.range else { return [] }
        return [.editing(part, true), .commit(track.id, target, part), .editing(part, false), .announce(track.id, target)]
    }

    private func clampedTime(_ time: Double) -> Double {
        max(0, min(rule.duration, time.isFinite ? time : 0))
    }

    private func playable(_ kind: MeeshyTimelineFriseHapticKind) -> [MeeshyTimelineFriseEffect] {
        haptic == .standard && isEnabled ? [.haptic(kind)] : []
    }
}
