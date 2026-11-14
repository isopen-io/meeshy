import Foundation

/// Ce qu'un pas de glissé rend : les effets à jouer, et si la poignée est
/// maintenant à une butée (pour ne tiquer qu'une fois par arrivée).
public nonisolated struct MeeshyTrimTrackStep: Sendable, Equatable {
    public let effects: [MeeshyTrimTrackEffect]
    public let isAtStop: Bool

    public init(effects: [MeeshyTrimTrackEffect], isAtStop: Bool) {
        self.effects = effects
        self.isAtStop = isAtStop
    }
}

/// L'interaction d'une piste de coupe en VALEURS : chaque geste et chaque
/// commande rend ses effets, la vue les joue. Désactivée, rien ne part — ni
/// plage, ni édition, ni haptique.
public nonisolated struct MeeshyTrimTrackInteraction: Sendable, Equatable {
    public let rule: MeeshyTrimTrackRule
    public let selection: MeeshyTrimTrackSelection
    public let haptic: MeeshyTrimTrackHaptic
    public let step: Double
    public let isEnabled: Bool
    public let canSeek: Bool

    public init(
        rule: MeeshyTrimTrackRule,
        selection: MeeshyTrimTrackSelection = .kept,
        haptic: MeeshyTrimTrackHaptic = .standard,
        step: Double = 0.1,
        isEnabled: Bool = true,
        canSeek: Bool = true
    ) {
        self.rule = rule
        self.selection = selection
        self.haptic = haptic
        self.step = step > 0 ? step : 0.1
        self.isEnabled = isEnabled
        self.canSeek = canSeek
    }

    private var handlesAreLive: Bool { isEnabled && rule.canTrim }

    // MARK: - Poignées

    /// Le doigt glisse une poignée vers `requested` : `editing(true)` au premier
    /// contact, la plage bornée seulement si elle change, un tic à l'arrivée en butée.
    public func drag(
        _ part: MeeshyTrimTrackPart,
        to requested: Double,
        range: ClosedRange<Double>,
        isEditing: Bool,
        wasAtStop: Bool
    ) -> MeeshyTrimTrackStep {
        guard handlesAreLive, part != .playhead else { return MeeshyTrimTrackStep(effects: [], isAtStop: wasAtStop) }
        let next = rule.moving(part, to: requested, range: range)
        let stop = rule.stop(part: part, requested: requested, range: range)
        let startedAtStop = isEditing ? wasAtStop : rule.stop(part: part, requested: time(of: part, in: range), range: range) != nil
        var effects: [MeeshyTrimTrackEffect] = isEditing ? [] : [.editing(part, true)]
        if rule.shouldEmit(previous: range, next: next) { effects.append(.range(next)) }
        if stop != nil, !startedAtStop { effects += playable(.light) }
        return MeeshyTrimTrackStep(effects: effects, isAtStop: stop != nil)
    }

    /// L'appui long de 0,4 s : la précision. Un tic `medium`, et `editing(true)` s'il n'a pas commencé.
    public func beginPrecision(_ part: MeeshyTrimTrackPart, isEditing: Bool) -> [MeeshyTrimTrackEffect] {
        guard handlesAreLive, part != .playhead else { return [] }
        return (isEditing ? [] : [.editing(part, true)]) + playable(.medium)
    }

    /// Le doigt se lève, le geste est annulé ou la piste disparaît doigt posé.
    public func release(_ part: MeeshyTrimTrackPart, isEditing: Bool) -> [MeeshyTrimTrackEffect] {
        isEditing ? [.editing(part, false)] : []
    }

    // MARK: - Tête

    /// Un toucher sur la piste : la tête s'y pose, bornée, avec un tic `light`.
    public func tap(at time: Double, range: ClosedRange<Double>) -> [MeeshyTrimTrackEffect] {
        guard isEnabled, canSeek else { return [] }
        return [.seek(rule.playhead(time, in: range, selection: selection))] + playable(.light)
    }

    /// Le doigt glisse la tête : `onSeek` à chaque image, bornée, seulement si elle bouge.
    public func dragPlayhead(
        to requested: Double,
        range: ClosedRange<Double>,
        current: Double,
        isEditing: Bool
    ) -> [MeeshyTrimTrackEffect] {
        guard isEnabled, canSeek else { return [] }
        let target = rule.playhead(requested, in: range, selection: selection)
        var effects: [MeeshyTrimTrackEffect] = isEditing ? [] : [.editing(.playhead, true)]
        if target != current || !isEditing { effects.append(.seek(target)) }
        return effects
    }

    // MARK: - Lecteur d'écran et clavier

    /// Le balayage du lecteur d'écran : `step` pour une poignée, une seconde pour la tête.
    public func accessibilityAdjust(
        _ part: MeeshyTrimTrackPart,
        up: Bool,
        range: ClosedRange<Double>,
        playhead: Double
    ) -> [MeeshyTrimTrackEffect] {
        let size = part == .playhead ? MeeshyTrimTrackRule.coarseStep : step
        return commit(part, to: rule.adjusted(part: part, up: up, step: size, range: range, playhead: playhead, selection: selection), from: (range, playhead))
    }

    public func perform(
        _ command: MeeshyTrimTrackCommand,
        on part: MeeshyTrimTrackPart,
        range: ClosedRange<Double>,
        playhead: Double
    ) -> [MeeshyTrimTrackEffect] {
        let target: MeeshyTrimTrackPosition
        switch command {
        case .arrowLeft: target = rule.adjusted(part: part, up: false, step: step, range: range, playhead: playhead, selection: selection)
        case .arrowRight: target = rule.adjusted(part: part, up: true, step: step, range: range, playhead: playhead, selection: selection)
        case .fineLeft: target = rule.adjusted(part: part, up: false, step: MeeshyTrimTrackRule.fineStep, range: range, playhead: playhead, selection: selection)
        case .fineRight: target = rule.adjusted(part: part, up: true, step: MeeshyTrimTrackRule.fineStep, range: range, playhead: playhead, selection: selection)
        case .pageDown: target = rule.adjusted(part: part, up: false, step: MeeshyTrimTrackRule.coarseStep, range: range, playhead: playhead, selection: selection)
        case .pageUp: target = rule.adjusted(part: part, up: true, step: MeeshyTrimTrackRule.coarseStep, range: range, playhead: playhead, selection: selection)
        case .home: target = jump(part, toStart: true, range: range, playhead: playhead)
        case .end: target = jump(part, toStart: false, range: range, playhead: playhead)
        }
        return commit(part, to: target, from: (range, playhead))
    }

    /// Début / Fin : la butée la plus lointaine de la partie, dans ses limites.
    private func jump(_ part: MeeshyTrimTrackPart, toStart: Bool, range: ClosedRange<Double>, playhead: Double) -> MeeshyTrimTrackPosition {
        let far = toStart ? -rule.duration - 1 : rule.duration + 1
        switch part {
        case .playhead:
            return MeeshyTrimTrackPosition(range: range, playhead: rule.playhead(far, in: range, selection: selection))
        case .start, .end:
            return MeeshyTrimTrackPosition(range: rule.moving(part, to: far, range: range), playhead: playhead)
        }
    }

    /// Un ajustement est encadré d'une paire vrai / faux : un pas d'annulation.
    private func commit(
        _ part: MeeshyTrimTrackPart,
        to target: MeeshyTrimTrackPosition,
        from current: (range: ClosedRange<Double>, playhead: Double)
    ) -> [MeeshyTrimTrackEffect] {
        guard isEnabled, part == .playhead ? canSeek : rule.canTrim else { return [] }
        if part == .playhead {
            guard target.playhead != current.playhead else { return [] }
            return [.editing(.playhead, true), .seek(target.playhead), .editing(.playhead, false)]
        }
        guard rule.shouldEmit(previous: current.range, next: target.range) else { return [] }
        let arrived = rule.stop(part: part, requested: part == .start ? target.range.lowerBound : target.range.upperBound, range: target.range) != nil
        return [.editing(part, true), .range(target.range)] + (arrived ? playable(.light) : []) + [.editing(part, false)]
    }

    private func time(of part: MeeshyTrimTrackPart, in range: ClosedRange<Double>) -> Double {
        part == .start ? range.lowerBound : range.upperBound
    }

    private func playable(_ kind: MeeshyTrimTrackHapticKind) -> [MeeshyTrimTrackEffect] {
        haptic == .standard && isEnabled ? [.haptic(kind)] : []
    }
}
